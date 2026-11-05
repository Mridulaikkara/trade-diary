# TradeLedger — Swing Trader OS (PWA)

> High-precision NSE brokerage & statutory charges calculator, swing trade journal, EOD mark-to-market portfolio tracker, and quantitative analytics engine for Indian equities. Built as a 100% offline-capable Progressive Web App (PWA) ready for immediate deployment on Vercel.

---

## 🌟 Key Features

### 1. 🧮 Deterministic NSE Charges & Commission Engine
- **Broker Models**:
  - **Zerodha Kite**: ₹0 brokerage on Equity Delivery (Swing), ₹20 or 0.03% on Intraday / Futures, flat ₹20 on Options.
  - **Groww**: ₹20 or 0.05% on Delivery / Intraday / Futures, flat ₹20 on Options.
- **NSE Statutory Matrix (2024–2025 Circulars)**:
  - **STT**: 0.1% on buy & sell for Delivery; 0.025% on sell for Intraday.
  - **Stamp Duty**: 0.015% on buy turnover.
  - **Exchange Turnover Charges**: NSE 0.00325% on total turnover.
  - **SEBI Charges**: ₹10 per crore (0.0001%).
  - **IPFT**: 0.0001% on total turnover.
  - **DP Charges**: CDSL ₹13.50 + 18% GST (customizable in Settings).
  - **GST**: 18% levied on `(Brokerage + Exchange + SEBI + DP)`.
- **Break-Even Exit Target**: High-precision iterative mathematical solver computing the exact exit price needed to clear all brokerage and taxes.
- **Profit Drag & Net Retention**: Live percentage ratio showing how much profit is retained vs lost to friction.
- **Quick Actions**:
  - `Copy Summary`: Copies formatted breakdown to clipboard.
  - `Transfer to Trade Journal`: Pre-populates the Trade Journal form and switches view automatically.

### 2. 📖 Swing Trade Journal
- **Log Completed Trades**: Stock name, symbol, broker, buy price, sell price, quantity, strategy tag, and notes.
- **Real-Time Preview**: Turnovers, brokerage, statutory charges, Gross P&L, Net P&L, and Net ROI% update live as you type.
- **Full Ledger Controls**:
  - Filter by broker: All, Groww, Zerodha Kite.
  - Filter by outcome: All, Wins, Losses.
  - Live search across stock names, symbols, strategy tags, and notes.
  - Sort by: Date (Newest/Oldest), Net P&L (Highest/Lowest).
  - Edit trade: Preloads entry into editor with smooth scrolling.
  - Delete trade: With confirmation modal.
  - CSV Export: Export verified records directly to `.csv`.

### 3. 💼 EOD Mark-to-Market Portfolio Tracker
- **Daily Settlement Snapshots**: Record cash balance and equity invested value separately for Groww and Zerodha.
- **Automated Reconciliations**: Computes Groww subtotal, Zerodha subtotal, Combined Net Worth, and Day-on-Day Delta (amount and percentage).
- **Snapshot Ledger**: Full historical table with date, broker valuations, DoD changes, and deletion with delta recalculation.
- **CSV Export**: Export all historical snapshots to CSV.

### 4. 📊 Executive Dashboard
- **Consolidated Health**: Total Portfolio Net Value, Today's P&L Delta, Lifetime Realised Swing P&L, and Win Rate.
- **Broker Allocations**: Groww vs Zerodha cards with percentage share, invested capital, and liquid cash fund buffer.
- **Interactive Growth Curve**: Dynamic SVG chart rendered from actual historical snapshots with date and valuation callouts.

### 5. 📈 Quantitative Swing Analytics
- **Capital Health & Velocity**: Total Portfolio Value, Net Invested Base, Return %, 7-day velocity, and MTD performance.
- **Execution Alpha**: Win vs Loss distribution, Profit Factor (Gross Wins / Gross Losses), Average Win vs Average Loss, and Payoff Ratio.
- **Outlier Analysis**: Displays largest single win and loss trades.
- **Friction Breakdown**: Categorized audit of STT, brokerage, DP, and GST/SEBI levies.

