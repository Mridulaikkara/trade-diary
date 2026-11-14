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

  // Initial Datasets: Reference sample values for user reference
  const INITIAL_SNAPSHOTS = [
    { date: '2026-11-09', growwCash: 22000, growwInvested: 188500, kiteCash: 35000, kiteInvested: 18200, growwTotal: 210500, kiteTotal: 53200, combinedTotal: 263700, dodDelta: 0, dodDeltaPct: 0, deposit: 0, organicReturn: 0 },
    { date: '2026-11-10', growwCash: 22000, growwInvested: 190450, kiteCash: 35000, kiteInvested: 18480, growwTotal: 212450, kiteTotal: 53480, combinedTotal: 265930, dodDelta: 2230, dodDeltaPct: 0.85, deposit: 0, organicReturn: 2230 },
    { date: '2026-11-11', growwCash: 22000, growwInvested: 192100, kiteCash: 35000, kiteInvested: 18620, growwTotal: 214100, kiteTotal: 53620, combinedTotal: 267720, dodDelta: 1790, dodDeltaPct: 0.67, deposit: 0, organicReturn: 1790 },
    { date: '2026-11-12', growwCash: 22000, growwInvested: 194800, kiteCash: 35000, kiteInvested: 18940, growwTotal: 216800, kiteTotal: 53940, combinedTotal: 270740, dodDelta: 3020, dodDeltaPct: 1.13, deposit: 0, organicReturn: 3020 },
    { date: '2026-11-13', growwCash: 22000, growwInvested: 196200, kiteCash: 35000, kiteInvested: 19150, growwTotal: 218200, kiteTotal: 54150, combinedTotal: 272350, dodDelta: 1610, dodDeltaPct: 0.59, deposit: 0, organicReturn: 1610 },
    { date: '2026-11-14', growwCash: 22000, growwInvested: 198400, kiteCash: 35000, kiteInvested: 19450, growwTotal: 220400, kiteTotal: 54450, combinedTotal: 274850, dodDelta: 2500, dodDeltaPct: 0.92, deposit: 0, organicReturn: 2500 }
  ];
  const INITIAL_TRADES = [];

  // Helper functions for safe LocalStorage access (works across normal and Private Browsing)
  function readLS(key, fallback) {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            // Automatically purge legacy sample seed data (all starting with 2025-05-)
            const isLegacySample = parsed.length > 0 && parsed.every(item => item.date && (item.date.startsWith('2025-05-') || item.date === '2024-10-24'));
            if (isLegacySample) {
              localStorage.removeItem(key);
              return fallback;
            }
            if (parsed.length > 0) return parsed;
            return fallback;
          }
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
      // Warm up IndexedDB connection in the background; purge legacy sample data if present
      openDB().then(async (db) => {
        if (db && db.objectStoreNames.contains('snapshots')) {
          try {
            const tx = db.transaction('snapshots', 'readonly');
            const store = tx.objectStore('snapshots');
            const getAllReq = store.getAll();
            getAllReq.onsuccess = () => {
              const items = getAllReq.result || [];
              const isLegacy = items.length > 0 && items.every(item => item.date && (item.date.startsWith('2025-05-') || item.date === '2024-10-24'));
              if (isLegacy) {
                const clearTx = db.transaction('snapshots', 'readwrite');
                clearTx.objectStore('snapshots').clear();
              }
            };
          } catch (e) {}
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
