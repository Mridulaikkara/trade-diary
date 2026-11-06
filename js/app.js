/**
 * Trade Diary — Core Application Engine
 * High-performance, offline-first portfolio tracker and deterministic NSE brokerage calculator.
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
      const snaps = await TradeDB.getAllSnapshots();
      // Sort snapshots chronologically
      snaps.sort((a, b) => a.date.localeCompare(b.date));
      AppState.snapshots = snaps;

      const brokerSetting = await TradeDB.getSetting('defaultBroker');
      const dpSetting = await TradeDB.getSetting('customDp');
      if (brokerSetting) AppState.settings.defaultBroker = brokerSetting;
      if (dpSetting) AppState.settings.customDp = parseFloat(dpSetting) || 13.50;

      // Sync calculator state default
      AppState.calculatorState.broker = AppState.settings.defaultBroker || 'groww';
    } catch (err) {
      console.warn('Data reload fallback:', err);
    }
  }

  // Navigation Switcher (Instant response)
  function switchView(viewName) {
    if (!viewName) viewName = 'dashboard';
    const validViews = ['dashboard', 'portfolio-tracker', 'nse-calculator', 'settings-and-backup'];
    if (!validViews.includes(viewName)) viewName = 'dashboard';

    AppState.currentView = viewName;

    // Toggle panels
    document.querySelectorAll('.view-panel').forEach(panel => {
      panel.classList.remove('active');
      panel.style.display = 'none';
    });

    const target = document.getElementById(`view-${viewName}`);
    if (target) {
      target.classList.add('active');
      target.style.display = 'block';
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

    // Render active view
    if (viewName === 'dashboard') renderDashboard();
    else if (viewName === 'portfolio-tracker') renderPortfolio();
    else if (viewName === 'nse-calculator') calculateAllCalculator();
    else if (viewName === 'settings-and-backup') renderSettings();
  }

  /* ==========================================================================
     VIEW 1: DASHBOARD (PORTFOLIO VALUE & GROWTH INSIGHTS)
     ========================================================================== */
  function renderDashboard() {
    const snapshots = AppState.snapshots;
    const latestSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
    const prevSnapshot = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;

    // 1. Hero Total Valuation
    const totalVal = latestSnapshot ? (Number(latestSnapshot.combinedTotal) || 0) : 273088;
    const totalValEl = document.getElementById('dash-total-val');
    const headerValEl = document.getElementById('header-total-valuation');

    if (totalValEl) totalValEl.innerHTML = fmtINR(totalVal);
    if (headerValEl) headerValEl.textContent = fmtINR(totalVal);

    // 2. Dual Broker Cards (Groww & Zerodha Kite)
    if (latestSnapshot) {
      const gVal = Number(latestSnapshot.growwTotal) || 0;
      const kVal = Number(latestSnapshot.kiteTotal) || 0;
      const gInv = Number(latestSnapshot.growwInvested) || 0;
      const kInv = Number(latestSnapshot.kiteInvested) || 0;
      const gCash = Number(latestSnapshot.growwCash) || 0;
      const kCash = Number(latestSnapshot.kiteCash) || 0;

      const gShare = totalVal > 0 ? ((gVal / totalVal) * 100).toFixed(1) : '0.0';
      const kShare = totalVal > 0 ? ((kVal / totalVal) * 100).toFixed(1) : '0.0';

      const gShareEl = document.getElementById('dash-groww-share');
      const gValEl = document.getElementById('dash-groww-val');
      const gInvEl = document.getElementById('dash-groww-inv');
      const gCashEl = document.getElementById('dash-groww-cash');

      if (gShareEl) gShareEl.textContent = `${gShare}%`;
      if (gValEl) gValEl.innerHTML = fmtINR(gVal);
      if (gInvEl) gInvEl.innerHTML = fmtINR(gInv);
      if (gCashEl) gCashEl.innerHTML = fmtINR(gCash);

      const kShareEl = document.getElementById('dash-kite-share');
      const kValEl = document.getElementById('dash-kite-val');
      const kInvEl = document.getElementById('dash-kite-inv');
      const kCashEl = document.getElementById('dash-kite-cash');

      if (kShareEl) kShareEl.textContent = `${kShare}%`;
      if (kValEl) kValEl.innerHTML = fmtINR(kVal);
      if (kInvEl) kInvEl.innerHTML = fmtINR(kInv);
      if (kCashEl) kCashEl.innerHTML = fmtINR(kCash);

      // Asset Allocation Breakdown
      const totalInv = gInv + kInv;
      const totalCash = gCash + kCash;
      const invPct = totalVal > 0 ? ((totalInv / totalVal) * 100).toFixed(1) : '0.0';
      const cashPct = totalVal > 0 ? ((totalCash / totalVal) * 100).toFixed(1) : '0.0';

      const ratioEl = document.getElementById('dash-allocation-ratio');
      const barInvEl = document.getElementById('dash-alloc-bar-inv');
      const barCashEl = document.getElementById('dash-alloc-bar-cash');
      const totalInvEl = document.getElementById('dash-total-inv');
      const totalCashEl = document.getElementById('dash-total-cash');

      if (ratioEl) ratioEl.textContent = `Invested ${invPct}% · Cash ${cashPct}%`;
      if (barInvEl) barInvEl.style.width = `${invPct}%`;
      if (barCashEl) barCashEl.style.width = `${cashPct}%`;
      if (totalInvEl) totalInvEl.textContent = fmtINR(totalInv);
      if (totalCashEl) totalCashEl.textContent = fmtINR(totalCash);
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
        ? 'text-xs font-bold bg-[#0D1527] text-[#7AD9A5] border border-[rgba(244,237,224,0.12)] px-2 py-0.5 rounded-full'
        : 'text-xs font-bold bg-[#0D1527] text-[#F87171] border border-[rgba(244,237,224,0.12)] px-2 py-0.5 rounded-full';
      todayDeltaPctEl.textContent = (isUp ? '+' : '') + deltaPct + '%';
    }
    if (prevCloseEl && prevSnapshot) {
      prevCloseEl.textContent = `Prev Close: ${fmtINR(prevSnapshot.combinedTotal)}`;
    }
    if (organicTodayEl) {
      if (depositToday !== 0) {
        organicTodayEl.textContent = `Capital Inflow: ${fmtINR(depositToday)} | Market Gain: ${(organicToday >= 0 ? '+' : '')}${fmtINR(organicToday)}`;
      } else {
        organicTodayEl.textContent = `Organic Market Return: ${(organicToday >= 0 ? '+' : '')}${fmtINR(organicToday)}`;
      }
    }

    // 4. Monthly Performance (MTD / 30-Day Growth & Capital Inflows)
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

      const monthlyValEl = document.getElementById('dash-monthly-val');
      const monthlyPctEl = document.getElementById('dash-monthly-pct');
      const monthlyDepEl = document.getElementById('dash-monthly-deposits');
      const monthlyOrgEl = document.getElementById('dash-monthly-organic');

      if (monthlyValEl) monthlyValEl.textContent = (monthlyTotalGrowth >= 0 ? '+' : '') + fmtINR(monthlyTotalGrowth);
      if (monthlyPctEl) {
        const isUp = monthlyTotalGrowth >= 0;
        monthlyPctEl.className = isUp
          ? 'text-xs font-bold bg-[#0D1527] text-[#7AD9A5] border border-[rgba(244,237,224,0.12)] px-2 py-0.5 rounded-full'
          : 'text-xs font-bold bg-[#0D1527] text-[#F87171] border border-[rgba(244,237,224,0.12)] px-2 py-0.5 rounded-full';
        monthlyPctEl.textContent = `${(isUp ? '+' : '')}${monthlyGrowthPct}% MTD`;
      }
      if (monthlyDepEl) monthlyDepEl.textContent = fmtINR(monthlyDeposits);
      if (monthlyOrgEl) {
        monthlyOrgEl.className = monthlyOrganic >= 0 ? 'font-semibold text-[#7AD9A5]' : 'font-semibold text-[#F87171]';
        monthlyOrgEl.textContent = (monthlyOrganic >= 0 ? '+' : '') + fmtINR(monthlyOrganic);
      }
    }

    // 5. Render SVG Growth Curve
    renderDashboardChart();
  }

  function renderDashboardChart() {
    const svg = document.getElementById('dash-growth-svg');
    const labelsEl = document.getElementById('dash-chart-labels');
    if (!svg) return;

    let snapshots = AppState.snapshots;
    if (!snapshots || snapshots.length < 2) {
      snapshots = [
        { date: '01 May', combinedTotal: 240488 },
        { date: '05 May', combinedTotal: 244350 },
        { date: '08 May', combinedTotal: 247120 },
        { date: '12 May', combinedTotal: 253000 },
        { date: '14 May', combinedTotal: 269528 },
        { date: '16 May', combinedTotal: 273088 }
      ];
    }

    const W = 1000;
    const H = 220;
    const padX = 20;
    const padY = 20;

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
      gridLines += `<line x1="0" x2="${W}" y1="${yLine}" y2="${yLine}" stroke="rgba(244, 237, 224, 0.08)" stroke-width="1" stroke-dasharray="3 3"/>`;
    }

    // Circles
    let circlesSvg = '';
    points.forEach((p, i) => {
      const isLast = (i === points.length - 1);
      const r = isLast ? 6 : 4;
      const stroke = isLast ? 'stroke="#0D1527" stroke-width="2.5"' : '';
      circlesSvg += `
        <circle cx="${p.x}" cy="${p.y}" r="${r}" fill="#F4EDE0" ${stroke} class="chart-point" data-idx="${i}">
          <title>${p.date}: ${fmtINR(p.val)}</title>
        </circle>
      `;
    });

    svg.innerHTML = `
      <defs>
        <linearGradient id="dashGrowthGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#F4EDE0" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#F4EDE0" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      ${gridLines}
      <path d="${areaD}" fill="url(#dashGrowthGrad)"/>
      <path d="${pathD}" fill="none" stroke="#F4EDE0" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
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
        ? 'text-xs font-bold text-[#7AD9A5] tabular-nums'
        : 'text-xs font-bold text-[#F87171] tabular-nums';
      deltaEl.textContent = `${diff >= 0 ? '+' : ''}${fmtINR(diff)} (${diff >= 0 ? '+' : ''}${pct}%)`;
    }

    // True Organic Market Return = Total Value Change - Net Deposit
    const organicReturn = diff - deposit;
    if (organicEl) {
      organicEl.className = organicReturn >= 0
        ? 'font-bold text-[#7AD9A5] tabular-nums'
        : 'font-bold text-[#F87171] tabular-nums';
      organicEl.textContent = `${organicReturn >= 0 ? '+' : ''}${fmtINR(organicReturn)}`;
    }
  }

  async function handleSaveSnapshot() {
    const date = document.getElementById('snapshot-date')?.value;
    const gCash = parseFloat(document.getElementById('groww-cash')?.value) || 0;
    const gInv = parseFloat(document.getElementById('groww-invested')?.value) || 0;
    const kCash = parseFloat(document.getElementById('kite-cash')?.value) || 0;
    const kInv = parseFloat(document.getElementById('kite-invested')?.value) || 0;
    const deposit = parseFloat(document.getElementById('snapshot-deposit')?.value) || 0;

    if (!date) {
      showToast('Please select a settlement date', 'error');
      return;
    }

    const gTotal = gCash + gInv;
    const kTotal = kCash + kInv;
    const combinedTotal = gTotal + kTotal;

    // Calculate DoD delta vs previous chronologically
    let dodDelta = 0;
    let dodDeltaPct = 0;
    const prevSnapshots = AppState.snapshots.filter(s => s.date < date);
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

    await TradeDB.saveSnapshot(snapshot);
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
          <td colspan="7" class="p-6 text-center text-[#F4EDE0]/50 text-xs">
            No snapshots recorded yet. Record your daily valuation above.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = list.map(s => {
      const isUp = (s.dodDelta || 0) >= 0;
      const deltaColor = isUp ? 'text-[#7AD9A5]' : 'text-[#F87171]';
      const organic = s.organicReturn !== undefined ? s.organicReturn : s.dodDelta;
      const isOrgUp = (organic || 0) >= 0;
      const orgColor = isOrgUp ? 'text-[#7AD9A5]' : 'text-[#F87171]';

      return `
        <tr class="hover:bg-white/5 transition-colors border-b border-[rgba(244,237,224,0.08)]">
          <td class="p-2.5 text-[#F4EDE0]/65 whitespace-nowrap text-[11px]">
            ${s.date}
          </td>
          <td class="p-2.5 text-right tabular-nums">
            <div class="text-[#F4EDE0] text-[11px]">${fmtINR(s.growwTotal)}</div>
          </td>
          <td class="p-2.5 text-right tabular-nums">
            <div class="text-[#F4EDE0] text-[11px]">${fmtINR(s.kiteTotal)}</div>
          </td>
          <td class="p-2.5 text-right tabular-nums">
            <div class="font-serif text-[#F4EDE0] font-semibold text-[13px]">${fmtINR(s.combinedTotal)}</div>
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
            <button class="p-1 rounded text-[#F4EDE0]/60 hover:text-[#F87171] transition-colors" onclick="window.App.confirmDeleteSnapshot('${s.date}')" title="Delete Record">
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
    if (modal) modal.classList.remove('hidden');
  }

  async function executeDeleteSnapshot() {
    if (!AppState.deletingSnapshotDate) return;
    await TradeDB.deleteSnapshot(AppState.deletingSnapshotDate);
    AppState.deletingSnapshotDate = null;
    const modal = document.getElementById('delete-snapshot-modal');
    if (modal) modal.classList.add('hidden');

    showToast('Snapshot deleted', 'success');
    await reloadAllData();
    renderSnapshotTable();
    renderDashboard();
  }

  function closeDeleteSnapshotModal() {
    AppState.deletingSnapshotDate = null;
    const modal = document.getElementById('delete-snapshot-modal');
    if (modal) modal.classList.add('hidden');
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
    AppState.calculatorState.broker = broker;
    const gBtn = document.getElementById('broker-groww');
    const zBtn = document.getElementById('broker-zerodha');

    if (broker === 'groww') {
      if (gBtn) gBtn.className = 'py-2 rounded-xl text-xs font-semibold bg-[#F4EDE0] text-[#14213D] transition-all flex items-center justify-center gap-1.5';
      if (zBtn) zBtn.className = 'py-2 rounded-xl text-xs font-semibold text-[#F4EDE0]/70 transition-all flex items-center justify-center gap-1.5';
    } else {
      if (zBtn) zBtn.className = 'py-2 rounded-xl text-xs font-semibold bg-[#F4EDE0] text-[#14213D] transition-all flex items-center justify-center gap-1.5';
      if (gBtn) gBtn.className = 'py-2 rounded-xl text-xs font-semibold text-[#F4EDE0]/70 transition-all flex items-center justify-center gap-1.5';
    }
    calculateAllCalculator();
  }

  function setCalculatorSegment(segment) {
    AppState.calculatorState.segment = segment;
    ['delivery', 'intraday', 'futures', 'options'].forEach(seg => {
      const btn = document.getElementById(`seg-${seg}`);
      if (!btn) return;
      if (seg === segment) {
        btn.className = 'px-3.5 py-1.5 rounded-full bg-[#F4EDE0] text-[#14213D] font-bold whitespace-nowrap';
      } else {
        btn.className = 'px-3.5 py-1.5 rounded-full bg-[#1C2C4E] text-[#F4EDE0]/70 whitespace-nowrap';
      }
    });
    calculateAllCalculator();
  }

  function adjustCalculatorQty(delta) {
    const input = document.getElementById('calc-trade-qty');
    if (!input) return;
    const current = parseInt(input.value, 10) || 0;
    input.value = Math.max(1, current + delta);
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
        ? 'font-serif text-[17px] font-semibold text-[#7AD9A5] tabular-nums mt-0.5'
        : 'font-serif text-[17px] font-semibold text-[#F87171] tabular-nums mt-0.5';
      netEl.textContent = (res.netPnL >= 0 ? '+' : '') + fmtINR(res.netPnL);
    }
    if (netRoiEl) {
      netRoiEl.className = res.netPnL >= 0
        ? 'text-[10px] font-bold text-[#7AD9A5]'
        : 'text-[10px] font-bold text-[#F87171]';
      netRoiEl.textContent = (res.netRoi >= 0 ? '+' : '') + res.netRoi.toFixed(2) + '% ROI';
    }

    if (pillEl) {
      if (res.netPnL >= 0) {
        pillEl.textContent = 'WIN';
        pillEl.className = 'text-[9px] font-bold text-[#7AD9A5]';
      } else {
        pillEl.textContent = 'LOSS';
        pillEl.className = 'text-[9px] font-bold text-[#F87171]';
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
    const buyPrice = document.getElementById('calc-buy-price').value;
    const sellPrice = document.getElementById('calc-sell-price').value;
    const qty = document.getElementById('calc-trade-qty').value;
    const netPnL = document.getElementById('metric-net-pnl').textContent;
    const totalCharges = document.getElementById('cell-total-deductions').textContent;
    const bePrice = document.getElementById('breakeven-price').textContent;

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

  async function handleRestoreBackup(event) {
    const file = event.target.files && event.target.files[0];
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
    event.target.value = '';
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

  // Universal Global Event Delegation
  function setupEventDelegation() {
    document.addEventListener('click', (e) => {
      const navBtn = e.target.closest('[data-path]');
      if (navBtn) {
        e.preventDefault();
        const path = navBtn.getAttribute('data-path');
        if (path) switchView(path);
        return;
      }

      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        const action = actionBtn.getAttribute('data-action');
        e.preventDefault();

        switch (action) {
          case 'open-settings':
            switchView('settings-and-backup');
            break;
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
          case 'save-snapshot':
            handleSaveSnapshot();
            break;
          case 'export-portfolio-csv':
            exportPortfolioCSV();
            break;
          case 'copy-calc':
            copyCalculatorSummary();
            break;
        }
      }
    });
  }

  // Form input listeners
  function setupFormEvents() {
    const saveSnapBtn = document.getElementById('save-snapshot-btn');
    if (saveSnapBtn) saveSnapBtn.addEventListener('click', handleSaveSnapshot);

    ['groww-cash', 'groww-invested', 'kite-cash', 'kite-invested', 'snapshot-deposit'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', updateSnapshotFormCalculations);
    });

    ['calc-buy-price', 'calc-sell-price', 'calc-trade-qty'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', calculateAllCalculator);
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

  // Connect hook for inline view switcher
  window.App = window.App || {};
  window.App._onViewSwitch = function(viewName) {
    if (viewName === 'dashboard') renderDashboard();
    if (viewName === 'portfolio-tracker') renderPortfolio();
    if (viewName === 'nse-calculator') calculateAllCalculator();
    if (viewName === 'settings-and-backup') renderSettings();
  };

  // Expose global methods
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
    adjustCalculatorQty,
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