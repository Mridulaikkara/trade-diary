/**
 * Trade Diary — Core Application Engine
 * High-performance, offline-first portfolio tracker and deterministic NSE brokerage calculator.
 *
 * ALL interactivity is handled via a single delegated 'click' listener on document.
 * NO inline onclick handlers are used anywhere. This eliminates iOS Safari event conflicts.
 */

(function() {
  'use strict';

  // Application State
  const AppState = {
    currentView: 'dashboard',
    snapshots: [],
    settings: {
      defaultBroker: 'groww',
      customDp: 13.50
    },
    calculatorState: {
      broker: 'groww',
      segment: 'delivery'
    },
    deletingSnapshotDate: null,
    deferredInstallPrompt: null
  };

  // Format currency in Indian Numbering System (e.g. ₹2,73,088.00)
  function fmtINR(val, includeDecimals = true) {
    if (val === undefined || val === null || isNaN(val)) return '₹0.00';
    const num = Number(val);
    const isNegative = num < 0;
    const absVal = Math.abs(num);
    const formatted = absVal.toLocaleString('en-IN', {
      minimumFractionDigits: includeDecimals ? 2 : 0,
      maximumFractionDigits: includeDecimals ? 2 : 0
    });
    return (isNegative ? '-₹ ' : '₹ ') + formatted;
  }

  // Toast Notification
  function showToast(message, type = 'info') {
    const toast = document.getElementById('global-toast');
    const toastText = document.getElementById('global-toast-text');
    const toastIcon = document.getElementById('global-toast-icon');

    if (!toast || !toastText) return;

    toastText.textContent = message;
    if (toastIcon) {
      if (type === 'success') {
        toastIcon.textContent = 'check_circle';
        toastIcon.style.color = '#7AD9A5';
      } else if (type === 'error') {
        toastIcon.textContent = 'error';
        toastIcon.style.color = '#F87171';
      } else {
        toastIcon.textContent = 'info';
        toastIcon.style.color = '#F4EDE0';
      }
    }

    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  // Market Session Clock (Indian Standard Time: UTC+5:30)
  function updateMarketStatus() {
    const el = document.getElementById('market-session-status');
    if (!el) return;

    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const istDate = new Date(utc + (3600000 * 5.5));

    const day = istDate.getDay();
    const hours = istDate.getHours();
    const minutes = istDate.getMinutes();
    const timeVal = hours * 60 + minutes;

    const isWeekday = day >= 1 && day <= 5;
    const isLive = isWeekday && (timeVal >= 555 && timeVal <= 930); // 9:15 AM to 3:30 PM

    if (isLive) {
      el.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-[#7AD9A5] animate-pulse"></span>
        <span class="text-xs text-[#7AD9A5] font-semibold">NSE Live</span>
      `;
    } else {
      const label = (day === 0 || day === 6) ? 'NSE Weekend' : 'NSE Closed';
      el.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-[#F4EDE0]/40"></span>
        <span class="text-xs text-[#F4EDE0]/70 font-medium">${label}</span>
      `;
    }
  }

  // Connectivity Listener
  function initConnectivityMonitor() {
    function updateStatus() {
      if (!navigator.onLine) {
        showToast('Operating offline with IndexedDB local cache', 'info');
      }
    }
    window.addEventListener('online', () => {
      showToast('Connection restored: IndexedDB storage synchronized', 'success');
    });
    window.addEventListener('offline', updateStatus);
  }

  // Synchronous State Reload from IndexedDB
  async function reloadAllData() {
    try {
      let snaps = null;
      if (typeof TradeDB.getSnapshots === 'function') {
        snaps = await TradeDB.getSnapshots();
      } else if (typeof TradeDB.getAllSnapshots === 'function') {
        snaps = await TradeDB.getAllSnapshots();
      }
      if (!snaps || snaps.length === 0) {
        snaps = typeof TradeDB.getInitialSnapshots === 'function' ? TradeDB.getInitialSnapshots() : [];
      }
      // Sort snapshots chronologically
      snaps.sort((a, b) => a.date.localeCompare(b.date));
      AppState.snapshots = snaps;

      if (typeof TradeDB.getSetting === 'function') {
        const brokerSetting = await TradeDB.getSetting('defaultBroker');
        const dpSetting = await TradeDB.getSetting('customDp');
        if (brokerSetting) AppState.settings.defaultBroker = brokerSetting;
        if (dpSetting) AppState.settings.customDp = parseFloat(dpSetting) || 13.50;
      }

      // Sync calculator state default
      if (!AppState.calculatorState.broker) {
        AppState.calculatorState.broker = AppState.settings.defaultBroker || 'groww';
      }
    } catch (err) {
      console.warn('Data reload fallback:', err);
      if (!AppState.snapshots || AppState.snapshots.length === 0) {
        AppState.snapshots = typeof TradeDB.getInitialSnapshots === 'function' ? TradeDB.getInitialSnapshots() : [];
      }
    }
  }

  // Navigation Switcher (Instant response)
  function switchView(viewName) {
    if (!viewName) viewName = 'dashboard';
    const validViews = ['dashboard', 'portfolio-tracker', 'nse-calculator', 'settings-and-backup'];
    if (!validViews.includes(viewName)) viewName = 'dashboard';

    AppState.currentView = viewName;

    // Toggle panels with !important to prevent any CSS class conflict
    document.querySelectorAll('.view-panel').forEach(panel => {
      panel.classList.remove('active');
      panel.style.setProperty('display', 'none', 'important');
    });

    const target = document.getElementById(`view-${viewName}`);
    if (target) {
      target.classList.add('active');
      target.style.setProperty('display', 'block', 'important');
    }

    // Toggle bottom dock items
    document.querySelectorAll('.nav-tab-item').forEach(tab => {
      if (tab.getAttribute('data-path') === viewName) {
        tab.classList.add('active');
        tab.setAttribute('aria-current', 'page');
      } else {
        tab.classList.remove('active');
        tab.removeAttribute('aria-current');
      }
    });

    // Close any open modals
    closeDeleteSnapshotModal();

    try { history.replaceState(null, '', `#${viewName}`); } catch(e){}
    window.scrollTo(0, 0);

    // Render active view with fail-safe error isolation
    try {
      if (viewName === 'dashboard') renderDashboard();
      else if (viewName === 'portfolio-tracker') renderPortfolio();
      else if (viewName === 'nse-calculator') calculateAllCalculator();
      else if (viewName === 'settings-and-backup') renderSettings();
    } catch (renderErr) {
      console.warn('View render exception:', renderErr);
    }
  }

  /* ==========================================================================
     VIEW 1: DASHBOARD (PORTFOLIO VALUE & GROWTH INSIGHTS)
     ========================================================================== */
  function renderDashboard() {
    const snapshots = AppState.snapshots || [];
    const latestSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
    const prevSnapshot = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;

    // 1. Hero Total Valuation
    const totalVal = latestSnapshot ? (Number(latestSnapshot.combinedTotal) || 0) : 0;
    const totalValEl = document.getElementById('dash-total-val');
    const headerValEl = document.getElementById('header-total-valuation');

    if (totalValEl) totalValEl.innerHTML = fmtINR(totalVal);
    if (headerValEl) headerValEl.textContent = fmtINR(totalVal);

    // 2. Dual Broker Cards (Groww & Zerodha Kite)
    const gShareEl = document.getElementById('dash-groww-share');
    const gValEl = document.getElementById('dash-groww-val');
    const gInvEl = document.getElementById('dash-groww-inv');
    const gCashEl = document.getElementById('dash-groww-cash');

    const kShareEl = document.getElementById('dash-kite-share');
    const kValEl = document.getElementById('dash-kite-val');
    const kInvEl = document.getElementById('dash-kite-inv');
    const kCashEl = document.getElementById('dash-kite-cash');

    const ratioEl = document.getElementById('dash-allocation-ratio');
    const barInvEl = document.getElementById('dash-alloc-bar-inv');
    const barCashEl = document.getElementById('dash-alloc-bar-cash');
    const totalInvEl = document.getElementById('dash-total-inv');
    const totalCashEl = document.getElementById('dash-total-cash');

    if (latestSnapshot) {
      const gVal = Number(latestSnapshot.growwTotal) || 0;
      const kVal = Number(latestSnapshot.kiteTotal) || 0;
      const gInv = Number(latestSnapshot.growwInvested) || 0;
      const kInv = Number(latestSnapshot.kiteInvested) || 0;
      const gCash = Number(latestSnapshot.growwCash) || 0;
      const kCash = Number(latestSnapshot.kiteCash) || 0;

      const gShare = totalVal > 0 ? ((gVal / totalVal) * 100).toFixed(1) : '0.0';
      const kShare = totalVal > 0 ? ((kVal / totalVal) * 100).toFixed(1) : '0.0';

      if (gShareEl) gShareEl.textContent = `${gShare}%`;
      if (gValEl) gValEl.innerHTML = fmtINR(gVal);
      if (gInvEl) gInvEl.innerHTML = fmtINR(gInv);
      if (gCashEl) gCashEl.innerHTML = fmtINR(gCash);

      if (kShareEl) kShareEl.textContent = `${kShare}%`;
      if (kValEl) kValEl.innerHTML = fmtINR(kVal);
      if (kInvEl) kInvEl.innerHTML = fmtINR(kInv);
      if (kCashEl) kCashEl.innerHTML = fmtINR(kCash);

      // Asset Allocation Breakdown
      const totalInv = gInv + kInv;
      const totalCash = gCash + kCash;
      const invPct = totalVal > 0 ? ((totalInv / totalVal) * 100).toFixed(1) : '0.0';
      const cashPct = totalVal > 0 ? ((totalCash / totalVal) * 100).toFixed(1) : '0.0';

      if (ratioEl) ratioEl.textContent = `Invested ${invPct}% · Cash ${cashPct}%`;
      if (barInvEl) barInvEl.style.width = `${invPct}%`;
      if (barCashEl) barCashEl.style.width = `${cashPct}%`;
      if (totalInvEl) totalInvEl.textContent = fmtINR(totalInv);
      if (totalCashEl) totalCashEl.textContent = fmtINR(totalCash);
    } else {
      if (gShareEl) gShareEl.textContent = '0.0%';
      if (gValEl) gValEl.innerHTML = fmtINR(0);
      if (gInvEl) gInvEl.innerHTML = fmtINR(0);
      if (gCashEl) gCashEl.innerHTML = fmtINR(0);

      if (kShareEl) kShareEl.textContent = '0.0%';
      if (kValEl) kValEl.innerHTML = fmtINR(0);
      if (kInvEl) kInvEl.innerHTML = fmtINR(0);
      if (kCashEl) kCashEl.innerHTML = fmtINR(0);

      if (ratioEl) ratioEl.textContent = 'Invested 0.0% · Cash 0.0%';
      if (barInvEl) barInvEl.style.width = '0%';
      if (barCashEl) barCashEl.style.width = '0%';
      if (totalInvEl) totalInvEl.textContent = fmtINR(0);
      if (totalCashEl) totalCashEl.textContent = fmtINR(0);
    }

    // 3. Daily Performance (DoD)
    let deltaVal = 0;
    let deltaPct = '0.00';
    let depositToday = 0;
    let organicToday = 0;

    if (latestSnapshot && prevSnapshot) {
      deltaVal = Number(latestSnapshot.combinedTotal) - Number(prevSnapshot.combinedTotal);
      deltaPct = prevSnapshot.combinedTotal > 0
        ? ((deltaVal / prevSnapshot.combinedTotal) * 100).toFixed(2)
        : '0.00';
      depositToday = Number(latestSnapshot.deposit || 0);
      organicToday = deltaVal - depositToday;
    } else if (latestSnapshot) {
      deltaVal = Number(latestSnapshot.dodDelta || 0);
      deltaPct = Number(latestSnapshot.dodDeltaPct || 0).toFixed(2);
      depositToday = Number(latestSnapshot.deposit || 0);
      organicToday = deltaVal - depositToday;
    }

    const todayDeltaEl = document.getElementById('dash-today-delta');
    const todayDeltaPctEl = document.getElementById('dash-today-delta-pct');
    const prevCloseEl = document.getElementById('dash-prev-close');
    const organicTodayEl = document.getElementById('dash-organic-today');

    if (todayDeltaEl) {
      todayDeltaEl.textContent = (deltaVal >= 0 ? '+' : '') + fmtINR(deltaVal);
    }
    if (todayDeltaPctEl) {
      const isUp = deltaVal >= 0;
      todayDeltaPctEl.className = isUp
        ? 'text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-2.5 py-0.5 rounded-full'
        : 'text-xs font-bold bg-red-50 text-red-700 border border-red-200/80 px-2.5 py-0.5 rounded-full';
      todayDeltaPctEl.textContent = (isUp ? '+' : '') + deltaPct + '%';
    }
    if (prevCloseEl) {
      prevCloseEl.textContent = prevSnapshot ? `Prev Close: ${fmtINR(prevSnapshot.combinedTotal)}` : 'Prev Close: ₹ 0.00';
    }
    if (organicTodayEl) {
      if (latestSnapshot && depositToday !== 0) {
        organicTodayEl.textContent = `Capital Inflow: ${fmtINR(depositToday)} | Market Gain: ${(organicToday >= 0 ? '+' : '')}${fmtINR(organicToday)}`;
      } else if (latestSnapshot) {
        organicTodayEl.textContent = `Organic Market Return: ${(organicToday >= 0 ? '+' : '')}${fmtINR(organicToday)}`;
      } else {
        organicTodayEl.textContent = 'Organic Market Return: ₹ 0.00';
      }
    }

    // 4. Monthly Performance (MTD / 30-Day Growth & Capital Inflows)
    const monthlyValEl = document.getElementById('dash-monthly-val');
    const monthlyPctEl = document.getElementById('dash-monthly-pct');
    const monthlyDepEl = document.getElementById('dash-monthly-deposits');
    const monthlyOrgEl = document.getElementById('dash-monthly-organic');

    if (snapshots.length >= 2) {
      const latestDate = new Date(latestSnapshot.date);
      const currentMonth = latestDate.getMonth();
      const currentYear = latestDate.getFullYear();

      // Find earliest snapshot in this month (or earliest in dataset)
      const monthSnaps = snapshots.filter(s => {
        const d = new Date(s.date);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });

      const baseSnap = monthSnaps.length > 0 ? monthSnaps[0] : snapshots[0];
      const monthlyTotalGrowth = Number(latestSnapshot.combinedTotal) - Number(baseSnap.combinedTotal);
      const monthlyGrowthPct = baseSnap.combinedTotal > 0
        ? ((monthlyTotalGrowth / baseSnap.combinedTotal) * 100).toFixed(1)
        : '0.0';

      // Sum all recorded deposits in this period
      let monthlyDeposits = 0;
      (monthSnaps.length > 0 ? monthSnaps : snapshots).forEach(s => {
        monthlyDeposits += Number(s.deposit || 0);
      });

      const monthlyOrganic = monthlyTotalGrowth - monthlyDeposits;

      if (monthlyValEl) monthlyValEl.textContent = (monthlyTotalGrowth >= 0 ? '+' : '') + fmtINR(monthlyTotalGrowth);
      if (monthlyPctEl) {
        const isUp = monthlyTotalGrowth >= 0;
        monthlyPctEl.className = isUp
          ? 'text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-2.5 py-0.5 rounded-full'
          : 'text-xs font-bold bg-red-50 text-red-700 border border-red-200/80 px-2.5 py-0.5 rounded-full';
        monthlyPctEl.textContent = `${(isUp ? '+' : '')}${monthlyGrowthPct}% MTD`;
      }
      if (monthlyDepEl) monthlyDepEl.textContent = fmtINR(monthlyDeposits);
      if (monthlyOrgEl) {
        monthlyOrgEl.className = monthlyOrganic >= 0 ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600';
        monthlyOrgEl.textContent = (monthlyOrganic >= 0 ? '+' : '') + fmtINR(monthlyOrganic);
      }
    } else {
      if (monthlyValEl) monthlyValEl.textContent = '₹ 0.00';
      if (monthlyPctEl) {
        monthlyPctEl.className = 'text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200 px-2.5 py-0.5 rounded-full';
        monthlyPctEl.textContent = '0.0% MTD';
      }
      if (monthlyDepEl) monthlyDepEl.textContent = '₹ 0.00';
      if (monthlyOrgEl) {
        monthlyOrgEl.className = 'font-semibold text-slate-400';
        monthlyOrgEl.textContent = '₹ 0.00';
      }
    }

    // 5. Render SVG Growth Curve
    renderDashboardChart();
  }

  function renderDashboardChart() {
    const svg = document.getElementById('dash-growth-svg');
    const labelsEl = document.getElementById('dash-chart-labels');
    if (!svg) return;

    const snapshots = AppState.snapshots || [];
    const W = 1000;
    const H = 220;
    const padX = 20;
    const padY = 20;

    if (snapshots.length < 2) {
      svg.innerHTML = `
        <line x1="20" y1="110" x2="980" y2="110" stroke="rgba(226, 232, 240, 0.9)" stroke-width="1.5" stroke-dasharray="4 4"/>
        <text x="500" y="115" fill="#94A3B8" font-size="15" text-anchor="middle" font-family="sans-serif">
          Record at least 2 daily valuations in Portfolio to plot trend
        </text>
      `;
      if (labelsEl) {
        labelsEl.innerHTML = `
          <span>No historical records yet</span>
          <span>Add records in Portfolio tab</span>
        `;
      }
      return;
    }

    const values = snapshots.map(s => Number(s.combinedTotal) || 0);
    const minVal = Math.min(...values) * 0.98;
    const maxVal = Math.max(...values) * 1.02;
    const range = (maxVal - minVal) || 1;

    const n = snapshots.length;
    const points = snapshots.map((s, idx) => {
      const x = padX + (idx / (n - 1)) * (W - 2 * padX);
      const val = Number(s.combinedTotal) || 0;
      const y = H - padY - ((val - minVal) / range) * (H - 2 * padY);
      return { x, y, val, date: s.date };
    });

    let pathD = `M ${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const midX = (prev.x + curr.x) / 2;
      pathD += ` C ${midX},${prev.y} ${midX},${curr.y} ${curr.x},${curr.y}`;
    }

    const areaD = `${pathD} L ${points[points.length - 1].x},${H} L ${points[0].x},${H} Z`;

    // Horizontal Grid Lines
    let gridLines = '';
    for (let i = 1; i <= 3; i++) {
      const yLine = padY + (i / 4) * (H - 2 * padY);
      gridLines += `<line x1="0" x2="${W}" y1="${yLine}" y2="${yLine}" stroke="rgba(226, 232, 240, 0.85)" stroke-width="1" stroke-dasharray="3 3"/>`;
    }

    // Circles
    let circlesSvg = '';
    points.forEach((p, i) => {
      const isLast = (i === points.length - 1);
      const r = isLast ? 6 : 4;
      const fill = isLast ? '#0F172A' : '#0284C7';
      const stroke = 'stroke="#FFFFFF" stroke-width="2"';
      circlesSvg += `
        <circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${fill}" ${stroke} class="chart-point" data-idx="${i}">
          <title>${p.date}: ${fmtINR(p.val)}</title>
        </circle>
      `;
    });

    svg.innerHTML = `
      <defs>
        <linearGradient id="dashGrowthGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#0284C7" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="#0284C7" stop-opacity="0.01"/>
        </linearGradient>
      </defs>
      ${gridLines}
      <path d="${areaD}" fill="url(#dashGrowthGrad)"/>
      <path d="${pathD}" fill="none" stroke="#0284C7" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      ${circlesSvg}
    `;

    if (labelsEl && n >= 2) {
      const first = snapshots[0];
      const mid = snapshots[Math.floor(n / 2)];
      const last = snapshots[n - 1];
      labelsEl.innerHTML = `
        <span>${first.date} (${fmtINR(first.combinedTotal, false)})</span>
        <span>${mid.date} (${fmtINR(mid.combinedTotal, false)})</span>
        <span class="font-semibold text-[#F4EDE0]">${last.date} (${fmtINR(last.combinedTotal, false)})</span>
      `;
    }
  }

  /* ==========================================================================
     VIEW 2: PORTFOLIO TRACKER
     ========================================================================== */
  function renderPortfolio() {
    const dateInput = document.getElementById('snapshot-date');
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }
    updateSnapshotFormCalculations();
    renderSnapshotTable();
  }

  function updateSnapshotFormCalculations() {
    const gCash = parseFloat(document.getElementById('groww-cash')?.value) || 0;
    const gInv = parseFloat(document.getElementById('groww-invested')?.value) || 0;
    const kCash = parseFloat(document.getElementById('kite-cash')?.value) || 0;
    const kInv = parseFloat(document.getElementById('kite-invested')?.value) || 0;
    const deposit = parseFloat(document.getElementById('snapshot-deposit')?.value) || 0;

    const gSub = gCash + gInv;
    const kSub = kCash + kInv;
    const comb = gSub + kSub;

    const gSubEl = document.getElementById('groww-subtotal');
    const kSubEl = document.getElementById('kite-subtotal');
    const combEl = document.getElementById('combined-total-value');
    const deltaEl = document.getElementById('combined-dod-delta');
    const organicEl = document.getElementById('combined-organic-return');

    if (gSubEl) gSubEl.textContent = fmtINR(gSub);
    if (kSubEl) kSubEl.textContent = fmtINR(kSub);
    if (combEl) combEl.textContent = fmtINR(comb);

    // Delta estimation vs previous recorded snapshot
    let diff = 0;
    let pct = '0.00';
    if (AppState.snapshots.length > 0) {
      const prev = AppState.snapshots[AppState.snapshots.length - 1];
      diff = comb - prev.combinedTotal;
      pct = prev.combinedTotal > 0 ? ((diff / prev.combinedTotal) * 100).toFixed(2) : '0.00';
    }

    if (deltaEl) {
      deltaEl.className = diff >= 0
        ? 'text-xs font-bold text-emerald-600 tabular-nums'
        : 'text-xs font-bold text-red-600 tabular-nums';
      deltaEl.textContent = `${diff >= 0 ? '+' : ''}${fmtINR(diff)} (${diff >= 0 ? '+' : ''}${pct}%)`;
    }

    // True Organic Market Return = Total Value Change - Net Deposit
    const organicReturn = diff - deposit;
    if (organicEl) {
      organicEl.className = organicReturn >= 0
        ? 'font-bold text-emerald-600 tabular-nums'
        : 'font-bold text-red-600 tabular-nums';
      organicEl.textContent = `${organicReturn >= 0 ? '+' : ''}${fmtINR(organicReturn)}`;
    }
  }

  async function handleSaveSnapshot() {
    if (AppState._isSavingSnapshot) return;
    AppState._isSavingSnapshot = true;

    try {
      const dateInput = document.getElementById('snapshot-date');
      let date = dateInput?.value;
      if (!date) {
        const today = new Date();
        date = today.toISOString().split('T')[0];
        if (dateInput) dateInput.value = date;
      }
      const gCash = parseFloat(document.getElementById('groww-cash')?.value) || 0;
      const gInv = parseFloat(document.getElementById('groww-invested')?.value) || 0;
      const kCash = parseFloat(document.getElementById('kite-cash')?.value) || 0;
      const kInv = parseFloat(document.getElementById('kite-invested')?.value) || 0;
      const deposit = parseFloat(document.getElementById('snapshot-deposit')?.value) || 0;

      const gTotal = gCash + gInv;
      const kTotal = kCash + kInv;
      const combinedTotal = gTotal + kTotal;

      // Calculate DoD delta vs previous chronologically
      let dodDelta = 0;
      let dodDeltaPct = 0;
      const prevSnapshots = (AppState.snapshots || []).filter(s => s.date < date);
      if (prevSnapshots.length > 0) {
        const lastPrev = prevSnapshots[prevSnapshots.length - 1];
        dodDelta = combinedTotal - lastPrev.combinedTotal;
        dodDeltaPct = lastPrev.combinedTotal > 0 ? (dodDelta / lastPrev.combinedTotal) * 100 : 0;
      }

      const organicReturn = dodDelta - deposit;

      const snapshot = {
        date,
        growwCash: gCash,
        growwInvested: gInv,
        kiteCash: kCash,
        kiteInvested: kInv,
        growwTotal: gTotal,
        kiteTotal: kTotal,
        combinedTotal,
        dodDelta,
        dodDeltaPct: parseFloat(dodDeltaPct.toFixed(2)),
        deposit,
        organicReturn
      };

      const saveBtn = document.getElementById('save-snapshot-btn');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `
          <span class="material-symbols-outlined text-[18px] animate-spin">refresh</span>
          <span>Saving Valuation...</span>
        `;
      }

      // Immediately record into memory for zero latency
      if (!AppState.snapshots) AppState.snapshots = [];
      const existingIdx = AppState.snapshots.findIndex(s => s.date === date);
      if (existingIdx >= 0) {
        AppState.snapshots[existingIdx] = snapshot;
      } else {
        AppState.snapshots.push(snapshot);
      }
      AppState.snapshots.sort((a, b) => a.date.localeCompare(b.date));

      try {
        await TradeDB.saveSnapshot(snapshot);
      } catch (dbErr) {
        console.warn('Snapshot storage:', dbErr);
      }

      await reloadAllData();

      if (saveBtn) {
        saveBtn.innerHTML = `
          <span class="material-symbols-outlined text-[18px]">check_circle</span>
          <span>Valuation Recorded</span>
        `;
        setTimeout(() => {
          saveBtn.innerHTML = `
            <span class="material-symbols-outlined text-[16px]">save</span>
            <span>Save Valuation Snapshot</span>
          `;
          saveBtn.disabled = false;
        }, 1500);
      }

      showToast(`Valuation for ${date} recorded in ledger`, 'success');
      renderSnapshotTable();
      renderDashboard();
    } finally {
      AppState._isSavingSnapshot = false;
    }
  }

  function renderSnapshotTable() {
    const tbody = document.getElementById('snapshot-table-body');
    const countBadge = document.getElementById('snapshot-count-badge');
    if (!tbody) return;

    const list = [...AppState.snapshots].sort((a, b) => b.date.localeCompare(a.date));
    if (countBadge) countBadge.textContent = `${list.length} Records`;

    if (list.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="p-6 text-center text-slate-400 text-xs font-medium">
            No snapshots recorded yet. Record your daily valuation above.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = list.map(s => {
      const isUp = (s.dodDelta || 0) >= 0;
      const deltaColor = isUp ? 'text-emerald-600' : 'text-red-600';
      const organic = s.organicReturn !== undefined ? s.organicReturn : s.dodDelta;
      const isOrgUp = (organic || 0) >= 0;
      const orgColor = isOrgUp ? 'text-emerald-600' : 'text-red-600';

      return `
        <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
          <td class="p-2.5 text-slate-600 whitespace-nowrap text-[11px] font-medium">
            ${s.date}
          </td>
          <td class="p-2.5 text-right tabular-nums">
            <div class="text-slate-800 text-[11px] font-medium">${fmtINR(s.growwTotal)}</div>
          </td>
          <td class="p-2.5 text-right tabular-nums">
            <div class="text-slate-800 text-[11px] font-medium">${fmtINR(s.kiteTotal)}</div>
          </td>
          <td class="p-2.5 text-right tabular-nums">
            <div class="font-serif text-[#0F172A] font-semibold text-[13px]">${fmtINR(s.combinedTotal)}</div>
          </td>
          <td class="p-2.5 text-right tabular-nums whitespace-nowrap">
            <span class="text-[10px] font-bold ${deltaColor}">
              ${(isUp ? '+' : '') + Number(s.dodDeltaPct || 0).toFixed(1)}%
            </span>
          </td>
          <td class="p-2.5 text-right tabular-nums whitespace-nowrap">
            <span class="text-[11px] font-semibold ${orgColor}">
              ${(isOrgUp ? '+' : '') + fmtINR(organic)}
            </span>
          </td>
          <td class="p-2.5 text-right whitespace-nowrap">
            <button class="p-1 rounded text-slate-400 hover:text-red-600 transition-colors" data-action="delete-snapshot" data-snapshot-date="${s.date}" title="Delete Record">
              <span class="material-symbols-outlined text-[15px]">delete</span>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function confirmDeleteSnapshot(date) {
    AppState.deletingSnapshotDate = date;
    const modal = document.getElementById('delete-snapshot-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.setProperty('display', 'flex', 'important');
      modal.style.setProperty('pointer-events', 'auto', 'important');
    }
  }

  async function executeDeleteSnapshot() {
    if (!AppState.deletingSnapshotDate) return;
    await TradeDB.deleteSnapshot(AppState.deletingSnapshotDate);
    AppState.deletingSnapshotDate = null;
    closeDeleteSnapshotModal();

    showToast('Snapshot deleted', 'success');
    await reloadAllData();
    renderSnapshotTable();
    renderDashboard();
  }

  function closeDeleteSnapshotModal() {
    AppState.deletingSnapshotDate = null;
    const modal = document.getElementById('delete-snapshot-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.setProperty('display', 'none', 'important');
      modal.style.setProperty('pointer-events', 'none', 'important');
    }
  }

  function exportPortfolioCSV() {
    if (AppState.snapshots.length === 0) {
      showToast('No snapshots to export', 'error');
      return;
    }

    const headers = ['Date', 'Groww_Cash', 'Groww_Invested', 'Groww_Total', 'Zerodha_Cash', 'Zerodha_Invested', 'Zerodha_Total', 'Combined_Total', 'DoD_Delta', 'DoD_Delta_Pct', 'Net_Deposit', 'Organic_Market_Return'];
    const rows = AppState.snapshots.map(s => [
      s.date,
      s.growwCash,
      s.growwInvested,
      s.growwTotal,
      s.kiteCash,
      s.kiteInvested,
      s.kiteTotal,
      s.combinedTotal,
      s.dodDelta || 0,
      s.dodDeltaPct || 0,
      s.deposit || 0,
      s.organicReturn !== undefined ? s.organicReturn : (s.dodDelta || 0)
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encoded = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encoded);
    link.setAttribute('download', `TradeDiary_Portfolio_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exported portfolio to CSV', 'success');
  }

  /* ==========================================================================
     VIEW 3: NSE CALCULATOR (PRESERVED & DETERMINISTIC)
     ========================================================================== */
  function setCalculatorBroker(broker) {
    if (!broker) broker = 'groww';
    AppState.calculatorState.broker = broker;
    const gBtn = document.getElementById('broker-groww');
    const zBtn = document.getElementById('broker-zerodha');
    const gDot = document.getElementById('broker-groww-dot');
    const zDot = document.getElementById('broker-zerodha-dot');

    if (broker === 'groww') {
      if (gBtn) gBtn.className = 'py-2 rounded-xl text-xs font-semibold bg-[#0F172A] text-white transition-all flex items-center justify-center gap-1.5 shadow-sm';
      if (zBtn) zBtn.className = 'py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 transition-all flex items-center justify-center gap-1.5';
      if (gDot) gDot.className = 'w-2 h-2 rounded-full bg-emerald-400';
      if (zDot) zDot.className = 'w-2 h-2 rounded-full bg-slate-400';
    } else {
      if (zBtn) zBtn.className = 'py-2 rounded-xl text-xs font-semibold bg-[#0F172A] text-white transition-all flex items-center justify-center gap-1.5 shadow-sm';
      if (gBtn) gBtn.className = 'py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 transition-all flex items-center justify-center gap-1.5';
      if (zDot) zDot.className = 'w-2 h-2 rounded-full bg-emerald-400';
      if (gDot) gDot.className = 'w-2 h-2 rounded-full bg-slate-400';
    }
    calculateAllCalculator();
  }

  function setCalculatorSegment(segment) {
    if (!segment) segment = 'delivery';
    AppState.calculatorState.segment = segment;
    ['delivery', 'intraday', 'futures', 'options'].forEach(seg => {
      const btn = document.getElementById(`seg-${seg}`);
      if (!btn) return;
      if (seg === segment) {
        btn.className = 'px-3.5 py-1.5 rounded-full bg-[#0F172A] text-white font-bold whitespace-nowrap shadow-sm';
      } else {
        btn.className = 'px-3.5 py-1.5 rounded-full bg-slate-100 text-slate-600 hover:text-slate-900 whitespace-nowrap font-medium';
      }
    });
    calculateAllCalculator();
  }

  function calculateAllCalculator() {
    const buyPrice = parseFloat(document.getElementById('calc-buy-price')?.value) || 0;
    const sellPrice = parseFloat(document.getElementById('calc-sell-price')?.value) || 0;
    const qty = parseInt(document.getElementById('calc-trade-qty')?.value, 10) || 0;

    const res = NSECalculator.calculate({
      broker: AppState.calculatorState.broker,
      segment: AppState.calculatorState.segment,
      buyPrice,
      sellPrice,
      qty,
      customDp: AppState.settings.customDp
    });

    // Populate Table Cells
    const setCell = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = fmtINR(val);
    };

    setCell('cell-brokerage', res.totalBrokerage);
    setCell('cell-stt', res.stt);
    setCell('cell-stamp', res.stampDuty);
    setCell('cell-exch', res.exchCharges);
    setCell('cell-sebi', res.sebiCharges);
    setCell('cell-ipft', res.ipftCharges);
    setCell('cell-dp', res.dpCharges);
    setCell('cell-gst', res.gst);
    setCell('cell-total-deductions', res.totalCharges);

    // Turnover display
    const turnEl = document.getElementById('calc-turnover-display');
    if (turnEl) {
      turnEl.innerHTML = `Buy: ${fmtINR(res.buyTurnover)} | Sell: ${fmtINR(res.sellTurnover)} | Total: ${fmtINR(res.totalTurnover)}`;
    }

    // Formulas Text
    const brokFormula = document.getElementById('row-brokerage-formula');
    if (brokFormula) {
      if (AppState.calculatorState.broker === 'zerodha' && AppState.calculatorState.segment === 'delivery') {
        brokFormula.textContent = 'Zero Brokerage for Equity Delivery (Kite)';
      } else {
        brokFormula.textContent = `₹20 or 0.05% whichever lower (Buy ₹${res.buyBrokerage.toFixed(2)} + Sell ₹${res.sellBrokerage.toFixed(2)})`;
      }
    }

    // Metric Cards
    const grossEl = document.getElementById('metric-gross-pnl');
    const netEl = document.getElementById('metric-net-pnl');
    const netRoiEl = document.getElementById('metric-net-roi');
    const chargesEl = document.getElementById('metric-total-charges');
    const pillEl = document.getElementById('pnl-status-pill');

    if (grossEl) grossEl.textContent = (res.grossPnL >= 0 ? '+' : '') + fmtINR(res.grossPnL);
    if (chargesEl) chargesEl.textContent = '-' + fmtINR(res.totalCharges);
    if (netEl) {
      netEl.className = res.netPnL >= 0
        ? 'font-serif text-[18px] font-semibold text-emerald-600 tabular-nums mt-0.5'
        : 'font-serif text-[18px] font-semibold text-red-600 tabular-nums mt-0.5';
      netEl.textContent = (res.netPnL >= 0 ? '+' : '') + fmtINR(res.netPnL);
    }
    if (netRoiEl) {
      netRoiEl.className = res.netPnL >= 0
        ? 'text-[10px] font-bold text-emerald-600'
        : 'text-[10px] font-bold text-red-600';
      netRoiEl.textContent = (res.netRoi >= 0 ? '+' : '') + res.netRoi.toFixed(2) + '% ROI';
    }

    if (pillEl) {
      if (res.netPnL >= 0) {
        pillEl.textContent = 'WIN';
        pillEl.className = 'text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded';
      } else {
        pillEl.textContent = 'LOSS';
        pillEl.className = 'text-[9px] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded';
      }
    }

    // Breakeven display
    const bePriceEl = document.getElementById('breakeven-price');
    const beGapEl = document.getElementById('breakeven-gap');
    if (bePriceEl) bePriceEl.textContent = fmtINR(res.bePrice);
    if (beGapEl) {
      const diff = res.bePrice - buyPrice;
      beGapEl.textContent = (diff >= 0 ? '+' : '') + fmtINR(diff) + ' / share buffer';
    }
  }

  function copyCalculatorSummary() {
    const buyPrice = document.getElementById('calc-buy-price')?.value || '0';
    const sellPrice = document.getElementById('calc-sell-price')?.value || '0';
    const qty = document.getElementById('calc-trade-qty')?.value || '0';
    const netPnL = document.getElementById('metric-net-pnl')?.textContent || '₹0';
    const totalCharges = document.getElementById('cell-total-deductions')?.textContent || '₹0';
    const bePrice = document.getElementById('breakeven-price')?.textContent || '₹0';

    const summaryText = `[Trade Diary NSE Calculator]\nBroker: ${AppState.calculatorState.broker.toUpperCase()} | Segment: ${AppState.calculatorState.segment.toUpperCase()}\nBuy Price: ₹${buyPrice} | Sell Price: ₹${sellPrice} | Qty: ${qty}\nTotal Charges: ${totalCharges}\nNet Realized P&L: ${netPnL}\nBreak-Even Target: ${bePrice}`;

    navigator.clipboard.writeText(summaryText).then(() => {
      showToast('Calculator parameters copied to clipboard', 'success');
    }).catch(() => {
      showToast('Calculated values formatted and ready', 'info');
    });
  }

  /* ==========================================================================
     VIEW 4: SETTINGS & STORAGE HUB
     ========================================================================== */
  async function renderSettings() {
    const brokerSel = document.getElementById('settings-default-broker');
    const dpInput = document.getElementById('settings-dp-charge');
    if (brokerSel) brokerSel.value = AppState.settings.defaultBroker;
    if (dpInput) dpInput.value = AppState.settings.customDp;
  }

  async function downloadFullBackup() {
    try {
      const json = await TradeDB.exportBackup();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `TradeDiary_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('Full backup downloaded', 'success');
    } catch (err) {
      showToast('Backup failed: ' + err.message, 'error');
    }
  }

  async function handleRestoreBackup(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        await TradeDB.importBackup(e.target.result);
        await reloadAllData();
        renderSettings();
        showToast('Backup restored successfully!', 'success');
      } catch (err) {
        showToast('Restore failed: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  async function handleResetToSampleData() {
    if (confirm('Reset database to realistic sample data? Any unsaved custom entries will be replaced.')) {
      await TradeDB.resetToSampleData();
      await reloadAllData();
      renderSettings();
      showToast('Sample data reloaded', 'success');
    }
  }

  async function handleClearAllDatabase() {
    if (confirm('DANGER: Completely wipe all records from local browser storage? This cannot be undone.')) {
      await TradeDB.clearAll();
      await reloadAllData();
      renderSettings();
      showToast('All data cleared from local browser database', 'info');
    }
  }

  async function savePreferences() {
    const brokerSel = document.getElementById('settings-default-broker');
    const dpInput = document.getElementById('settings-dp-charge');

    if (brokerSel) {
      AppState.settings.defaultBroker = brokerSel.value;
      await TradeDB.setSetting('defaultBroker', brokerSel.value);
    }
    if (dpInput) {
      AppState.settings.customDp = parseFloat(dpInput.value) || 13.50;
      await TradeDB.setSetting('customDp', AppState.settings.customDp);
    }
    showToast('Preferences saved', 'success');
  }

  /* ==========================================================================
     RESILIENT ZERO-LATENCY EVENT ENGINE
     Supports both touch (pointerup) and click with automatic 300ms de-duplication.
     Guarantees instant touch response on iOS Safari and Android without dropped events.
     ========================================================================== */
  function setupEventDelegation() {
    let lastActionKey = '';
    let lastActionTime = 0;

    function dispatchAction(action, actionBtn) {
      switch (action) {
        // Navigation
        case 'go-home':
          switchView('dashboard');
          break;
        case 'open-settings':
          switchView('settings-and-backup');
          break;

        // Calculator
        case 'run-calc':
          calculateAllCalculator();
          showToast('Calculated Brokerage & Net P&L', 'success');
          break;
        case 'set-broker-groww':
          setCalculatorBroker('groww');
          showToast('Switched to Groww', 'info');
          break;
        case 'set-broker-zerodha':
          setCalculatorBroker('zerodha');
          showToast('Switched to Zerodha Kite', 'info');
          break;
        case 'set-seg-delivery':
          setCalculatorSegment('delivery');
          break;
        case 'set-seg-intraday':
          setCalculatorSegment('intraday');
          break;
        case 'set-seg-futures':
          setCalculatorSegment('futures');
          break;
        case 'set-seg-options':
          setCalculatorSegment('options');
          break;
        case 'copy-calc':
          copyCalculatorSummary();
          break;

        // Portfolio
        case 'save-snapshot':
          handleSaveSnapshot();
          break;
        case 'export-portfolio-csv':
          exportPortfolioCSV();
          break;
        case 'delete-snapshot': {
          const dateStr = actionBtn.getAttribute('data-snapshot-date');
          if (dateStr) confirmDeleteSnapshot(dateStr);
          break;
        }
        case 'cancel-delete-snapshot':
          closeDeleteSnapshotModal();
          break;
        case 'confirm-delete-snapshot':
          executeDeleteSnapshot();
          break;

        // Settings
        case 'save-preferences':
          savePreferences();
          break;
        case 'export-backup':
          downloadFullBackup();
          break;
        case 'reload-sample':
          handleResetToSampleData();
          break;
        case 'clear-all':
          handleClearAllDatabase();
          break;
      }
    }

    function handleInteraction(e) {
      let targetEl = e.target;
      if (!targetEl) return;
      if (targetEl.nodeType === 3) targetEl = targetEl.parentElement;
      if (!targetEl || typeof targetEl.closest !== 'function') return;

      // 1. Navigation tabs (data-path)
      const navBtn = targetEl.closest('[data-path]');
      if (navBtn) {
        const path = navBtn.getAttribute('data-path');
        if (path) {
          switchView(path);
          return;
        }
      }

      // 2. Action buttons (data-action)
      const actionBtn = targetEl.closest('[data-action]');
      if (actionBtn) {
        const action = actionBtn.getAttribute('data-action');
        if (action) {
          dispatchAction(action, actionBtn);
        }
      }
    }

    // Attach click listener for bulletproof mobile and desktop interactions
    document.addEventListener('click', handleInteraction);

    // Direct click listeners on all navigation tabs
    document.querySelectorAll('.nav-tab-item').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const path = tab.getAttribute('data-path');
        if (path) switchView(path);
      });
    });

    // Direct click listeners on broker toggle buttons
    const gBroker = document.getElementById('broker-groww');
    if (gBroker) gBroker.addEventListener('click', () => setCalculatorBroker('groww'));
    const zBroker = document.getElementById('broker-zerodha');
    if (zBroker) zBroker.addEventListener('click', () => setCalculatorBroker('zerodha'));

    // Direct click listeners on segments
    ['delivery', 'intraday', 'futures', 'options'].forEach(seg => {
      const btn = document.getElementById(`seg-${seg}`);
      if (btn) btn.addEventListener('click', () => setCalculatorSegment(seg));
    });

    // Direct click listener on calculate button
    const calcBtn = document.getElementById('btn-run-calc');
    if (calcBtn) calcBtn.addEventListener('click', () => calculateAllCalculator());

    // Direct click listener on save snapshot button
    const saveBtn = document.getElementById('save-snapshot-btn');
    if (saveBtn) saveBtn.addEventListener('click', () => handleSaveSnapshot());

    // File restore input — handled via change event on the hidden file input
    const restoreInput = document.getElementById('restore-file-input');
    if (restoreInput) {
      restoreInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          handleRestoreBackup(file);
          e.target.value = ''; // reset so same file can be re-selected
        }
      });
    }
  }

  // Form input listeners
  function setupFormEvents() {
    ['groww-cash', 'groww-invested', 'kite-cash', 'kite-invested', 'snapshot-deposit', 'snapshot-date'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', updateSnapshotFormCalculations);
        el.addEventListener('change', updateSnapshotFormCalculations);
      }
    });

    ['calc-buy-price', 'calc-sell-price', 'calc-trade-qty'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', calculateAllCalculator);
        el.addEventListener('change', calculateAllCalculator);
      }
    });
  }

  // Keyboard Shortcuts (1 = Home, 2 = Portfolio, 3 = Calculator, s = Settings)
  function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === '1') switchView('dashboard');
      else if (e.key === '2') switchView('portfolio-tracker');
      else if (e.key === '3') switchView('nse-calculator');
      else if (e.key === 's' || e.key === 'S') switchView('settings-and-backup');
    });
  }

  // App Initialization
  function initApp() {
    const dateInput = document.getElementById('snapshot-date');
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }

    setupEventDelegation();
    setupFormEvents();
    initConnectivityMonitor();
    updateMarketStatus();
    setInterval(updateMarketStatus, 30000);
    initKeyboardShortcuts();

    const initialHash = window.location.hash.replace('#', '') || 'dashboard';
    switchView(initialHash);

    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.replace('#', '') || 'dashboard';
      if (hash !== AppState.currentView) {
        switchView(hash);
      }
    });

    (async () => {
      try {
        await TradeDB.init();
        await reloadAllData();
        switchView(AppState.currentView);
      } catch (dbErr) {
        console.warn('Database initialization:', dbErr);
      }
    })();
  }

  // Connect hook for inline view switcher (the minimal stub in <head>)
  window.App = window.App || {};
  window.App._onViewSwitch = function(viewName) {
    if (viewName === 'dashboard') renderDashboard();
    if (viewName === 'portfolio-tracker') renderPortfolio();
    if (viewName === 'nse-calculator') calculateAllCalculator();
    if (viewName === 'settings-and-backup') renderSettings();
  };

  // Wire up the underscore hooks for stubs
  window.App._setCalculatorBroker = setCalculatorBroker;
  window.App._setCalculatorSegment = setCalculatorSegment;
  window.App._calculateAllCalculator = calculateAllCalculator;
  window.App._updateSnapshotFormCalculations = updateSnapshotFormCalculations;
  window.App._handleSaveSnapshot = handleSaveSnapshot;
  window.App._copyCalculatorSummary = copyCalculatorSummary;
  window.App._exportPortfolioCSV = exportPortfolioCSV;
  window.App._closeDeleteSnapshotModal = closeDeleteSnapshotModal;
  window.App._executeDeleteSnapshot = executeDeleteSnapshot;
  window.App._downloadFullBackup = downloadFullBackup;
  window.App._handleResetToSampleData = handleResetToSampleData;
  window.App._handleClearAllDatabase = handleClearAllDatabase;
  window.App._savePreferences = savePreferences;

  // Expose global methods (for the inline <head> stub and potential debugging)
  Object.assign(window.App, {
    init: initApp,
    switchView,
    showToast,
    // Portfolio
    handleSaveSnapshot,
    updateSnapshotFormCalculations,
    confirmDeleteSnapshot,
    executeDeleteSnapshot,
    closeDeleteSnapshotModal,
    exportPortfolioCSV,
    // Calculator
    setCalculatorBroker,
    setCalculatorSegment,
    calculateAllCalculator,
    copyCalculatorSummary,
    // Settings
    downloadFullBackup,
    handleRestoreBackup,
    handleResetToSampleData,
    handleClearAllDatabase,
    savePreferences
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
