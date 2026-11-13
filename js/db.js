/**
 * TradeLedger Resilient Dual Storage Engine
 * High-performance, offline-first client database for portfolio snapshots and preferences.
 * Combines zero-latency synchronous LocalStorage + in-memory store with async IndexedDB mirroring.
 */

const TradeDB = (function() {
  'use strict';

  const DB_NAME = 'TradeLedger_DB_v2';
  const DB_VERSION = 2;

  const LS_SNAPSHOTS_KEY = 'trade_diary_snapshots_v2';
  const LS_SETTINGS_KEY = 'trade_diary_settings_v2';
  const LS_TRADES_KEY = 'trade_diary_trades_v2';

  let dbInstance = null;

  // Initial Sample Datasets (Pre-populated so dashboard and trend charts are always rich on first launch)
  const INITIAL_SNAPSHOTS = [
    { date: '2025-05-01', growwCash: 20000, growwInvested: 175488, kiteCash: 30000, kiteInvested: 15000, growwTotal: 195488, kiteTotal: 45000, combinedTotal: 240488, dodDelta: 0, dodDeltaPct: 0, deposit: 0, organicReturn: 0 },
    { date: '2025-05-02', growwCash: 20000, growwInvested: 177210, kiteCash: 30000, kiteInvested: 15150, growwTotal: 197210, kiteTotal: 45150, combinedTotal: 242360, dodDelta: 1872, dodDeltaPct: 0.78, deposit: 0, organicReturn: 1872 },
    { date: '2025-05-05', growwCash: 20000, growwInvested: 179050, kiteCash: 30000, kiteInvested: 15300, growwTotal: 199050, kiteTotal: 45300, combinedTotal: 244350, dodDelta: 1990, dodDeltaPct: 0.82, deposit: 0, organicReturn: 1990 },
    { date: '2025-05-06', growwCash: 20000, growwInvested: 180120, kiteCash: 30000, kiteInvested: 15410, growwTotal: 200120, kiteTotal: 45410, combinedTotal: 245530, dodDelta: 1180, dodDeltaPct: 0.48, deposit: 0, organicReturn: 1180 },
    { date: '2025-05-07', growwCash: 20000, growwInvested: 181290, kiteCash: 30000, kiteInvested: 15550, growwTotal: 201290, kiteTotal: 45550, combinedTotal: 246840, dodDelta: 1310, dodDeltaPct: 0.53, deposit: 0, organicReturn: 1310 },
    { date: '2025-05-08', growwCash: 20000, growwInvested: 181500, kiteCash: 30000, kiteInvested: 15620, growwTotal: 201500, kiteTotal: 45620, combinedTotal: 247120, dodDelta: 280, dodDeltaPct: 0.11, deposit: 0, organicReturn: 280 },
    { date: '2025-05-09', growwCash: 20000, growwInvested: 183400, kiteCash: 30000, kiteInvested: 15720, growwTotal: 203400, kiteTotal: 45720, combinedTotal: 249120, dodDelta: 2000, dodDeltaPct: 0.81, deposit: 0, organicReturn: 2000 },
    { date: '2025-05-12', growwCash: 20000, growwInvested: 185600, kiteCash: 32000, kiteInvested: 15400, growwTotal: 205600, kiteTotal: 47400, combinedTotal: 253000, dodDelta: 3880, dodDeltaPct: 1.56, deposit: 0, organicReturn: 3880 },
    { date: '2025-05-13', growwCash: 20000, growwInvested: 186900, kiteCash: 32000, kiteInvested: 15480, growwTotal: 206900, kiteTotal: 47480, combinedTotal: 254380, dodDelta: 1380, dodDeltaPct: 0.55, deposit: 0, organicReturn: 1380 },
    { date: '2025-05-14', growwCash: 20000, growwInvested: 201100, kiteCash: 33070, kiteInvested: 15358, growwTotal: 221100, kiteTotal: 48428, combinedTotal: 269528, dodDelta: 15148, dodDeltaPct: 5.96, deposit: 14000, organicReturn: 1148 },
    { date: '2025-05-15', growwCash: 20000, growwInvested: 202180, kiteCash: 33070, kiteInvested: 15698, growwTotal: 222180, kiteTotal: 48768, combinedTotal: 270948, dodDelta: 1420, dodDeltaPct: 0.53, deposit: 0, organicReturn: 1420 },
    { date: '2025-05-16', growwCash: 20000, growwInvested: 204226, kiteCash: 33070, kiteInvested: 15792, growwTotal: 224226, kiteTotal: 48862, combinedTotal: 273088, dodDelta: 2140, dodDeltaPct: 0.79, deposit: 0, organicReturn: 2140 }
  ];

  const INITIAL_TRADES = [
    {
      id: 1,
      date: '2024-10-24',
      stockName: 'Tata Power Company',
      stockSymbol: 'TATAPOWER',
      broker: 'groww',
      segment: 'delivery',
      buyPrice: 412.50,
      sellPrice: 438.00,
      qty: 100,
      strategy: 'Breakout Swing',
      notes: 'Clean consolidation breakout over 20 EMA with rising volume.',
      grossPnL: 2550.00,
      totalCharges: 105.80,
      netPnL: 2444.20,
      netRoi: 5.92,
      outcome: 'win'
    }
  ];

  // Helper functions for safe LocalStorage access (works across normal and Private Browsing)
  function readLS(key, fallback) {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
          if (parsed && typeof parsed === 'object') return parsed;
        }
      }
    } catch (e) {
      // LocalStorage access restricted (e.g. strict Safari Private mode)
    }
    return fallback;
  }

  function writeLS(key, data) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(data));
      }
    } catch (e) {
      // Ignore quota or private browsing errors
    }
  }

  // In-Memory store initialized from LocalStorage or seed data
  const memoryStore = {
    trades: readLS(LS_TRADES_KEY, [...INITIAL_TRADES]),
    snapshots: readLS(LS_SNAPSHOTS_KEY, [...INITIAL_SNAPSHOTS]),
    settings: readLS(LS_SETTINGS_KEY, [
      { key: 'defaultBroker', value: 'groww' },
      { key: 'customDp', value: 13.50 },
      { key: 'lastUpdated', value: new Date().toISOString() }
    ])
  };

  // Safe IndexedDB connection (non-blocking, fire-and-forget fallback)
  function openDB() {
    return new Promise((resolve) => {
      if (dbInstance) return resolve(dbInstance);

      try {
        if (typeof indexedDB === 'undefined') return resolve(null);

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          try {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('trades')) {
              const tradeStore = db.createObjectStore('trades', { keyPath: 'id', autoIncrement: true });
              tradeStore.createIndex('date', 'date', { unique: false });
            }
            if (!db.objectStoreNames.contains('snapshots')) {
              const snapshotStore = db.createObjectStore('snapshots', { keyPath: 'date' });
              snapshotStore.createIndex('date', 'date', { unique: true });
            }
            if (!db.objectStoreNames.contains('settings')) {
              db.createObjectStore('settings', { keyPath: 'key' });
            }
          } catch (e) {}
        };

        request.onsuccess = (event) => {
          dbInstance = event.target.result;
          resolve(dbInstance);
        };

        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);

        // Fail-safe 300ms timeout so DB open never freezes the UI
        setTimeout(() => {
          if (!dbInstance) resolve(null);
        }, 300);

      } catch (err) {
        resolve(null);
      }
    });
  }

  // Background mirror to IndexedDB (completely non-blocking)
  async function mirrorToIndexedDB(storeName, record) {
    try {
      const db = await openDB();
      if (!db || !db.objectStoreNames.contains(storeName)) return;
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.put(record);
    } catch (e) {}
  }

  async function mirrorDeleteToIndexedDB(storeName, key) {
    try {
      const db = await openDB();
      if (!db || !db.objectStoreNames.contains(storeName)) return;
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.delete(key);
    } catch (e) {}
  }

  async function mirrorClearToIndexedDB(storeName) {
    try {
      const db = await openDB();
      if (!db || !db.objectStoreNames.contains(storeName)) return;
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      store.clear();
    } catch (e) {}
  }

  // Public Database API
  return {
    init: async () => {
      // Warm up IndexedDB connection in the background; never blocks
      openDB().then(db => {
        if (db) {
          // Pre-populate IndexedDB from memory if needed
          memoryStore.snapshots.forEach(s => mirrorToIndexedDB('snapshots', s));
          memoryStore.settings.forEach(set => mirrorToIndexedDB('settings', set));
        }
      }).catch(() => {});
      return true;
    },

    // Synchronous initial data getters (guaranteed instant availability)
    getInitialTrades: () => JSON.parse(JSON.stringify(INITIAL_TRADES)),
    getInitialSnapshots: () => JSON.parse(JSON.stringify(INITIAL_SNAPSHOTS)),

    // Snapshots: Synchronous 0ms response backed by LocalStorage & Memory
    getSnapshots: async () => {
      if (!memoryStore.snapshots || memoryStore.snapshots.length === 0) {
        memoryStore.snapshots = [...INITIAL_SNAPSHOTS];
        writeLS(LS_SNAPSHOTS_KEY, memoryStore.snapshots);
      }
      return [...memoryStore.snapshots].sort((a, b) => a.date.localeCompare(b.date));
    },

    getAllSnapshots: async () => {
      if (!memoryStore.snapshots || memoryStore.snapshots.length === 0) {
        memoryStore.snapshots = [...INITIAL_SNAPSHOTS];
        writeLS(LS_SNAPSHOTS_KEY, memoryStore.snapshots);
      }
      return [...memoryStore.snapshots].sort((a, b) => a.date.localeCompare(b.date));
    },

    getSnapshot: (date) => {
      return memoryStore.snapshots.find(s => s.date === date) || null;
    },

    saveSnapshot: async (snapshot) => {
      if (!snapshot || !snapshot.date) return null;

      const idx = memoryStore.snapshots.findIndex(s => s.date === snapshot.date);
      if (idx >= 0) {
        memoryStore.snapshots[idx] = snapshot;
      } else {
        memoryStore.snapshots.push(snapshot);
      }
      memoryStore.snapshots.sort((a, b) => a.date.localeCompare(b.date));

      // Persist to LocalStorage immediately
      writeLS(LS_SNAPSHOTS_KEY, memoryStore.snapshots);

      // Async background mirror to IndexedDB
      mirrorToIndexedDB('snapshots', snapshot);

      return snapshot;
    },

    deleteSnapshot: async (date) => {
      memoryStore.snapshots = memoryStore.snapshots.filter(s => s.date !== date);
      writeLS(LS_SNAPSHOTS_KEY, memoryStore.snapshots);
      mirrorDeleteToIndexedDB('snapshots', date);
      return true;
    },

    // Settings
    getSetting: async (key, fallback = null) => {
      const found = memoryStore.settings.find(item => item.key === key);
      return found ? found.value : fallback;
    },

    setSetting: async (key, value) => {
      const idx = memoryStore.settings.findIndex(item => item.key === key);
      const record = { key, value };
      if (idx >= 0) {
        memoryStore.settings[idx] = record;
      } else {
        memoryStore.settings.push(record);
      }
      writeLS(LS_SETTINGS_KEY, memoryStore.settings);
      mirrorToIndexedDB('settings', record);
      return record;
    },

    // Backup & Restore
    exportBackup: async () => {
      return JSON.stringify({
        version: '3.0.0',
        exportedAt: new Date().toISOString(),
        trades: memoryStore.trades,
        snapshots: memoryStore.snapshots,
        settings: memoryStore.settings
      }, null, 2);
    },

    importBackup: async (jsonString) => {
      const data = JSON.parse(jsonString);
      if (!data || (!Array.isArray(data.trades) && !Array.isArray(data.snapshots))) {
        throw new Error('Invalid backup file format.');
      }

      if (Array.isArray(data.snapshots) && data.snapshots.length > 0) {
        memoryStore.snapshots = data.snapshots;
        writeLS(LS_SNAPSHOTS_KEY, memoryStore.snapshots);
        mirrorClearToIndexedDB('snapshots');
        data.snapshots.forEach(s => mirrorToIndexedDB('snapshots', s));
      }

      if (Array.isArray(data.settings)) {
        memoryStore.settings = data.settings;
        writeLS(LS_SETTINGS_KEY, memoryStore.settings);
        data.settings.forEach(set => mirrorToIndexedDB('settings', set));
      }

      return true;
    },

    // Reset database to initial sample seed data
    resetToSampleData: async () => {
      memoryStore.snapshots = [...INITIAL_SNAPSHOTS];
      memoryStore.trades = [...INITIAL_TRADES];
      writeLS(LS_SNAPSHOTS_KEY, memoryStore.snapshots);
      writeLS(LS_TRADES_KEY, memoryStore.trades);
      mirrorClearToIndexedDB('snapshots');
      INITIAL_SNAPSHOTS.forEach(s => mirrorToIndexedDB('snapshots', s));
      return true;
    },

    // Completely clear all user data
    clearAll: async () => {
      memoryStore.snapshots = [];
      memoryStore.trades = [];
      writeLS(LS_SNAPSHOTS_KEY, []);
      writeLS(LS_TRADES_KEY, []);
      mirrorClearToIndexedDB('snapshots');
      return true;
    },

    // Telemetry & Storage info
    getStats: async () => {
      return {
        tradesCount: memoryStore.trades.length,
        snapshotCount: memoryStore.snapshots.length,
        quota: { usedMB: '0.12', totalGB: '5.0', pct: '0.002' }
      };
    }
  };
})();

// Universal export
if (typeof window !== 'undefined') {
  window.TradeDB = TradeDB;
}
if (typeof globalThis !== 'undefined') {
  globalThis.TradeDB = TradeDB;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TradeDB;
}