### 6. ⚙️ Settings & Database Hub
- **Telemetry & Storage Quota**: Real storage footprint and browser sandbox quota via `navigator.storage.estimate()`.
- **Full JSON Backup**: One-click download of all trades, snapshots, and preferences.
- **Restore Backup**: File uploader restoring verified database state.
- **Quick Resets**: "Reload Sample Data" (seeds 34 trades & 28 snapshots) or "Clear Entire Database".
- **Custom Tariff Preferences**: Set default broker and custom CDSL DP charges.

---

## ⚡ 100% Offline Progressive Web App (PWA)

1. **Service Worker (`sw.js`)**:
   - Cache-first strategy for app shell, scripts, styles, and icons.
   - Dynamic caching for external CDN assets (Google Fonts, Tailwind, Material Symbols).
   - Functions with zero internet connection once loaded.
2. **Web App Manifest (`manifest.json`)**:
   - Configured with standalone display, application icons (192px, 512px, SVG, maskable), and quick action shortcuts.
   - Installable on Android, iOS (Add to Home Screen), macOS, Windows, and ChromeOS.
3. **Connectivity Status Indicator**:
   - Automatically detects online/offline state and updates the top utility pill (`Connected` vs `Offline - Cached Data`).
4. **Keyboard Hotkeys**:
   - `F1`: Dashboard
   - `F2`: Trade Journal
   - `F3`: Portfolio Tracker
   - `F4`: Analytics
   - `F5`: NSE Calculator
   - `F6`: Settings & Backup

---

## 🚀 How to Run Locally

### Option A: Using Node.js (Recommended)
```bash
# Navigate to project folder
cd C:\Users\HP\.gemini\antigravity\scratch\tradeledger-pwa

# Serve locally
npx serve -s . -l 3000
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Option B: Using Python
```bash
python -m http.server 3000
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🌐 Deploying to Vercel

This repository is pre-configured with `vercel.json` for static hosting with proper PWA service worker caching headers and single-page routing:

### Deploy Method 1: Using the Vercel CLI
```bash
# In the project directory:
npx vercel

# For production deployment:
npx vercel --prod
```

### Deploy Method 2: Via GitHub / Vercel Web Dashboard
1. Initialize git and push the folder to a GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "feat: TradeLedger PWA initial release"
   git branch -M main
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```
2. Go to [vercel.com](https://vercel.com) and click **"Add New Project"**.
3. Import your GitHub repository.
4. Framework Preset: **Other** (leave Root Directory as `./`).
5. Click **"Deploy"**.
6. Your PWA will be live on `https://<your-project>.vercel.app` with full offline support and instant PWA installation!

---

## 📂 Project Structure

```text
tradeledger-pwa/
├── index.html            # Unified Single-Page Application (SPA) with all 6 views
├── manifest.json         # PWA Manifest with app metadata, icons, and shortcuts
├── sw.js                 # Service Worker caching engine for 100% offline capability
├── vercel.json           # Vercel deployment config (clean URLs, headers, SPA fallback)
├── package.json          # Node scripts for local serving and deployment
├── README.md             # Documentation and usage guide
├── css/
│   └── app.css           # Custom styles, tabular figures, animations, and transitions
├── js/
│   ├── calculator.js     # Deterministic NSE equity & F&O charges calculator
│   ├── db.js             # IndexedDB persistent storage engine with sample dataset
│   └── app.js            # App orchestrator (routing, hotkeys, UI reactivity)
└── icons/
    ├── icon.svg          # Vector app emblem
    ├── icon-192.png      # 192x192 PWA app icon
    └── icon-512.png      # 512x512 PWA app icon (standard & maskable)
```

---

## 🔒 Privacy & Architecture
- **Zero Telemetry**: All trades, portfolio figures, and notes are saved directly in the browser's IndexedDB sandbox (`TradeLedger_DB_v1`).
- **No Remote Servers**: Your financial data never leaves your device.
- **Deterministic Math**: Formulated precisely according to official NSE and broker tariff schedules.
