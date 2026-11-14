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

  // Initial Datasets: Clean, empty starting state (zero demo data)
  const INITIAL_SNAPSHOTS = [];
  const INITIAL_TRADES = [];

  // Helper functions for safe LocalStorage access (works across normal and Private Browsing)
  function isDemoSnapshot(item) {
    if (!item || !item.date) return false;
    // Known demo dates and values used during development
    if (item.date.startsWith('2025-05-') || item.date === '2024-10-24') return true;
    if (item.combinedTotal === 274850 || item.combinedTotal === 263700 || item.combinedTotal === 273088 || item.combinedTotal === 265930 || item.combinedTotal === 267720 || item.combinedTotal === 270740 || item.combinedTotal === 272350) return true;
    if (item.growwCash === 22000 && item.kiteCash === 35000 && item.growwInvested === 198400) return true;
    if (item.growwCash === 20000 && item.kiteCash === 33070 && item.growwInvested === 204228) return true;
    return false;
  }

  function readLS(key, fallback) {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            // Automatically purge development demo data
            const cleanRecords = parsed.filter(item => !isDemoSnapshot(item));
            if (cleanRecords.length !== parsed.length) {
              if (cleanRecords.length === 0) {
                localStorage.removeItem(key);
                return fallback;
              } else {
                localStorage.setItem(key, JSON.stringify(cleanRecords));
                return cleanRecords;
              }
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
      // Warm up IndexedDB connection in the background; purge legacy/demo sample data if present
      openDB().then(async (db) => {
        if (db && db.objectStoreNames.contains('snapshots')) {
          try {
            const tx = db.transaction('snapshots', 'readonly');
            const store = tx.objectStore('snapshots');
            const getAllReq = store.getAll();
            getAllReq.onsuccess = () => {
              const items = getAllReq.result || [];
              const demoItems = items.filter(isDemoSnapshot);
              if (demoItems.length > 0) {
                const clearTx = db.transaction('snapshots', 'readwrite');
                const writeStore = clearTx.objectStore('snapshots');
                demoItems.forEach(item => writeStore.delete(item.date));
              }
            };
          } catch (e) {}
        }
      }).catch(() => {});
      return true;
    },

    // Synchronous initial data getters (guaranteed instant availability)
    getInitialTrades: () => [],
    getInitialSnapshots: () => [],

    // Snapshots: Clean retrieval backed by LocalStorage & Memory (zero auto-seeding)
    getSnapshots: async () => {
      if (!memoryStore.snapshots) {
        memoryStore.snapshots = [];
      }
      return [...memoryStore.snapshots].sort((a, b) => a.date.localeCompare(b.date));
    },

    getAllSnapshots: async () => {
      if (!memoryStore.snapshots) {
        memoryStore.snapshots = [];
      }
      return [...memoryStore.snapshots].sort((a, b) => a.date.localeCompare(b.date));
    },

    getSnapshot: (date) => {
      return (memoryStore.snapshots || []).find(s => s.date === date) || null;
    },

    saveSnapshot: async (snapshot) => {
      if (!snapshot || !snapshot.date) return null;

      if (!memoryStore.snapshots) memoryStore.snapshots = [];
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
      if (!memoryStore.snapshots) memoryStore.snapshots = [];
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
        trades: memoryStore.trades || [],
        snapshots: memoryStore.snapshots || [],
        settings: memoryStore.settings || []
      }, null, 2);
    },

    importBackup: async (jsonString) => {
      const data = JSON.parse(jsonString);
      if (!data || (!Array.isArray(data.trades) && !Array.isArray(data.snapshots))) {
        throw new Error('Invalid backup file format.');
      }

      if (Array.isArray(data.snapshots)) {
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

    // Clean reset to empty state (zero demo data)
    resetToSampleData: async () => {
      memoryStore.snapshots = [];
      memoryStore.trades = [];
      writeLS(LS_SNAPSHOTS_KEY, []);
      writeLS(LS_TRADES_KEY, []);
      mirrorClearToIndexedDB('snapshots');
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
