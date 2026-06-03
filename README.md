# Grok Quota Display Pro

A powerful, clean Tampermonkey / Violentmonkey userscript that shows **real-time Grok quotas** in a beautiful, interactive floating panel on [grok.com](https://grok.com).

[![Version](https://img.shields.io/badge/version-2.2.1-blue)](https://github.com/BExhei/Grok-Quota-Display-Pro)
[![Language](https://img.shields.io/badge/language-Bilingual-brightgreen)](https://github.com/BExhei/Grok-Quota-Display-Pro)
[![License](https://img.shields.io/badge/license-GPL--3.0-orange)](https://www.gnu.org/licenses/gpl-3.0.html)

**GitHub**: https://github.com/BExhei/Grok-Quota-Display-Pro  
**Install (Greasyfork)**: https://greasyfork.org/scripts/578827-grok-quota-display-pro

---

## What's New (v2.2.1)

- **Subscription Points / 订阅积分使用** (the main new feature)
  - Displays the "Free points included with SuperGrok" (随 SuperGrok 附赠的免费积分) usage as a **visual progress bar**.
  - Shows percentage used (e.g. 6% 已用), color-coded (green → orange → red as usage increases), and the reset date.
  - **Smart live capture**: Uses early `fetch` interception + probing of `/rest/subscriptions`, `/rest/user`, etc. + safe DOM scanning. In many cases the points bar appears **without you ever opening the Settings → Usage tab**.
  - When you do open the Usage tab, a lightweight observer triggers a quick one-time update.

- **Accurate membership-aware Heavy quota row**
  - For regular SuperGrok (and lower tiers) the Heavy line correctly shows **"仅限 Heavy 订阅账户"** / **"Heavy subscribers only"** instead of attempting to fetch or showing misleading numbers.
  - Only SuperGrok Heavy accounts see live Heavy quota numbers.

- **Stable refresh schedule**
  - Back to clean **60-second auto-refresh** (only while the tab is visible) + visibility resume + manual refresh button.
  - No more unwanted repeated refreshes.

- **Improved Imagine quotas**
  - If the backend returns numeric `remaining` / `total` values, they are displayed with the same color coding and `/ total` format as chat quotas.
  - Falls back gracefully to availability status (Available / Unavailable) + nice Chinese/English labels (图像, Video 720p, etc.).
  - Updated help tooltip.

- Many robustness fixes, better caching of points data, bilingual improvements, and code cleanup.

---

## Features

### Real-time Quota Monitoring
- **Chat quotas**: Fast, Expert, Heavy (with proper tier gating for Heavy)
- **Subscription Points**: Beautiful progress bar + reset information for SuperGrok bundled free points
- **Imagine quotas**: Image, Image Pro, Image Edit, Video, Video 720p (numeric when available)

### Smart Subscription Detection
- Automatically detects: Guest, Logged in, Premium+, **SuperGrok**, **SuperGrok Heavy**
- Color-coded badge at the top of the panel
- Heavy row respects your actual subscription (shows unlock message for non-Heavy users)

### Interactive Floating Panel
- Positioned bottom-right by default, fully **draggable**
- Header controls:
  - ⟳ Manual refresh
  - ☀️ / 🌙 Theme toggle (dark / light, persisted)
  - − / + Minimize / expand
- Bottom toggles: **Text** (chat + points) / **Image** (Imagine) – independently show/hide sections
- Persistent settings via `GM_setValue` + `localStorage`

### Visual & Bilingual
- Color-coded values (green = ok, orange = warn, red = danger)
- Shows `remaining / total` format where available
- Full **Chinese / English** interface (auto-detected from `navigator.language`)
- Clean, modern UI that matches Grok's aesthetic and adapts to light/dark

### Smart Refresh & Performance
- Auto-refresh every **60 seconds** when the page is visible
- Refreshes on tab visibility change
- Points data is captured "for free" via network interception whenever the official site talks to its backend
- Safe MutationObserver only reacts to the real settings Usage content (exact phrase match + ignores the panel itself)

---

## Installation

1. Install a userscript manager:
   - [Tampermonkey](https://www.tampermonkey.net/) (recommended)
   - or [Violentmonkey](https://violentmonkey.github.io/)

2. Install the script:
   - **Recommended**: [Install from Greasyfork](https://greasyfork.org/zh-CN/scripts/578827-grok-quota-display-pro)
   - Or copy the content of `grok-quota-display-pro.js` into a new userscript manually.

After installation, simply visit https://grok.com (logged in). The panel appears automatically.

---

## Usage

1. Go to [grok.com](https://grok.com).
2. Look for the floating panel in the bottom-right.
3. The colored badge at the top shows your detected tier (e.g. "SuperGrok").
4. **Subscription Points** section (with progress bar) appears when data is available.
5. Chat quotas (Fast / Expert / Heavy) – Heavy shows a lock message if your account doesn't have access.
6. Imagine section with per-type status.
7. Use header buttons to refresh, change theme, or minimize.
8. Click the **Text** / **Image** buttons at the bottom to toggle sections.
9. Drag the header to move the panel anywhere.

**Tip for points data**: The script works hard to show the progress bar without extra steps. Opening **Settings → Usage** once (in a session) guarantees fresh data and will instantly update the panel.

---

## Technical Notes

- Uses official Grok REST endpoints:
  - `POST /rest/rate-limits` with `modelName: "fast" | "expert" | "heavy"`
  - `POST /rest/media/imagine/quota_info`
  - Probing of `/rest/subscriptions`, `/rest/user`, etc. for points
- **Fetch interception** (early monkey-patch) to transparently capture subscription usage data the moment the official UI requests it.
- Tier detection via page text + header (very reliable).
- All UI is injected client-side with `GM_addStyle`.
- No external servers or tracking — 100% private and local.
- Graceful degradation when endpoints change.

---

## Development / Updating

The single source file is `grok-quota-display-pro.js`.

The Greasyfork version is the canonical distribution. You can also load the raw GitHub file directly in your userscript manager for testing the latest local changes.

---

## License

GPL-3.0

---
