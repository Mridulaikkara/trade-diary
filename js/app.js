/**
 * TradeLedger Main Application Orchestrator
 * Single-Page Architecture, Reactive State, IndexedDB Sync & Offline PWA Controller
 */

(function() {
  'use strict';

  // Application State
  const AppState = {
    currentView: 'dashboard',
    trades: [],
    snapshots: [],
    settings: {
      defaultBroker: 'groww',
      customDp: 13.50
    },
    editingTradeId: null,
    deletingTradeId: null,
    deletingSnapshotDate: null,
    calculatorState: {
      broker: 'groww',
      segment: 'delivery',
      buyPrice: 1450.00,
      sellPrice: 1530.00,
      qty: 100
    },
    journalFilter: {
      search: '',
      broker: 'all',
      outcome: 'all',
      sort: 'date-desc'
    },
    analyticsTimeframe: 'FY24-25',
    dashboardInterval: '1M',
    deferredInstallPrompt: null
  };

  // Helper: Format INR
  function fmtINR(val, includeDecimals = true) {
    return NSECalculator.formatINR(val, includeDecimals);
  }

  // Toast Notification System
  function showToast(message, type = 'info') {
    const toast = document.getElementById('global-toast');
    const toastText = document.getElementById('global-toast-text');
    const toastIcon = document.getElementById('global-toast-icon');

    if (!toast || !toastText) return;

    toastText.textContent = message;
    if (toastIcon) {
      if (type === 'success') {
        toastIcon.textContent = 'check_circle';
        toastIcon.className = 'material-symbols-outlined text-[18px] text-secondary';
      } else if (type === 'error') {
        toastIcon.textContent = 'error';
        toastIcon.className = 'material-symbols-outlined text-[18px] text-error';
      } else {
        toastIcon.textContent = 'info';
        toastIcon.className = 'material-symbols-outlined text-[18px] text-primary';
      }
    }

    toast.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');
    toast.classList.add('translate-y-0', 'opacity-100');

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove('translate-y-0', 'opacity-100');
      toast.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
    }, 2800);
  }

  // Market Session Clock (Indian Standard Time: UTC+5:30)
  function updateMarketStatus() {
    const el = document.getElementById('market-session-status');
    if (!el) return;

    const now = new Date();
    // Convert to IST
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const istDate = new Date(utc + (3600000 * 5.5));

    const day = istDate.getDay(); // 0 is Sunday, 6 is Saturday
    const hours = istDate.getHours();
    const minutes = istDate.getMinutes();
    const timeVal = hours * 60 + minutes;

    const isWeekday = day >= 1 && day <= 5;
    const isLive = isWeekday && (timeVal >= 555 && timeVal <= 930); // 9:15 AM to 3:30 PM

    if (isLive) {
      el.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-secondary animate-pulse"></span>
        <span class="font-data-mono-sm text-data-mono-sm text-secondary font-semibold">NSE Live Session</span>
      `;
    } else {
      const label = (day === 0 || day === 6) ? 'NSE Weekend (Closed)' : 'NSE Market Closed';
      el.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-outline-variant"></span>
        <span class="font-data-mono-sm text-data-mono-sm text-on-surface-variant font-medium">${label}</span>
      `;
    }
  }

  // Connectivity Listener
  function initConnectivityMonitor() {
    const offlineIcon = document.getElementById('pwa-offline-icon');
    const syncStatusText = document.getElementById('sync-status-text');

    function updateStatus() {
      if (navigator.onLine) {
        if (offlineIcon) {
          offlineIcon.textContent = 'offline_bolt';
          offlineIcon.className = 'material-symbols-outlined text-[16px] text-secondary';
          offlineIcon.title = 'PWA Offline Native (Connected)';
        }
        if (syncStatusText) {
          syncStatusText.innerHTML = `
            <span class="w-2 h-2 rounded-full bg-secondary"></span>
            <span class="font-label-sm text-label-sm text-on-surface-variant font-medium tracking-wide uppercase">Local Storage • Sync Active • All data stored in browser IndexedDB</span>
          `;
        }
      } else {
        if (offlineIcon) {
          offlineIcon.textContent = 'cloud_off';
          offlineIcon.className = 'material-symbols-outlined text-[16px] text-amber-500 animate-pulse';
          offlineIcon.title = 'Offline - Running on local IndexedDB';
        }
        if (syncStatusText) {
          syncStatusText.innerHTML = `
            <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            <span class="font-label-sm text-label-sm text-amber-700 font-medium tracking-wide uppercase">Offline Mode • IndexedDB Local Engine Active</span>
          `;
        }
        showToast('Offline Mode: Operating with local cached data', 'info');
      }
    }

    window.addEventListener('online', () => {
      updateStatus();
      showToast('Back online • Synced', 'success');
    });
    window.addEventListener('offline', () => {
      updateStatus();
    });

    updateStatus();
  }

  // Navigation / View Switching
  function switchView(viewName) {
    if (!viewName) viewName = 'dashboard';

    const validViews = ['dashboard', 'trade-journal', 'portfolio-tracker', 'analytics', 'nse-calculator', 'settings-and-backup'];
    if (!validViews.includes(viewName)) {
      viewName = 'dashboard';
    }

    AppState.currentView = viewName;
    window.location.hash = viewName;

    // Toggle panels
    document.querySelectorAll('.view-panel').forEach(panel => {
      panel.classList.remove('active');
    });
    const targetPanel = document.getElementById(`view-${viewName}`);
    if (targetPanel) {
      targetPanel.classList.add('active');
    }

    // Toggle nav active classes for bottom dock
    document.querySelectorAll('.nav-tab-item, .dock-item').forEach(link => {
      if (link.getAttribute('data-path') === viewName) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      } else {
        link.classList.remove('active');
        link.removeAttribute('aria-current');
      }
    });

    // Close any open modals
    closeActionSheet();
    closeMobileSidebar();

    // Trigger specific view refreshes
    if (viewName === 'dashboard') renderDashboard();
    if (viewName === 'trade-journal') renderJournal();
    if (viewName === 'portfolio-tracker') renderPortfolio();
    if (viewName === 'analytics') renderAnalytics();
    if (viewName === 'nse-calculator') calculateAllCalculator();
    if (viewName === 'settings-and-backup') renderSettings();

    // Scroll to top of content container
    const scrollContainer = document.getElementById('main-content-scroll');
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function toggleMobileSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!sidebar) return;

    if (sidebar.classList.contains('open')) {
      closeMobileSidebar();
    } else {
      sidebar.classList.add('open');
      if (overlay) overlay.classList.remove('hidden');
    }
  }

  function closeMobileSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.add('hidden');
  }

  // iOS Action Sheet Modal Controls
  function openActionSheet() {
    const sheet = document.getElementById('action-sheet-overlay');
    if (!sheet) return;
    sheet.classList.remove('hidden');
    sheet.style.display = 'flex';
    requestAnimationFrame(() => {
      sheet.classList.add('open');
    });
  }

  function closeActionSheet(e) {
    if (e && e.target && e.target.closest && e.target.closest('.action-sheet-container') && !e.target.closest('button')) {
      return;
    }
    const sheet = document.getElementById('action-sheet-overlay');
    if (!sheet) return;
    sheet.classList.remove('open');
    setTimeout(() => {
      sheet.classList.add('hidden');
      sheet.style.display = 'none';
    }, 200);
  }

  // Keyboard navigation shortcuts: F1 to F6
  function initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Don't trigger if user is typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        if (e.key === 'Escape') {
          document.activeElement.blur();
        }
        return;
      }

      switch (e.key) {
        case 'F1':
          e.preventDefault();
          switchView('dashboard');
          break;
        case 'F2':
          e.preventDefault();
          switchView('trade-journal');
          break;
        case 'F3':
          e.preventDefault();
          switchView('portfolio-tracker');
          break;
        case 'F4':
          e.preventDefault();
          switchView('analytics');
          break;
        case 'F5':
          e.preventDefault();
          switchView('nse-calculator');
          break;
        case 'F6':
          e.preventDefault();
          switchView('settings-and-backup');
          break;
      }
    });
  }

  // Load All Data from IndexedDB
  async function reloadAllData() {
    try {
      AppState.trades = await TradeDB.getTrades();
      AppState.snapshots = await TradeDB.getSnapshots();
      AppState.settings.defaultBroker = (await TradeDB.getSetting('defaultBroker')) || 'groww';
      AppState.settings.customDp = Number(await TradeDB.getSetting('customDp')) || 13.50;

      updateGlobalHeaderValuation();
    } catch (err) {
      console.error('Data reload failed:', err);
    }
  }

  function updateGlobalHeaderValuation() {
    const totalValEl = document.getElementById('header-total-valuation');
    if (!totalValEl) return;

    if (AppState.snapshots.length > 0) {
      const latest = AppState.snapshots[AppState.snapshots.length - 1];
      totalValEl.textContent = fmtINR(latest.combinedTotal);
    } else {
      totalValEl.textContent = '₹0.00';
    }
  }

  /* ==========================================================================
     VIEW 1: DASHBOARD
     ========================================================================== */
  function renderDashboard() {
    const snapshots = AppState.snapshots;
    const trades = AppState.trades;

    // 1. Total Portfolio Value
    const latestSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
    const prevSnapshot = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;

    const totalVal = latestSnapshot ? latestSnapshot.combinedTotal : 0;
    const totalValEl = document.getElementById('dash-total-val');
    if (totalValEl) totalValEl.innerHTML = fmtINR(totalVal);

    // 2. Today's Change
    const deltaVal = latestSnapshot ? (latestSnapshot.dodDelta || (prevSnapshot ? latestSnapshot.combinedTotal - prevSnapshot.combinedTotal : 0)) : 0;
    const deltaPct = latestSnapshot && prevSnapshot && prevSnapshot.combinedTotal > 0
      ? ((deltaVal / prevSnapshot.combinedTotal) * 100).toFixed(2)
      : '0.00';

    const todayDeltaEl = document.getElementById('dash-today-delta');
    const todayDeltaPctEl = document.getElementById('dash-today-delta-pct');
    const prevCloseEl = document.getElementById('dash-prev-close');

    if (todayDeltaEl) {
      todayDeltaEl.className = deltaVal >= 0
        ? 'font-display-lg text-display-lg text-secondary tracking-tight font-bold'
        : 'font-display-lg text-display-lg text-error tracking-tight font-bold';
      todayDeltaEl.textContent = (deltaVal >= 0 ? '+' : '') + fmtINR(deltaVal);
    }
    if (todayDeltaPctEl) {
      todayDeltaPctEl.className = deltaVal >= 0
        ? 'px-2 py-0.5 rounded bg-secondary-container text-on-secondary-container font-data-mono-sm text-data-mono-sm font-semibold'
        : 'px-2 py-0.5 rounded bg-error-container text-on-error-container font-data-mono-sm text-data-mono-sm font-semibold';
      todayDeltaPctEl.textContent = (deltaVal >= 0 ? '+' : '') + deltaPct + '%';
    }
    if (prevCloseEl && prevSnapshot) {
      prevCloseEl.textContent = `Prev Close: ${fmtINR(prevSnapshot.combinedTotal)}`;
    }

    // 3. Total Realised P&L
    let realisedPnL = 0;
    let winCount = 0;
    let lossCount = 0;
    let totalInvestedCost = 0;

    trades.forEach(t => {
      realisedPnL += Number(t.netPnL || 0);
      if (t.netPnL > 0) winCount++;
      else if (t.netPnL < 0) lossCount++;
      totalInvestedCost += (Number(t.buyPrice || 0) * Number(t.qty || 0));
    });

    const totalRealisedEl = document.getElementById('dash-realised-pnl');
    const realisedRoiEl = document.getElementById('dash-realised-roi');
    if (totalRealisedEl) {
      totalRealisedEl.className = realisedPnL >= 0
        ? 'font-display-lg text-display-lg text-secondary tracking-tight font-bold'
        : 'font-display-lg text-display-lg text-error tracking-tight font-bold';
      totalRealisedEl.textContent = (realisedPnL >= 0 ? '+' : '') + fmtINR(realisedPnL);
    }
    if (realisedRoiEl && totalInvestedCost > 0) {
      const roi = (realisedPnL / totalInvestedCost) * 100;
      realisedRoiEl.textContent = `ROI ${(roi >= 0 ? '+' : '')}${roi.toFixed(1)}%`;
    }

    // 4. Trade Execution Stats
    const totalTrades = trades.length;
    const winRate = totalTrades > 0 ? ((winCount / totalTrades) * 100).toFixed(1) : '0.0';
    const winLossEl = document.getElementById('dash-trade-count');
    const winRateEl = document.getElementById('dash-win-rate');
    const barWin = document.getElementById('dash-bar-win');
    const barLoss = document.getElementById('dash-bar-loss');
    const winDetailsEl = document.getElementById('dash-win-details');

    if (winLossEl) winLossEl.textContent = totalTrades;
    if (winRateEl) winRateEl.textContent = `${winRate}%`;
    if (barWin) barWin.style.width = `${winRate}%`;
    if (barLoss) barLoss.style.width = `${(100 - Number(winRate)).toFixed(1)}%`;
    if (winDetailsEl) {
      winDetailsEl.innerHTML = `<span>${winCount} Profitable</span><span>${lossCount} Losses</span>`;
    }

    // Broker Cards: Groww vs Zerodha
    if (latestSnapshot) {
      const gVal = latestSnapshot.growwTotal || 0;
      const kVal = latestSnapshot.kiteTotal || 0;
      const gShare = totalVal > 0 ? ((gVal / totalVal) * 100).toFixed(1) : '0.0';
      const kShare = totalVal > 0 ? ((kVal / totalVal) * 100).toFixed(1) : '0.0';

      const gShareEl = document.getElementById('dash-groww-share');
      const gValEl = document.getElementById('dash-groww-val');
      const gInvEl = document.getElementById('dash-groww-inv');
      const gCashEl = document.getElementById('dash-groww-cash');

      if (gShareEl) gShareEl.textContent = `${gShare}%`;
      if (gValEl) gValEl.innerHTML = fmtINR(gVal);
      if (gInvEl) gInvEl.innerHTML = fmtINR(latestSnapshot.growwInvested || 0);
      if (gCashEl) gCashEl.innerHTML = fmtINR(latestSnapshot.growwCash || 0);

      const kShareEl = document.getElementById('dash-kite-share');
      const kValEl = document.getElementById('dash-kite-val');
      const kInvEl = document.getElementById('dash-kite-inv');
      const kCashEl = document.getElementById('dash-kite-cash');

      if (kShareEl) kShareEl.textContent = `${kShare}%`;
      if (kValEl) kValEl.innerHTML = fmtINR(kVal);
      if (kInvEl) kInvEl.innerHTML = fmtINR(latestSnapshot.kiteInvested || 0);
      if (kCashEl) kCashEl.innerHTML = fmtINR(latestSnapshot.kiteCash || 0);
    }

    // Render Growth SVG Chart
    renderDashboardChart();
  }

  function renderDashboardChart() {
    const svg = document.getElementById('dash-growth-svg');
    const labelsEl = document.getElementById('dash-chart-labels');
    if (!svg) return;

    const snapshots = AppState.snapshots;
    if (snapshots.length < 2) {
      svg.innerHTML = `
        <text x="500" y="120" text-anchor="middle" fill="#64748b" font-family="Inter" font-size="14">
          Record at least 2 EOD snapshots in Portfolio Tracker to generate interactive growth curve.
        </text>
      `;
      return;
    }

    // Width: 1000, Height: 240
    const W = 1000;
    const H = 220;
    const padX = 20;
    const padY = 20;

    const values = snapshots.map(s => Number(s.combinedTotal) || 0);
    const minVal = Math.min(...values) * 0.98;
    const maxVal = Math.max(...values) * 1.02;
    const range = (maxVal - minVal) || 1;

    // Generate Points
    const n = snapshots.length;
    const points = snapshots.map((s, idx) => {
      const x = padX + (idx / (n - 1)) * (W - 2 * padX);
      const val = Number(s.combinedTotal) || 0;
      const y = H - padY - ((val - minVal) / range) * (H - 2 * padY);
      return { x, y, val, date: s.date };
    });

    // Path string
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
      gridLines += `<line x1="0" x2="${W}" y1="${yLine}" y2="${yLine}" stroke="rgba(255, 255, 255, 0.05)" stroke-width="1" stroke-dasharray="3 3"/>`;
    }

    // Circles
    let circlesSvg = '';
    points.forEach((p, i) => {
      const isLast = (i === points.length - 1);
      const r = isLast ? 6 : 4;
      const stroke = isLast ? 'stroke="#1F1D20" stroke-width="2.5"' : '';
      circlesSvg += `
        <circle cx="${p.x}" cy="${p.y}" r="${r}" fill="#A79986" ${stroke} class="chart-point" data-idx="${i}">
          <title>${p.date}: ${fmtINR(p.val)}</title>
        </circle>
      `;
    });

    svg.innerHTML = `
      <defs>
        <linearGradient id="dashGrowthGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#803E2F" stop-opacity="0.38"/>
          <stop offset="100%" stop-color="#803E2F" stop-opacity="0.0"/>
        </linearGradient>
        <filter id="dashGlow" x="-10%" y="-20%" width="120%" height="150%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#803E2F" flood-opacity="0.4"/>
        </filter>
      </defs>
      ${gridLines}
      <path d="${areaD}" fill="url(#dashGrowthGrad)"/>
      <path d="${pathD}" fill="none" stroke="#803E2F" stroke-width="2.5" stroke-linecap="round" filter="url(#dashGlow)"/>
      ${circlesSvg}
    `;

    // Render Axis Labels
    if (labelsEl && n >= 2) {
      const first = snapshots[0];
      const mid = snapshots[Math.floor(n / 2)];
      const last = snapshots[n - 1];
      labelsEl.innerHTML = `
        <span>${first.date} (${fmtINR(first.combinedTotal, false)})</span>
        <span>${mid.date} (${fmtINR(mid.combinedTotal, false)})</span>
        <span class="font-semibold text-primary">${last.date} (${fmtINR(last.combinedTotal, false)})</span>
      `;
    }
  }

  /* ==========================================================================
     VIEW 2: TRADE JOURNAL
     ========================================================================== */
  function renderJournal() {
    renderJournalSummaryKPIs();
    renderJournalTable();
  }

  function renderJournalSummaryKPIs() {
    const trades = AppState.trades;
    let totalRealised = 0;
    let winCount = 0;
    let lossCount = 0;
    let totalFriction = 0;
    let sttTotal = 0;
    let dpTotal = 0;
    let otherTaxTotal = 0;

    // Filter today's trades
    const todayStr = new Date().toISOString().split('T')[0];
    let todayRealised = 0;
    let todayClosedCount = 0;

    trades.forEach(t => {
      const net = Number(t.netPnL || 0);
      const charges = Number(t.totalCharges || 0);

      totalRealised += net;
      totalFriction += charges;

      if (net > 0) winCount++;
      else if (net < 0) lossCount++;

      if (t.date === todayStr) {
        todayRealised += net;
        todayClosedCount++;
      }

      // Estimate statutory buckets
      sttTotal += charges * 0.62;
      dpTotal += charges * 0.12;
      otherTaxTotal += charges * 0.26;
    });

    const totalTrades = trades.length;
    const winRate = totalTrades > 0 ? ((winCount / totalTrades) * 100).toFixed(1) : '0.0';

    // Update KPI UI
    const todayEl = document.getElementById('journal-kpi-today-pnl');
    const todayCountEl = document.getElementById('journal-kpi-today-count');
    if (todayEl) {
      todayEl.className = todayRealised >= 0
        ? 'font-display-lg text-display-lg text-secondary tabular-nums font-semibold'
        : 'font-display-lg text-display-lg text-error tabular-nums font-semibold';
      todayEl.textContent = (todayRealised >= 0 ? '+' : '') + fmtINR(todayRealised);
    }
    if (todayCountEl) todayCountEl.textContent = `${todayClosedCount} Closed`;

    const monthlyEl = document.getElementById('journal-kpi-monthly-pnl');
    if (monthlyEl) {
      monthlyEl.className = totalRealised >= 0
        ? 'font-display-lg text-display-lg text-secondary tabular-nums font-semibold'
        : 'font-display-lg text-display-lg text-error tabular-nums font-semibold';
      monthlyEl.textContent = (totalRealised >= 0 ? '+' : '') + fmtINR(totalRealised);
    }

    const winRateEl = document.getElementById('journal-kpi-winrate');
    const winRateRatioEl = document.getElementById('journal-kpi-winloss-ratio');
    const barWin = document.getElementById('journal-kpi-bar-win');
    const barLoss = document.getElementById('journal-kpi-bar-loss');

    if (winRateEl) winRateEl.textContent = `${winRate}%`;
    if (winRateRatioEl) winRateRatioEl.textContent = `${winCount}W : ${lossCount}L (${totalTrades} Trades)`;
    if (barWin) barWin.style.width = `${winRate}%`;
    if (barLoss) barLoss.style.width = `${(100 - Number(winRate)).toFixed(1)}%`;

    const frictionEl = document.getElementById('journal-kpi-friction');
    if (frictionEl) frictionEl.textContent = fmtINR(totalFriction);
  }

  function renderJournalTable() {
    const tbody = document.getElementById('tradeTableBody');
    const footerCount = document.getElementById('footerCount');
    if (!tbody) return;

    let list = [...AppState.trades];

    // Filter by search
    const query = AppState.journalFilter.search.trim().toLowerCase();
    if (query) {
      list = list.filter(t => 
        (t.stockName && t.stockName.toLowerCase().includes(query)) ||
        (t.stockSymbol && t.stockSymbol.toLowerCase().includes(query)) ||
        (t.strategy && t.strategy.toLowerCase().includes(query)) ||
        (t.notes && t.notes.toLowerCase().includes(query))
      );
    }

    // Filter by broker
    if (AppState.journalFilter.broker !== 'all') {
      list = list.filter(t => t.broker === AppState.journalFilter.broker);
    }

    // Filter by outcome
    if (AppState.journalFilter.outcome !== 'all') {
      list = list.filter(t => t.outcome === AppState.journalFilter.outcome);
    }

    // Sort
    const sortVal = AppState.journalFilter.sort;
    list.sort((a, b) => {
      if (sortVal === 'date-desc') return b.date.localeCompare(a.date);
      if (sortVal === 'date-asc') return a.date.localeCompare(b.date);
      if (sortVal === 'pnl-desc') return Number(b.netPnL || 0) - Number(a.netPnL || 0);
      if (sortVal === 'pnl-asc') return Number(a.netPnL || 0) - Number(b.netPnL || 0);
      return 0;
    });

    if (footerCount) footerCount.textContent = `${list.length} Records`;

    if (list.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="p-6 text-center text-[#8e8e98] text-xs">
            No matching trades found. Log a completed swing trade above.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = list.map(t => {
      const isWin = Number(t.netPnL || 0) >= 0;
      const pnlColor = isWin ? 'text-[#d5f6be]' : 'text-red-400';
      const pnlBg = isWin ? 'bg-[#20331b] text-[#a5f368]' : 'bg-red-950 text-red-300';
      const brokerBadge = t.broker === 'zerodha'
        ? `<span class="px-2 py-0.5 rounded-full bg-[#24242e] text-white text-[10px] font-semibold">Zerodha</span>`
        : `<span class="px-2 py-0.5 rounded-full bg-[#20331b] text-[#a5f368] text-[10px] font-semibold">Groww</span>`;

      const buyTurnover = Number(t.buyPrice || 0) * Number(t.qty || 0);

      return `
        <tr class="hover:bg-white/5 transition-colors border-b border-white/5" data-id="${t.id}">
          <td class="p-2.5 text-[#8e8e98] whitespace-nowrap text-[11px]">
            ${t.date}
          </td>
          <td class="p-2.5">
            <div>
              <span class="font-serif text-[15px] font-semibold text-white block leading-tight">${t.stockSymbol}</span>
              <span class="text-[10px] text-[#8e8e98]">${t.stockName || ''}</span>
            </div>
            ${t.strategy ? `<span class="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-[#24242e] text-[#8e8e98] text-[9px]">${t.strategy}</span>` : ''}
          </td>
          <td class="p-2.5 whitespace-nowrap">
            ${brokerBadge}
          </td>
          <td class="p-2.5 text-right tabular-nums">
            <div class="text-white font-medium text-[11px]">${fmtINR(t.buyPrice)}</div>
            <div class="text-[#8e8e98] text-[10px]">${t.qty} sh</div>
          </td>
          <td class="p-2.5 text-right tabular-nums">
            <div class="text-white font-medium text-[11px]">${fmtINR(t.sellPrice)}</div>
            <div class="text-[#8e8e98] text-[10px]">${fmtINR(buyTurnover, false)}</div>
          </td>
          <td class="p-2.5 text-right tabular-nums whitespace-nowrap">
            <div class="font-serif text-[14px] font-semibold ${pnlColor}">
              ${(isWin ? '+' : '') + fmtINR(t.netPnL)}
            </div>
            <span class="px-1.5 py-0.5 rounded-full ${pnlBg} text-[9px] font-bold inline-block">${(t.netRoi >= 0 ? '+' : '') + Number(t.netRoi || 0).toFixed(1)}%</span>
          </td>
          <td class="p-2.5 text-right whitespace-nowrap">
            <div class="flex items-center justify-end gap-1">
              <button class="p-1 rounded text-[#8e8e98] hover:text-white" onclick="window.App.editTrade(${t.id})" title="Edit Trade">
                <span class="material-symbols-outlined text-[16px]">edit</span>
              </button>
              <button class="p-1 rounded text-[#8e8e98] hover:text-red-400" onclick="window.App.confirmDeleteTrade(${t.id}, '${t.stockSymbol}')" title="Delete Trade">
                <span class="material-symbols-outlined text-[16px]">delete</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Live Math calculation for Add Trade Form in Journal
  function calculateJournalFormMath() {
    const buyPrice = parseFloat(document.getElementById('buyPrice')?.value) || 0;
    const sellPrice = parseFloat(document.getElementById('sellPrice')?.value) || 0;
    const qty = parseInt(document.getElementById('tradeQty')?.value, 10) || 0;
    const broker = document.getElementById('selectedBroker')?.value || 'groww';

    const res = NSECalculator.calculate({
      broker,
      segment: 'delivery',
      buyPrice,
      sellPrice,
      qty,
      customDp: AppState.settings.customDp
    });

    const grossEl = document.getElementById('liveGrossPnL');
    const chargesEl = document.getElementById('liveTaxesCharges');
    const netEl = document.getElementById('liveNetPnL');
    const roiEl = document.getElementById('liveNetRoi');
    const statusPill = document.getElementById('liveOutcomeStatus');

    if (grossEl) grossEl.textContent = (res.grossPnL >= 0 ? '+' : '') + fmtINR(res.grossPnL);
    if (chargesEl) chargesEl.textContent = '-' + fmtINR(res.totalCharges);
    if (netEl) {
      netEl.className = res.netPnL >= 0
        ? 'font-display-lg text-display-lg font-bold text-secondary'
        : 'font-display-lg text-display-lg font-bold text-error';
      netEl.textContent = (res.netPnL >= 0 ? '+' : '') + fmtINR(res.netPnL);
    }
    if (roiEl) roiEl.textContent = (res.netRoi >= 0 ? '+' : '') + res.netRoi.toFixed(2) + '% ROI';

    if (statusPill) {
      if (res.netPnL >= 0) {
        statusPill.textContent = 'PROFITABLE WIN';
        statusPill.className = 'px-2 py-0.5 rounded bg-secondary-container text-on-secondary-container font-data-mono-sm text-data-mono-sm font-semibold';
      } else {
        statusPill.textContent = 'DEFICIT / LOSS';
        statusPill.className = 'px-2 py-0.5 rounded bg-error-container text-on-error-container font-data-mono-sm text-data-mono-sm font-semibold';
      }
    }
  }

  async function handleSaveTrade() {
    const date = document.getElementById('tradeDate')?.value;
    const stockName = document.getElementById('stockName')?.value.trim();
    const stockSymbol = document.getElementById('stockSymbol')?.value.trim().toUpperCase();
    const broker = document.getElementById('selectedBroker')?.value || 'groww';
    const buyPrice = parseFloat(document.getElementById('buyPrice')?.value) || 0;
    const sellPrice = parseFloat(document.getElementById('sellPrice')?.value) || 0;
    const qty = parseInt(document.getElementById('tradeQty')?.value, 10) || 0;
    const strategy = document.getElementById('tradeStrategy')?.value.trim() || 'Swing Trade';
    const notes = document.getElementById('tradeNotes')?.value.trim() || '';

    if (!stockSymbol) {
      showToast('Please enter a valid stock symbol (e.g. TATAPOWER)', 'error');
      return;
    }
    if (buyPrice <= 0 || sellPrice <= 0 || qty <= 0) {
      showToast('Please enter valid positive values for price and quantity', 'error');
      return;
    }

    const calc = NSECalculator.calculate({
      broker,
      segment: 'delivery',
      buyPrice,
      sellPrice,
      qty,
      customDp: AppState.settings.customDp
    });

    const tradeRecord = {
      date: date || new Date().toISOString().split('T')[0],
      stockName: stockName || stockSymbol,
      stockSymbol,
      broker,
      segment: 'delivery',
      buyPrice,
      sellPrice,
      qty,
      strategy,
      notes,
      grossPnL: calc.grossPnL,
      totalCharges: calc.totalCharges,
      netPnL: calc.netPnL,
      netRoi: calc.netRoi,
      outcome: calc.netPnL >= 0 ? 'win' : 'loss'
    };

    if (AppState.editingTradeId) {
      tradeRecord.id = AppState.editingTradeId;
      await TradeDB.saveTrade(tradeRecord);
      AppState.editingTradeId = null;
      document.getElementById('btnSaveTradeText').textContent = 'Add Swing Trade to Journal';
      showToast('Trade record updated successfully', 'success');
    } else {
      await TradeDB.saveTrade(tradeRecord);
      showToast('New swing trade saved to IndexedDB', 'success');
    }

    // Reset Form
    resetTradeForm();
    await reloadAllData();
    renderJournal();
    renderDashboard();
  }

  function resetTradeForm() {
    AppState.editingTradeId = null;
    document.getElementById('stockName').value = '';
    document.getElementById('stockSymbol').value = '';
    document.getElementById('buyPrice').value = '100.00';
    document.getElementById('sellPrice').value = '105.00';
    document.getElementById('tradeQty').value = '50';
    document.getElementById('tradeStrategy').value = '';
    document.getElementById('tradeNotes').value = '';
    const btnText = document.getElementById('btnSaveTradeText');
    if (btnText) btnText.textContent = 'Add Swing Trade to Journal';
    calculateJournalFormMath();
  }

  function editTrade(id) {
    const trade = AppState.trades.find(t => t.id === Number(id));
    if (!trade) return;

    AppState.editingTradeId = trade.id;
    document.getElementById('tradeDate').value = trade.date;
    document.getElementById('stockName').value = trade.stockName;
    document.getElementById('stockSymbol').value = trade.stockSymbol;
    document.getElementById('buyPrice').value = trade.buyPrice;
    document.getElementById('sellPrice').value = trade.sellPrice;
    document.getElementById('tradeQty').value = trade.qty;
    if (document.getElementById('tradeStrategy')) document.getElementById('tradeStrategy').value = trade.strategy || '';
    if (document.getElementById('tradeNotes')) document.getElementById('tradeNotes').value = trade.notes || '';

    // Set broker toggle
    selectJournalBroker(trade.broker);

    const btnText = document.getElementById('btnSaveTradeText');
    if (btnText) btnText.textContent = `Update Trade #${trade.id}`;

    calculateJournalFormMath();
    window.scrollTo({ top: 180, behavior: 'smooth' });
    showToast(`Loaded ${trade.stockSymbol} into editor`, 'info');
  }

  function selectJournalBroker(broker) {
    const hidden = document.getElementById('selectedBroker');
    const gBtn = document.getElementById('brokerGrowwBtn');
    const zBtn = document.getElementById('brokerZerodhaBtn');
    if (hidden) hidden.value = broker;

    if (broker === 'groww') {
      if (gBtn) gBtn.className = 'py-1.5 text-xs rounded-lg font-semibold bg-[#803E2F] text-white transition-all';
      if (zBtn) zBtn.className = 'py-1.5 text-xs rounded-lg font-semibold text-[#A79986] transition-all';
    } else {
      if (zBtn) zBtn.className = 'py-1.5 text-xs rounded-lg font-semibold bg-[#803E2F] text-white transition-all';
      if (gBtn) gBtn.className = 'py-1.5 text-xs rounded-lg font-semibold text-[#A79986] transition-all';
    }
    calculateJournalFormMath();
  }

  function confirmDeleteTrade(id, symbol) {
    AppState.deletingTradeId = id;
    const modal = document.getElementById('deleteModal');
    const label = document.getElementById('deleteStockName');
    if (label) label.textContent = symbol;
    if (modal) modal.classList.remove('hidden');
  }

  async function executeDeleteTrade() {
    if (!AppState.deletingTradeId) return;
    await TradeDB.deleteTrade(AppState.deletingTradeId);
    AppState.deletingTradeId = null;
    const modal = document.getElementById('deleteModal');
    if (modal) modal.classList.add('hidden');

    showToast('Trade record removed from IndexedDB', 'success');
    await reloadAllData();
    renderJournal();
    renderDashboard();
  }

  function closeDeleteModal() {
    AppState.deletingTradeId = null;
    const modal = document.getElementById('deleteModal');
    if (modal) modal.classList.add('hidden');
  }

  function exportJournalCSV() {
    if (AppState.trades.length === 0) {
      showToast('No trades to export', 'error');
      return;
    }

    const headers = ['Date', 'Symbol', 'StockName', 'Broker', 'Segment', 'BuyPrice', 'SellPrice', 'Quantity', 'GrossPnL', 'TotalCharges', 'NetPnL', 'NetROI_Pct', 'Strategy', 'Notes'];
    const rows = AppState.trades.map(t => [
      t.date,
      t.stockSymbol,
      `"${(t.stockName || '').replace(/"/g, '""')}"`,
      t.broker,
      t.segment,
      t.buyPrice,
      t.sellPrice,
      t.qty,
      t.grossPnL,
      t.totalCharges,
      t.netPnL,
      t.netRoi,
      `"${(t.strategy || '').replace(/"/g, '""')}"`,
      `"${(t.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encoded = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encoded);
    link.setAttribute('download', `TradeLedger_Trades_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exported trades to CSV', 'success');
  }

  /* ==========================================================================
     VIEW 3: PORTFOLIO TRACKER
     ========================================================================== */
  function renderPortfolio() {
    // Set default date to today
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

    const gSub = gCash + gInv;
    const kSub = kCash + kInv;
    const comb = gSub + kSub;

    const gSubEl = document.getElementById('groww-subtotal');
    const kSubEl = document.getElementById('kite-subtotal');
    const combEl = document.getElementById('combined-total-value');
    const deltaEl = document.getElementById('combined-dod-delta');

    if (gSubEl) gSubEl.textContent = fmtINR(gSub);
    if (kSubEl) kSubEl.textContent = fmtINR(kSub);
    if (combEl) combEl.textContent = fmtINR(comb);

    // Delta estimation vs latest recorded snapshot
    if (deltaEl && AppState.snapshots.length > 0) {
      const prev = AppState.snapshots[AppState.snapshots.length - 1];
      const diff = comb - prev.combinedTotal;
      const pct = prev.combinedTotal > 0 ? ((diff / prev.combinedTotal) * 100).toFixed(2) : '0.00';
      deltaEl.className = diff >= 0
        ? 'font-data-mono-md text-data-mono-md text-secondary font-semibold'
        : 'font-data-mono-md text-data-mono-md text-error font-semibold';
      deltaEl.textContent = `${diff >= 0 ? '+' : ''}${fmtINR(diff)} (${diff >= 0 ? '+' : ''}${pct}%)`;
    }
  }

  async function handleSaveSnapshot() {
    const date = document.getElementById('snapshot-date')?.value;
    const gCash = parseFloat(document.getElementById('groww-cash')?.value) || 0;
    const gInv = parseFloat(document.getElementById('groww-invested')?.value) || 0;
    const kCash = parseFloat(document.getElementById('kite-cash')?.value) || 0;
    const kInv = parseFloat(document.getElementById('kite-invested')?.value) || 0;

    if (!date) {
      showToast('Please select a settlement date', 'error');
      return;
    }

    const gTotal = gCash + gInv;
    const kTotal = kCash + kInv;
    const combinedTotal = gTotal + kTotal;

    // Calculate DoD delta
    let dodDelta = 0;
    let dodDeltaPct = 0;
    const prevSnapshots = AppState.snapshots.filter(s => s.date < date);
    if (prevSnapshots.length > 0) {
      const lastPrev = prevSnapshots[prevSnapshots.length - 1];
      dodDelta = combinedTotal - lastPrev.combinedTotal;
      dodDeltaPct = lastPrev.combinedTotal > 0 ? (dodDelta / lastPrev.combinedTotal) * 100 : 0;
    }

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
      dodDeltaPct: parseFloat(dodDeltaPct.toFixed(2))
    };

    const saveBtn = document.getElementById('save-snapshot-btn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = `
        <span class="material-symbols-outlined text-[18px] animate-spin">refresh</span>
        <span>Writing IndexedDB Record...</span>
      `;
    }

    await TradeDB.saveSnapshot(snapshot);
    await reloadAllData();

    if (saveBtn) {
      saveBtn.innerHTML = `
        <span class="material-symbols-outlined text-[18px]">check_circle</span>
        <span>Snapshot Stored (IDB)</span>
      `;
      setTimeout(() => {
        saveBtn.innerHTML = `
          <span class="material-symbols-outlined text-[18px]">save</span>
          <span>Commit Snapshot to Ledger</span>
        `;
        saveBtn.disabled = false;
      }, 1500);
    }

    showToast(`Snapshot for ${date} recorded in ledger`, 'success');
    renderSnapshotTable();
    renderDashboard();
  }

  function renderSnapshotTable() {
    const tbody = document.getElementById('snapshot-table-body');
    if (!tbody) return;

    // Display descending by date
    const list = [...AppState.snapshots].sort((a, b) => b.date.localeCompare(a.date));

    if (list.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="p-6 text-center text-[#8e8e98] text-xs">
            No snapshots recorded yet. Add your daily EOD valuation above.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = list.map(s => {
      const isUp = (s.dodDelta || 0) >= 0;
      const deltaColor = isUp ? 'text-[#d5f6be]' : 'text-red-400';

      return `
        <tr class="hover:bg-white/5 transition-colors border-b border-white/5">
          <td class="p-2 text-[#8e8e98] whitespace-nowrap text-[11px]">
            ${s.date}
          </td>
          <td class="p-2 text-right tabular-nums">
            <div class="text-white text-[11px]">${fmtINR(s.growwTotal)}</div>
          </td>
          <td class="p-2 text-right tabular-nums">
            <div class="text-white text-[11px]">${fmtINR(s.kiteTotal)}</div>
          </td>
          <td class="p-2 text-right tabular-nums">
            <div class="font-serif text-white font-semibold text-[13px]">${fmtINR(s.combinedTotal)}</div>
          </td>
          <td class="p-2 text-right tabular-nums whitespace-nowrap">
            <span class="text-[10px] font-bold ${deltaColor}">
              ${(isUp ? '+' : '') + Number(s.dodDeltaPct || 0).toFixed(1)}%
            </span>
          </td>
          <td class="p-2 text-right whitespace-nowrap">
            <button class="p-1 rounded text-[#8e8e98] hover:text-red-400 transition-colors" onclick="window.App.confirmDeleteSnapshot('${s.date}')" title="Delete Record">
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

    const headers = ['Date', 'Groww_Cash', 'Groww_Invested', 'Groww_Total', 'Zerodha_Cash', 'Zerodha_Invested', 'Zerodha_Total', 'Combined_Total', 'DoD_Delta'];
    const rows = AppState.snapshots.map(s => [
      s.date,
      s.growwCash,
      s.growwInvested,
      s.growwTotal,
      s.kiteCash,
      s.kiteInvested,
      s.kiteTotal,
      s.combinedTotal,
      s.dodDelta || 0
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encoded = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encoded);
    link.setAttribute('download', `TradeLedger_Snapshots_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exported snapshots to CSV', 'success');
  }

  /* ==========================================================================
     VIEW 4: ANALYTICS & PERFORMANCE
     ========================================================================== */
  function renderAnalytics() {
    const trades = AppState.trades;
    const snapshots = AppState.snapshots;

    // 1. Portfolio Health
    const latestSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
    const totalVal = latestSnapshot ? latestSnapshot.combinedTotal : 0;
    const investedBase = latestSnapshot ? ((latestSnapshot.growwInvested || 0) + (latestSnapshot.kiteInvested || 0)) : 0;
    const absGain = totalVal - investedBase;
    const absGainPct = investedBase > 0 ? ((absGain / investedBase) * 100).toFixed(2) : '0.00';

    const valEl = document.getElementById('analytics-total-val');
    const gainEl = document.getElementById('analytics-abs-gain');
    const baseEl = document.getElementById('analytics-invested-base');

    if (valEl) valEl.innerHTML = fmtINR(totalVal);
    if (gainEl) gainEl.textContent = `${absGain >= 0 ? '+' : ''}${fmtINR(absGain)} (${absGain >= 0 ? '+' : ''}${absGainPct}%)`;
    if (baseEl) baseEl.textContent = fmtINR(investedBase);

    // 2. Win / Loss Stats & Profit Factor
    let grossWins = 0;
    let grossLosses = 0;
    let winCount = 0;
    let lossCount = 0;
    let maxWinTrade = null;
    let maxLossTrade = null;

    trades.forEach(t => {
      const net = Number(t.netPnL || 0);
      if (net > 0) {
        winCount++;
        grossWins += net;
        if (!maxWinTrade || net > maxWinTrade.netPnL) maxWinTrade = t;
      } else if (net < 0) {
        lossCount++;
        grossLosses += Math.abs(net);
        if (!maxLossTrade || net < maxLossTrade.netPnL) maxLossTrade = t;
      }
    });

    const totalTrades = trades.length;
    const winRate = totalTrades > 0 ? ((winCount / totalTrades) * 100).toFixed(1) : '0.0';
    const profitFactor = grossLosses > 0 ? (grossWins / grossLosses).toFixed(2) : (grossWins > 0 ? '99.00' : '0.00');

    const avgWin = winCount > 0 ? (grossWins / winCount) : 0;
    const avgLoss = lossCount > 0 ? (grossLosses / lossCount) : 0;
    const payoffRatio = avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : (avgWin > 0 ? '1.00' : '0.00');

    // Update Analytics UI Elements
    const hitRateEl = document.getElementById('analytics-hit-rate');
    const winRatioBar = document.getElementById('analytics-win-ratio-bar');
    const winRatioDetails = document.getElementById('analytics-win-ratio-details');
    const profitFactorEl = document.getElementById('analytics-profit-factor');
    const grossWinsEl = document.getElementById('analytics-gross-wins');
    const grossLossesEl = document.getElementById('analytics-gross-losses');
    const avgWinEl = document.getElementById('analytics-avg-win');
    const avgLossEl = document.getElementById('analytics-avg-loss');
    const payoffEl = document.getElementById('analytics-payoff-ratio');

    if (hitRateEl) hitRateEl.textContent = `${winRate}% Hit Rate`;
    if (winRatioBar) {
      winRatioBar.innerHTML = `
        <div class="h-full bg-secondary" style="width: ${winRate}%;"></div>
        <div class="h-full bg-error" style="width: ${(100 - Number(winRate)).toFixed(1)}%;"></div>
      `;
    }
    if (winRatioDetails) {
      winRatioDetails.innerHTML = `
        <span class="text-secondary font-semibold">${winCount} Wins (${winRate}%)</span>
        <span class="text-error font-semibold">${lossCount} Losses (${(100 - Number(winRate)).toFixed(1)}%)</span>
      `;
    }
    if (profitFactorEl) profitFactorEl.textContent = profitFactor;
    if (grossWinsEl) grossWinsEl.textContent = '+' + fmtINR(grossWins);
    if (grossLossesEl) grossLossesEl.textContent = '-' + fmtINR(grossLosses);
    if (avgWinEl) avgWinEl.textContent = '+' + fmtINR(avgWin);
    if (avgLossEl) avgLossEl.textContent = '-' + fmtINR(avgLoss);
    if (payoffEl) payoffEl.textContent = `${payoffRatio} : 1`;

    // Outlier Winner & Loser
    const maxWinEl = document.getElementById('analytics-max-win-symbol');
    const maxWinVal = document.getElementById('analytics-max-win-val');
    const maxLossEl = document.getElementById('analytics-max-loss-symbol');
    const maxLossVal = document.getElementById('analytics-max-loss-val');

    if (maxWinTrade) {
      if (maxWinEl) maxWinEl.textContent = maxWinTrade.stockSymbol;
      if (maxWinVal) maxWinVal.textContent = '+' + fmtINR(maxWinTrade.netPnL);
    }
    if (maxLossTrade) {
      if (maxLossEl) maxLossEl.textContent = maxLossTrade.stockSymbol;
      if (maxLossVal) maxLossVal.textContent = fmtINR(maxLossTrade.netPnL);
    }

    // Taxes Breakdown
    let totalCharges = 0;
    trades.forEach(t => totalCharges += Number(t.totalCharges || 0));
    const chargesTotalEl = document.getElementById('analytics-total-charges');
    if (chargesTotalEl) chargesTotalEl.textContent = `Total Charges Deducted: ${fmtINR(totalCharges)}`;

    // Render Equity Curve Chart
    renderAnalyticsChart();
  }

  function renderAnalyticsChart() {
    const svg = document.getElementById('analytics-equity-svg');
    if (!svg) return;

    const snapshots = AppState.snapshots;
    if (snapshots.length < 2) return;

    const W = 900;
    const H = 240;
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

    let nodes = '';
    points.forEach((p, i) => {
      if (i === 0 || i === Math.floor(n / 2) || i === n - 1) {
        nodes += `<circle cx="${p.x}" cy="${p.y}" r="5" fill="#A79986" stroke="#1F1D20" stroke-width="2"/>`;
      }
    });

    svg.innerHTML = `
      <defs>
        <linearGradient id="anEquityGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#803E2F" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#803E2F" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      <path d="${areaD}" fill="url(#anEquityGrad)"/>
      <path d="${pathD}" fill="none" stroke="#803E2F" stroke-width="2.5" stroke-linecap="round"/>
      ${nodes}
    `;
  }

  /* ==========================================================================
     VIEW 5: NSE CALCULATOR
     ========================================================================== */
  function setCalculatorBroker(broker) {
    AppState.calculatorState.broker = broker;
    const gBtn = document.getElementById('broker-groww');
    const zBtn = document.getElementById('broker-zerodha');

    if (broker === 'groww') {
      if (gBtn) gBtn.className = 'py-2 rounded-xl text-xs font-semibold bg-[#803E2F] text-white transition-all flex items-center justify-center gap-1.5';
      if (zBtn) zBtn.className = 'py-2 rounded-xl text-xs font-semibold text-[#A79986] transition-all flex items-center justify-center gap-1.5';
    } else {
      if (zBtn) zBtn.className = 'py-2 rounded-xl text-xs font-semibold bg-[#803E2F] text-white transition-all flex items-center justify-center gap-1.5';
      if (gBtn) gBtn.className = 'py-2 rounded-xl text-xs font-semibold text-[#A79986] transition-all flex items-center justify-center gap-1.5';
    }

    calculateAllCalculator();
  }

  function setCalculatorSegment(segment) {
    AppState.calculatorState.segment = segment;
    ['delivery', 'intraday', 'futures', 'options'].forEach(seg => {
      const btn = document.getElementById(`seg-${seg}`);
      if (!btn) return;
      if (seg === segment) {
        btn.className = 'px-3.5 py-1.5 rounded-full bg-[#803E2F] text-white font-semibold whitespace-nowrap';
      } else {
        btn.className = 'px-3.5 py-1.5 rounded-full bg-[#362F2E] text-[#A79986] whitespace-nowrap';
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

  function loadCalculatorSample() {
    document.getElementById('calc-buy-price').value = '1450.00';
    document.getElementById('calc-sell-price').value = '1530.00';
    document.getElementById('calc-trade-qty').value = '100';
    calculateAllCalculator();
    showToast('Loaded sample swing position (₹1450 -> ₹1530)', 'info');
  }

  function resetCalculatorInputs() {
    document.getElementById('calc-buy-price').value = '1000.00';
    document.getElementById('calc-sell-price').value = '1050.00';
    document.getElementById('calc-trade-qty').value = '50';
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

    // Metric Hero Cards
    const grossEl = document.getElementById('metric-gross-pnl');
    const netEl = document.getElementById('metric-net-pnl');
    const netRoiEl = document.getElementById('metric-net-roi');
    const chargesEl = document.getElementById('metric-total-charges');
    const pillEl = document.getElementById('pnl-status-pill');

    if (grossEl) grossEl.textContent = (res.grossPnL >= 0 ? '+' : '') + fmtINR(res.grossPnL);
    if (chargesEl) chargesEl.textContent = '-' + fmtINR(res.totalCharges);
    if (netEl) {
      netEl.className = res.netPnL >= 0
        ? 'font-display-lg text-display-lg font-bold text-secondary mt-0.5'
        : 'font-display-lg text-display-lg font-bold text-error mt-0.5';
      netEl.textContent = (res.netPnL >= 0 ? '+' : '') + fmtINR(res.netPnL);
    }
    if (netRoiEl) {
      netRoiEl.className = res.netPnL >= 0
        ? 'font-data-mono-md text-data-mono-md font-semibold text-secondary'
        : 'font-data-mono-md text-data-mono-md font-semibold text-error';
      netRoiEl.textContent = (res.netRoi >= 0 ? '+' : '') + res.netRoi.toFixed(2) + '% ROI';
    }

    if (pillEl) {
      if (res.netPnL >= 0) {
        pillEl.textContent = 'PROFITABLE';
        pillEl.className = 'px-2 py-0.5 rounded bg-secondary-container text-on-secondary-container font-data-mono-sm text-data-mono-sm font-bold';
      } else {
        pillEl.textContent = 'DEFICIT / LOSS';
        pillEl.className = 'px-2 py-0.5 rounded bg-error-container text-on-error-container font-data-mono-sm text-data-mono-sm font-bold';
      }
    }

    // Drag / Retention Bar
    const dragEl = document.getElementById('metric-charges-drag');
    const retentionEl = document.getElementById('pnl-retention-rate');
    const barNet = document.getElementById('bar-net');
    const barCharges = document.getElementById('bar-charges');

    if (dragEl) dragEl.textContent = `${res.dragPct.toFixed(1)}% profit drag`;
    if (retentionEl) retentionEl.textContent = `${res.retentionPct.toFixed(1)}% Net Retention`;
    if (barNet) barNet.style.width = `${res.retentionPct}%`;
    if (barCharges) barCharges.style.width = `${res.dragPct}%`;

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

    const summaryText = `[TradeLedger NSE Calculator]\nBroker: ${AppState.calculatorState.broker.toUpperCase()} | Segment: ${AppState.calculatorState.segment.toUpperCase()}\nBuy Price: ₹${buyPrice} | Sell Price: ₹${sellPrice} | Qty: ${qty}\nTotal Charges: ${totalCharges}\nNet Realized P&L: ${netPnL}\nBreak-Even Exit: ${bePrice}`;

    navigator.clipboard.writeText(summaryText).then(() => {
      showToast('Calculator parameters copied to clipboard', 'success');
    }).catch(() => {
      showToast('Calculated values formatted and ready', 'info');
    });
  }

  function transferCalculatorToJournal() {
    const buyPrice = document.getElementById('calc-buy-price').value;
    const sellPrice = document.getElementById('calc-sell-price').value;
    const qty = document.getElementById('calc-trade-qty').value;

    switchView('trade-journal');

    setTimeout(() => {
      document.getElementById('buyPrice').value = buyPrice;
      document.getElementById('sellPrice').value = sellPrice;
      document.getElementById('tradeQty').value = qty;
      document.getElementById('stockName').value = 'NSE Swing Position';
      document.getElementById('stockSymbol').value = 'SWING';
      selectJournalBroker(AppState.calculatorState.broker);
      calculateJournalFormMath();
      window.scrollTo({ top: 180, behavior: 'smooth' });
      showToast('Transferred parameters to Trade Journal', 'success');
    }, 150);
  }

  /* ==========================================================================
     VIEW 6: SETTINGS & DATABASE HUB
     ========================================================================== */
  async function renderSettings() {
    const stats = await TradeDB.getStats();

    const tradesCountEl = document.getElementById('settings-trades-count');
    const snapCountEl = document.getElementById('settings-snapshots-count');
    const quotaUsedEl = document.getElementById('settings-quota-used');
    const quotaPctEl = document.getElementById('settings-quota-pct');
    const quotaBarEl = document.getElementById('settings-quota-bar');

    if (tradesCountEl) tradesCountEl.textContent = stats.tradesCount;
    if (snapCountEl) snapCountEl.textContent = stats.snapshotCount;
    if (quotaUsedEl) quotaUsedEl.textContent = `${stats.quota.usedMB} MB / ~${stats.quota.totalGB} GB`;
    if (quotaPctEl) quotaPctEl.textContent = `${stats.quota.pct}% Quota Used`;
    if (quotaBarEl) quotaBarEl.style.width = `${Math.max(1, parseFloat(stats.quota.pct))}%`;

    // Preferences
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
      link.download = `TradeLedger_Full_Backup_${new Date().toISOString().split('T')[0]}.json`;
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
    if (confirm('DANGER: Completely wipe all trades and snapshots from local browser storage? This cannot be undone.')) {
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

  // PWA Install Prompt Listener
  function initPwaInstall() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      AppState.deferredInstallPrompt = e;
      const installBtn = document.getElementById('pwa-install-banner-btn');
      if (installBtn) {
        installBtn.classList.remove('hidden');
      }
    });

    window.addEventListener('appinstalled', () => {
      AppState.deferredInstallPrompt = null;
      showToast('TradeLedger installed as native PWA!', 'success');
    });
  }

  function triggerPwaInstall() {
    if (AppState.deferredInstallPrompt) {
      AppState.deferredInstallPrompt.prompt();
      AppState.deferredInstallPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          showToast('Installing PWA...', 'success');
        }
        AppState.deferredInstallPrompt = null;
      });
    } else {
      showToast('App is ready for offline use or already installed', 'info');
    }
  }

  // Register Service Worker
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then((reg) => {
            console.log('TradeLedger Service Worker registered:', reg.scope);
          })
          .catch((err) => {
            console.warn('Service Worker registration failed:', err);
          });
      });
    }
  }

  // App Initialization
  async function initApp() {
    // 1. Initialize DB
    await TradeDB.init();
    await reloadAllData();

    // 2. Connectivity & Market Clock
    initConnectivityMonitor();
    updateMarketStatus();
    setInterval(updateMarketStatus, 30000);

    // 3. Register Hotkeys & PWA
    initKeyboardShortcuts();
    initPwaInstall();
    registerServiceWorker();

    // 4. Handle initial URL hash
    const initialHash = window.location.hash.replace('#', '') || 'dashboard';
    switchView(initialHash);

    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.replace('#', '') || 'dashboard';
      if (hash !== AppState.currentView) {
        switchView(hash);
      }
    });

    // 5. Wire Form Events
    const saveTradeBtn = document.getElementById('btnSaveTrade');
    if (saveTradeBtn) saveTradeBtn.addEventListener('click', handleSaveTrade);

    const clearTradeBtn = document.getElementById('btnClearTrade');
    if (clearTradeBtn) clearTradeBtn.addEventListener('click', resetTradeForm);

    const saveSnapBtn = document.getElementById('save-snapshot-btn');
    if (saveSnapBtn) saveSnapBtn.addEventListener('click', handleSaveSnapshot);

    // Inputs listener for dynamic subtotal calculation
    ['groww-cash', 'groww-invested', 'kite-cash', 'kite-invested'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', updateSnapshotFormCalculations);
    });

    // Inputs listener for trade form
    ['buyPrice', 'sellPrice', 'tradeQty'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', calculateJournalFormMath);
    });

    // Search & Filter listeners
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        AppState.journalFilter.search = e.target.value;
        renderJournalTable();
      });
    }

    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        AppState.journalFilter.sort = e.target.value;
        renderJournalTable();
      });
    }

    // 6. Universal Global Event Delegation (Guaranteed Mobile Safari & Chrome Tap Response)
    document.addEventListener('click', (e) => {
      // Handle Navigation Tabs
      const navBtn = e.target.closest('[data-path]');
      if (navBtn) {
        e.preventDefault();
        const path = navBtn.getAttribute('data-path');
        if (path) switchView(path);
        return;
      }

      // Handle Data Actions
      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        const action = actionBtn.getAttribute('data-action');
        if (action === 'open-action-sheet') {
          e.preventDefault();
          openActionSheet();
        } else if (action === 'close-action-sheet') {
          e.preventDefault();
          closeActionSheet();
        } else if (action === 'quick-calc') {
          e.preventDefault();
          switchView('nse-calculator');
        } else if (action === 'open-settings') {
          e.preventDefault();
          switchView('settings-and-backup');
        } else if (action === 'save-preferences') {
          e.preventDefault();
          savePreferences();
        } else if (action === 'export-backup') {
          e.preventDefault();
          downloadFullBackup();
        } else if (action === 'reload-sample') {
          e.preventDefault();
          handleResetToSampleData();
        } else if (action === 'clear-all') {
          e.preventDefault();
          handleClearAllDatabase();
        } else if (action === 'save-trade') {
          e.preventDefault();
          handleSaveTrade();
        } else if (action === 'reset-trade') {
          e.preventDefault();
          resetTradeForm();
        } else if (action === 'export-journal-csv') {
          e.preventDefault();
          exportJournalCSV();
        } else if (action === 'save-snapshot') {
          e.preventDefault();
          handleSaveSnapshot();
        } else if (action === 'export-portfolio-csv') {
          e.preventDefault();
          exportPortfolioCSV();
        } else if (action === 'transfer-calc') {
          e.preventDefault();
          transferCalculatorToJournal();
        } else if (action === 'copy-calc') {
          e.preventDefault();
          copyCalculatorSummary();
        }
      }
    });
  }

  // Expose global controller
  window.App = {
    init: initApp,
    switchView,
    toggleMobileSidebar,
    closeMobileSidebar,
    showToast,
    // Calculator
    setCalculatorBroker,
    setCalculatorSegment,
    adjustCalculatorQty,
    loadCalculatorSample,
    resetCalculatorInputs,
    calculateAllCalculator,
    copyCalculatorSummary,
    transferCalculatorToJournal,
    // Journal
    selectJournalBroker,
    editTrade,
    confirmDeleteTrade,
    executeDeleteTrade,
    closeDeleteModal,
    exportJournalCSV,
    setJournalBrokerFilter: (broker) => {
      AppState.journalFilter.broker = broker;
      ['all', 'groww', 'zerodha'].forEach(b => {
        const btn = document.getElementById(`fltBroker${b.charAt(0).toUpperCase() + b.slice(1)}`);
        if (!btn) return;
        if (b === broker) {
          btn.className = 'px-3 py-1 rounded-full bg-[#803E2F] text-white font-semibold whitespace-nowrap';
        } else {
          btn.className = 'px-3 py-1 rounded-full bg-[#362F2E] text-[#A79986] whitespace-nowrap';
        }
      });
      renderJournalTable();
    },
    setJournalOutcomeFilter: (outcome) => {
      AppState.journalFilter.outcome = outcome;
      ['all', 'win', 'loss'].forEach(o => {
        const btn = document.getElementById(`fltOut${o.charAt(0).toUpperCase() + o.slice(1)}`);
        if (!btn) return;
        if (o === outcome) {
          btn.className = 'px-3 py-1 rounded-full bg-[#803E2F] text-white font-semibold whitespace-nowrap';
        } else {
          btn.className = 'px-3 py-1 rounded-full bg-[#362F2E] text-[#A79986] whitespace-nowrap';
        }
      });
      renderJournalTable();
    },
    // Action Sheet Modal Controls
    openActionSheet,
    closeActionSheet,
    // Portfolio
    confirmDeleteSnapshot,
    executeDeleteSnapshot,
    closeDeleteSnapshotModal,
    exportPortfolioCSV,
    // Settings
    downloadFullBackup,
    handleRestoreBackup,
    handleResetToSampleData,
    handleClearAllDatabase,
    savePreferences,
    triggerPwaInstall
  };

  // Start on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
