/**
 * TradeLedger NSE Tariff & Net P&L Engine
 * Fully deterministic calculations for Indian Equities & Derivatives (NSE circular 2024-2025)
 */

const NSECalculator = (function() {
  'use strict';

  // Format currency in Indian Numbering System (e.g., ₹12,45,678.90)
  function formatINR(val, includeDecimals = true) {
    if (val === undefined || val === null || isNaN(val)) return '₹0.00';
    const num = Number(val);
    const isNegative = num < 0;
    const absVal = Math.abs(num);
    
    const formatted = absVal.toLocaleString('en-IN', {
      minimumFractionDigits: includeDecimals ? 2 : 0,
      maximumFractionDigits: includeDecimals ? 2 : 0
    });
    
    return (isNegative ? '-₹' : '₹') + formatted;
  }

  function formatPct(val) {
    if (val === undefined || val === null || isNaN(val)) return '0.00%';
    const num = Number(val);
    return (num >= 0 ? '+' : '') + num.toFixed(2) + '%';
  }

  /**
   * Main calculation function
   * @param {Object} params
   * @param {string} params.broker - 'groww' | 'zerodha'
   * @param {string} params.segment - 'delivery' | 'intraday' | 'futures' | 'options'
   * @param {number} params.buyPrice
   * @param {number} params.sellPrice
   * @param {number} params.qty
   * @param {number} [params.customDp]
   */
  function calculate({
    broker = 'groww',
    segment = 'delivery',
    buyPrice = 0,
    sellPrice = 0,
    qty = 0,
    customDp = 13.50
  }) {
    buyPrice = Math.max(0, Number(buyPrice) || 0);
    sellPrice = Math.max(0, Number(sellPrice) || 0);
    qty = Math.max(0, Math.floor(Number(qty) || 0));

    const buyTurnover = buyPrice * qty;
    const sellTurnover = sellPrice * qty;
    const totalTurnover = buyTurnover + sellTurnover;

    // Brokerage
    let buyBrokerage = 0;
    let sellBrokerage = 0;

    if (broker === 'zerodha') {
      if (segment === 'delivery') {
        buyBrokerage = 0;
        sellBrokerage = 0;
      } else if (segment === 'intraday') {
        // ₹20 or 0.03% whichever is lower
        buyBrokerage = Math.min(20, buyTurnover * 0.0003);
        sellBrokerage = Math.min(20, sellTurnover * 0.0003);
      } else if (segment === 'futures') {
        buyBrokerage = Math.min(20, buyTurnover * 0.0003);
        sellBrokerage = Math.min(20, sellTurnover * 0.0003);
      } else if (segment === 'options') {
        buyBrokerage = 20; // Flat ₹20 per executed order
        sellBrokerage = 20;
      }
    } else {
      // Groww
      if (segment === 'delivery') {
        // ₹20 or 0.05% whichever lower
        buyBrokerage = Math.min(20, buyTurnover * 0.0005);
        sellBrokerage = Math.min(20, sellTurnover * 0.0005);
      } else if (segment === 'intraday') {
        buyBrokerage = Math.min(20, buyTurnover * 0.0005);
        sellBrokerage = Math.min(20, sellTurnover * 0.0005);
      } else if (segment === 'futures') {
        buyBrokerage = Math.min(20, buyTurnover * 0.0005);
        sellBrokerage = Math.min(20, sellTurnover * 0.0005);
      } else if (segment === 'options') {
        buyBrokerage = 20;
        sellBrokerage = 20;
      }
    }

    const totalBrokerage = buyBrokerage + sellBrokerage;

    // STT (Securities Transaction Tax)
    let stt = 0;
    if (segment === 'delivery') {
      // 0.1% on buy and sell
      stt = Math.round((buyTurnover * 0.001) + (sellTurnover * 0.001));
    } else if (segment === 'intraday') {
      // 0.025% on sell only
      stt = Math.round(sellTurnover * 0.00025);
    } else if (segment === 'futures') {
      // 0.02% on sell only
      stt = Math.round(sellTurnover * 0.0002);
    } else if (segment === 'options') {
      // 0.1% on sell premium only
      stt = Math.round(sellTurnover * 0.001);
    }

    // Stamp duty (payable on buy only)
    let stampDuty = 0;
    if (segment === 'delivery') {
      stampDuty = Math.round(buyTurnover * 0.00015); // 0.015%
    } else if (segment === 'intraday') {
      stampDuty = Math.round(buyTurnover * 0.00003); // 0.003%
    } else if (segment === 'futures') {
      stampDuty = Math.round(buyTurnover * 0.00002); // 0.002%
    } else if (segment === 'options') {
      stampDuty = Math.round(buyTurnover * 0.00003); // 0.003%
    }

    // Exchange Turnover charges
    let exchCharges = 0;
    if (segment === 'options') {
      exchCharges = totalTurnover * 0.0005; // 0.05%
    } else if (segment === 'futures') {
      exchCharges = totalTurnover * 0.0000175; // 0.00175%
    } else {
      // NSE Cash
      exchCharges = totalTurnover * 0.0000325; // 0.00325%
    }

    // SEBI Charges: ₹10 per crore (0.0001% of total turnover)
    const sebiCharges = totalTurnover * 0.000001;

    // IPFT (Investor Protection Fund Trust): 0.0001%
    const ipftCharges = totalTurnover * 0.000001;

    // DP Charges: Only for equity delivery on the sell side (per scrip per day)
    const dpCharges = (segment === 'delivery' && qty > 0) ? Number(customDp || 13.50) : 0;

    // GST: 18% on (Brokerage + Exchange Charges + SEBI + DP)
    const gstTaxable = totalBrokerage + exchCharges + sebiCharges + dpCharges;
    const gst = gstTaxable * 0.18;

    const totalCharges = totalBrokerage + stt + stampDuty + exchCharges + sebiCharges + ipftCharges + dpCharges + gst;

    const grossPnL = sellTurnover - buyTurnover;
    const netPnL = grossPnL - totalCharges;
    const netRoi = buyTurnover > 0 ? (netPnL / buyTurnover) * 100 : 0;

    // Breakeven price calculation
    let bePrice = buyPrice;
    if (qty > 0 && buyPrice > 0) {
      // High precision iterative convergence
      for (let i = 0; i < 6; i++) {
        const beSellTurnover = bePrice * qty;
        const beTotalTurn = buyTurnover + beSellTurnover;

        let beSellBrok = 0;
        if (broker === 'zerodha') {
          beSellBrok = segment === 'delivery' ? 0 : Math.min(20, beSellTurnover * 0.0003);
        } else {
          beSellBrok = Math.min(20, beSellTurnover * 0.0005);
        }
        const beBrok = buyBrokerage + beSellBrok;

        let beStt = 0;
        if (segment === 'delivery') {
          beStt = (buyTurnover * 0.001) + (beSellTurnover * 0.001);
        } else {
          beStt = beSellTurnover * 0.00025;
        }

        const beExch = beTotalTurn * (segment === 'options' ? 0.0005 : 0.0000325);
        const beSebi = beTotalTurn * 0.000001;
        const beIpft = beTotalTurn * 0.000001;
        const beGst = (beBrok + beExch + beSebi + dpCharges) * 0.18;
        const beTotalCharges = beBrok + beStt + stampDuty + beExch + beSebi + beIpft + dpCharges + beGst;

        bePrice = (buyTurnover + beTotalCharges) / qty;
      }
    }

    // Profit Drag & Retention
    let dragPct = 0;
    let retentionPct = 0;
    if (grossPnL > 0) {
      dragPct = Math.min(100, Math.max(0, (totalCharges / grossPnL) * 100));
      retentionPct = Math.max(0, 100 - dragPct);
    } else {
      dragPct = 100;
      retentionPct = 0;
    }

    return {
      broker,
      segment,
      buyPrice,
      sellPrice,
      qty,
      buyTurnover,
      sellTurnover,
      totalTurnover,
      buyBrokerage,
      sellBrokerage,
      totalBrokerage,
      stt,
      stampDuty,
      exchCharges,
      sebiCharges,
      ipftCharges,
      dpCharges,
      gst,
      totalCharges,
      grossPnL,
      netPnL,
      netRoi,
      bePrice,
      dragPct,
      retentionPct,
      isProfit: netPnL > 0
    };
  }

  return {
    calculate,
    formatINR,
    formatPct
  };
})();

// Universal export
if (typeof window !== 'undefined') {
  window.NSECalculator = NSECalculator;
}
if (typeof globalThis !== 'undefined') {
  globalThis.NSECalculator = NSECalculator;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NSECalculator;
}
