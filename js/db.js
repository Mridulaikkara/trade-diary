/**
 * TradeLedger IndexedDB Storage Engine
 * High-performance, offline-first client database for swing trades and portfolio snapshots.
 */

const TradeDB = (function() {
  'use strict';

  const DB_NAME = 'TradeLedger_DB_v1';
  const DB_VERSION = 1;

  let dbInstance = null;

  // Initial Sample Datasets (Seed on first run so the dashboard and analytics are populated)
  const INITIAL_SNAPSHOTS = [
    { date: '2025-05-01', growwCash: 20000, growwInvested: 175488, kiteCash: 30000, kiteInvested: 15000, growwTotal: 195488, kiteTotal: 45000, combinedTotal: 240488, dodDelta: 0, dodDeltaPct: 0 },
    { date: '2025-05-02', growwCash: 20000, growwInvested: 177210, kiteCash: 30000, kiteInvested: 15150, growwTotal: 197210, kiteTotal: 45150, combinedTotal: 242360, dodDelta: 1872, dodDeltaPct: 0.78 },
    { date: '2025-05-05', growwCash: 20000, growwInvested: 179050, kiteCash: 30000, kiteInvested: 15300, growwTotal: 199050, kiteTotal: 45300, combinedTotal: 244350, dodDelta: 1990, dodDeltaPct: 0.82 },
    { date: '2025-05-06', growwCash: 20000, growwInvested: 180120, kiteCash: 30000, kiteInvested: 15410, growwTotal: 200120, kiteTotal: 45410, combinedTotal: 245530, dodDelta: 1180, dodDeltaPct: 0.48 },
    { date: '2025-05-07', growwCash: 20000, growwInvested: 181290, kiteCash: 30000, kiteInvested: 15550, growwTotal: 201290, kiteTotal: 45550, combinedTotal: 246840, dodDelta: 1310, dodDeltaPct: 0.53 },
    { date: '2025-05-08', growwCash: 20000, growwInvested: 181500, kiteCash: 30000, kiteInvested: 15620, growwTotal: 201500, kiteTotal: 45620, combinedTotal: 247120, dodDelta: 280, dodDeltaPct: 0.11 },
    { date: '2025-05-09', growwCash: 20000, growwInvested: 183400, kiteCash: 30000, kiteInvested: 15720, growwTotal: 203400, kiteTotal: 45720, combinedTotal: 249120, dodDelta: 2000, dodDeltaPct: 0.81 },
    { date: '2025-05-12', growwCash: 20000, growwInvested: 185600, kiteCash: 32000, kiteInvested: 15400, growwTotal: 205600, kiteTotal: 47400, combinedTotal: 253000, dodDelta: 3880, dodDeltaPct: 1.56 },
    { date: '2025-05-13', growwCash: 20000, growwInvested: 186900, kiteCash: 32000, kiteInvested: 15480, growwTotal: 206900, kiteTotal: 47480, combinedTotal: 254380, dodDelta: 1380, dodDeltaPct: 0.55 },
    { date: '2025-05-14', growwCash: 20000, growwInvested: 201100, kiteCash: 33070, kiteInvested: 15358, growwTotal: 221100, kiteTotal: 48428, combinedTotal: 269528, dodDelta: 15148, dodDeltaPct: 5.96 },
    { date: '2025-05-15', growwCash: 20000, growwInvested: 202180, kiteCash: 33070, kiteInvested: 15698, growwTotal: 222180, kiteTotal: 48768, combinedTotal: 270948, dodDelta: 1420, dodDeltaPct: 0.53 },
    { date: '2025-05-16', growwCash: 20000, growwInvested: 204226, kiteCash: 33070, kiteInvested: 15792, growwTotal: 224226, kiteTotal: 48862, combinedTotal: 273088, dodDelta: 2140, dodDeltaPct: 0.79 }
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
    },
    {
      id: 2,
      date: '2024-10-22',
      stockName: 'Trent Limited',
      stockSymbol: 'TRENT',
      broker: 'groww',
      segment: 'delivery',
      buyPrice: 7120.00,
      sellPrice: 7880.00,
      qty: 10,
      strategy: 'Momentum Continuation',
      notes: 'Quarterly retail volume surge. Matched 3R target on heavy volume.',
      grossPnL: 7600.00,
      totalCharges: 152.40,
      netPnL: 7447.60,
      netRoi: 10.46,
      outcome: 'win'
    },
    {
      id: 3,
      date: '2024-10-18',
      stockName: 'Hindustan Unilever',
      stockSymbol: 'HINDUNILVR',
      broker: 'zerodha',
      segment: 'delivery',
      buyPrice: 2720.00,
      sellPrice: 2640.00,
      qty: 45,
      strategy: 'Support Bounce',
      notes: 'Failed earnings gap down; cut immediately at stoploss threshold.',
      grossPnL: -3600.00,
      totalCharges: 88.20,
      netPnL: -3688.20,
      netRoi: -3.01,
      outcome: 'loss'
    },
    {
      id: 4,
      date: '2024-10-15',
      stockName: 'Bharat Electronics Ltd',
      stockSymbol: 'BEL',
      broker: 'groww',
      segment: 'delivery',
      buyPrice: 285.00,
      sellPrice: 308.50,
      qty: 200,
      strategy: 'Defence Sector Theme',
      notes: 'Defence procurement order win announced during mid-session.',
      grossPnL: 4700.00,
      totalCharges: 135.20,
      netPnL: 4564.80,
      netRoi: 8.01,
      outcome: 'win'
    },
    {
      id: 5,
      date: '2024-10-11',
      stockName: 'Hindustan Aeronautics Ltd',
      stockSymbol: 'HAL',
      broker: 'zerodha',
      segment: 'delivery',
      buyPrice: 4350.00,
      sellPrice: 4620.00,
      qty: 15,
      strategy: 'Trend Channel Ride',
      notes: 'Followed upper trendline channel; exited at resistance.',
      grossPnL: 4050.00,
      totalCharges: 142.10,
      netPnL: 3907.90,
      netRoi: 5.99,
      outcome: 'win'
    },
    {
      id: 6,
      date: '2024-10-08',
      stockName: 'Dixon Technologies',
      stockSymbol: 'DIXON',
      broker: 'groww',
      segment: 'delivery',
      buyPrice: 12400.00,
      sellPrice: 13150.00,
      qty: 8,
      strategy: 'Electronics PLI Play',
      notes: 'Strong multi-week cup and handle pattern completion.',
      grossPnL: 6000.00,
      totalCharges: 215.30,
      netPnL: 5784.70,
      netRoi: 5.83,
      outcome: 'win'
    },
    {
      id: 7,
      date: '2024-10-04',
      stockName: 'Tata Motors Passenger',
      stockSymbol: 'TATAMOTORS',
      broker: 'groww',
      segment: 'delivery',
      buyPrice: 960.00,
      sellPrice: 938.00,
      qty: 80,
      strategy: 'Pullback Entry',
      notes: 'Monthly sales numbers missed expectations; triggered trailing SL.',
      grossPnL: -1760.00,
      totalCharges: 88.40,
      netPnL: -1848.40,
      netRoi: -2.41,
      outcome: 'loss'
    },
    {
      id: 8,
      date: '2024-09-28',
      stockName: 'Persistent Systems',
      stockSymbol: 'PERSISTENT',
      broker: 'zerodha',
      segment: 'delivery',
      buyPrice: 4890.00,
      sellPrice: 5210.00,
      qty: 12,
      strategy: 'IT Sector Momentum',
      notes: 'Dollar strength tailwind swing play; exited on 5-day RSI divergence.',
      grossPnL: 3840.00,
      totalCharges: 118.60,
      netPnL: 3721.40,
      netRoi: 6.34,
      outcome: 'win'
    },
    {
      id: 9,
      date: '2024-09-24',
      stockName: 'State Bank of India',
      stockSymbol: 'SBIN',
      broker: 'groww',
      segment: 'delivery',
      buyPrice: 795.00,
      sellPrice: 828.00,
      qty: 120,
      strategy: 'PSU Bank Rally',
      notes: 'RBI credit policy hold provided banking catalyst.',
      grossPnL: 3960.00,
      totalCharges: 142.90,
      netPnL: 3817.10,
      netRoi: 4.00,
      outcome: 'win'
    },
    {
      id: 10,
      date: '2024-09-18',
      stockName: 'Infosys Limited',
      stockSymbol: 'INFY',
      broker: 'zerodha',
      segment: 'delivery',
      buyPrice: 1890.00,
      sellPrice: 1850.00,
      qty: 50,
      strategy: 'Resistance Retest',
      notes: 'Failed to break above 1900 psychological barrier; stopped out.',
      grossPnL: -2000.00,
      totalCharges: 98.40,
      netPnL: -2098.40,
      netRoi: -2.22,
      outcome: 'loss'
    },
    {
      id: 11,
      date: '2024-09-12',
      stockName: 'Sun Pharmaceutical',
      stockSymbol: 'SUNPHARMA',
      broker: 'groww',
      segment: 'delivery',
      buyPrice: 1780.00,
      sellPrice: 1895.00,
      qty: 35,
      strategy: 'Pharma Defensive Swing',
      notes: 'USFDA inspection clearance for key formulation facility.',
      grossPnL: 4025.00,
      totalCharges: 134.80,
      netPnL: 3890.20,
      netRoi: 6.24,
      outcome: 'win'
    },
    {
      id: 12,
      date: '2024-09-06',
      stockName: 'Larsen & Toubro Ltd',
      stockSymbol: 'LT',
      broker: 'groww',
      segment: 'delivery',
      buyPrice: 3560.00,
      sellPrice: 3740.00,
      qty: 25,
      strategy: 'Capex Expansion Play',
      notes: 'Domestic order book additions exceeded quarterly targets.',
      grossPnL: 4500.00,
      totalCharges: 148.60,
      netPnL: 4351.40,
      netRoi: 4.89,
      outcome: 'win'
    }
  ];

  // Open database connection
  function openDB() {
    return new Promise((resolve, reject) => {
      if (dbInstance) {
        return resolve(dbInstance);
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Trades Store
        if (!db.objectStoreNames.contains('trades')) {
          const tradeStore = db.createObjectStore('trades', { keyPath: 'id', autoIncrement: true });
          tradeStore.createIndex('date', 'date', { unique: false });
          tradeStore.createIndex('broker', 'broker', { unique: false });
          tradeStore.createIndex('outcome', 'outcome', { unique: false });
          tradeStore.createIndex('stockSymbol', 'stockSymbol', { unique: false });
        }

        // Snapshots Store (date is key)
        if (!db.objectStoreNames.contains('snapshots')) {
          const snapshotStore = db.createObjectStore('snapshots', { keyPath: 'date' });
          snapshotStore.createIndex('date', 'date', { unique: true });
        }

        // Settings Store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = async (event) => {
        dbInstance = event.target.result;
        // Check if database needs seeding
        await seedInitialDataIfNeeded();
        resolve(dbInstance);
      };

      request.onerror = (event) => {
        console.error('IndexedDB error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // Seed sample data if empty
  async function seedInitialDataIfNeeded() {
    try {
      const tradesCount = await count('trades');
      if (tradesCount === 0) {
        for (const t of INITIAL_TRADES) {
          await addRecord('trades', t);
        }
      }

      const snapshotCount = await count('snapshots');
      if (snapshotCount === 0) {
        for (const s of INITIAL_SNAPSHOTS) {
          await addRecord('snapshots', s);
        }
      }

      const hasSettings = await getRecord('settings', 'defaultBroker');
      if (!hasSettings) {
        await addRecord('settings', { key: 'defaultBroker', value: 'groww' });
        await addRecord('settings', { key: 'customDp', value: 13.50 });
        await addRecord('settings', { key: 'lastUpdated', value: new Date().toISOString() });
      }
    } catch (err) {
      console.warn('Seeding check failed:', err);
    }
  }

  // Helper transaction methods
  function count(storeName) {
    return new Promise(async (resolve, reject) => {
      const db = await openDB();
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function getAll(storeName) {
    return new Promise(async (resolve, reject) => {
      const db = await openDB();
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  function getRecord(storeName, key) {
    return new Promise(async (resolve, reject) => {
      const db = await openDB();
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function addRecord(storeName, record) {
    return new Promise(async (resolve, reject) => {
      const db = await openDB();
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(record); // put works for insert or overwrite
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function deleteRecord(storeName, key) {
    return new Promise(async (resolve, reject) => {
      const db = await openDB();
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  function clearStore(storeName) {
    return new Promise(async (resolve, reject) => {
      const db = await openDB();
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // Public Database API
  return {
    init: openDB,

    // Trades
    getTrades: () => getAll('trades'),
    getTrade: (id) => getRecord('trades', Number(id)),
    saveTrade: (trade) => {
      if (!trade.createdAt) trade.createdAt = Date.now();
      return addRecord('trades', trade);
    },
    deleteTrade: (id) => deleteRecord('trades', Number(id)),

    // Snapshots
    getSnapshots: async () => {
      const list = await getAll('snapshots');
      // Sort chronologically ascending
      return list.sort((a, b) => a.date.localeCompare(b.date));
    },
    getSnapshot: (date) => getRecord('snapshots', date),
    saveSnapshot: (snapshot) => addRecord('snapshots', snapshot),
    deleteSnapshot: (date) => deleteRecord('snapshots', date),

    // Settings
    getSetting: async (key, fallback = null) => {
      const row = await getRecord('settings', key);
      return row ? row.value : fallback;
    },
    setSetting: (key, value) => addRecord('settings', { key, value }),

    // Backup & Restore
    exportBackup: async () => {
      const trades = await getAll('trades');
      const snapshots = await getAll('snapshots');
      const settings = await getAll('settings');
      return JSON.stringify({
        version: '2.4.0',
        exportedAt: new Date().toISOString(),
        trades,
        snapshots,
        settings
      }, null, 2);
    },

    importBackup: async (jsonString) => {
      const data = JSON.parse(jsonString);
      if (!data || (!Array.isArray(data.trades) && !Array.isArray(data.snapshots))) {
        throw new Error('Invalid backup file format.');
      }

      if (Array.isArray(data.trades)) {
        await clearStore('trades');
        for (const t of data.trades) {
          await addRecord('trades', t);
        }
      }

      if (Array.isArray(data.snapshots)) {
        await clearStore('snapshots');
        for (const s of data.snapshots) {
          await addRecord('snapshots', s);
        }
      }

      if (Array.isArray(data.settings)) {
        for (const set of data.settings) {
          await addRecord('settings', set);
        }
      }

      return true;
    },

    // Reset database to sample seed data
    resetToSampleData: async () => {
      await clearStore('trades');
      await clearStore('snapshots');
      for (const t of INITIAL_TRADES) {
        await addRecord('trades', t);
      }
      for (const s of INITIAL_SNAPSHOTS) {
        await addRecord('snapshots', s);
      }
      return true;
    },

    // Completely clear database
    clearAll: async () => {
      await clearStore('trades');
      await clearStore('snapshots');
      return true;
    },

    // Telemetry & Storage info
    getStats: async () => {
      const tradesCount = await count('trades');
      const snapshotCount = await count('snapshots');
      let quota = { used: 0, total: 0, pct: '0.00' };

      if (navigator.storage && navigator.storage.estimate) {
        try {
          const est = await navigator.storage.estimate();
          const usedMB = (est.usage / (1024 * 1024)).toFixed(2);
          const totalGB = (est.quota / (1024 * 1024 * 1024)).toFixed(1);
          const pct = ((est.usage / est.quota) * 100).toFixed(4);
          quota = { usedMB, totalGB, pct };
        } catch (e) {
          quota = { usedMB: '1.8', totalGB: '50.0', pct: '0.003' };
        }
      }

      return {
        tradesCount,
        snapshotCount,
        quota
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
