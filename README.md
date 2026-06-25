# Grok Quota Display Pro

A clean Tampermonkey / Violentmonkey userscript that shows **real-time Grok quotas** in an interactive floating panel on [grok.com](https://grok.com).

[![Version](https://img.shields.io/badge/version-2.3.0-blue)](.)
[![Language](https://img.shields.io/badge/language-Bilingual-brightgreen)](.)
[![License](https://img.shields.io/badge/license-GPL--3.0-orange)](https://www.gnu.org/licenses/gpl-3.0.html)

**Upstream**: https://github.com/BExhei/Grok-Quota-Display-Pro  
**Greasy Fork**: https://greasyfork.org/scripts/578827-grok-quota-display-pro

---

## What's New (v2.3.0)

- **Updated chat quota API**
  - Uses current model IDs: `grok-3` (Fast), `grok-4` (Expert), `grok-4-heavy` (Heavy)
  - Sends `requestKind: "DEFAULT"` and parses nested rate-limit responses
  - Intercepts the site's own `/rest/rate-limits` calls for faster, cached updates

- **Usage total limit** (renamed from Subscription Points)
  - Progress bar for SuperGrok free points (随 SuperGrok 附赠的免费积分)
  - Percentage used, color-coded bar, and reset date
  - Fetched via API probing + early `fetch` interception + DOM scan
  - Opening **Settings → Usage** once per session still guarantees fresh data

- **Simpler panel**
  - Bottom section toggles removed — both sections always visible
  - Header controls only: refresh, theme, minimize

- **Imagine quotas removed**
  - xAI disabled `POST /rest/media/imagine/quota_info` (“Imagine quota info is temporarily disabled”)
  - Image / Video quota monitoring is **deprecated and no longer included**

- Membership-aware Heavy row, 60s visible-tab auto-refresh, bilingual UI, and local-only operation unchanged.

---

## Features

### Real-time Quota Monitoring
- **Chat quotas**: Fast, Expert, Heavy (remaining / total, with tier gating for Heavy)
- **Usage total limit**: Progress bar + reset info for SuperGrok bundled free points

### Smart Subscription Detection
- Detects: Guest, Logged in, Premium+, **SuperGrok**, **SuperGrok Heavy**
- Color-coded badge at the top of the panel
- Non-Heavy users see **"Heavy subscribers only"** instead of misleading Heavy numbers

### Interactive Floating Panel
- Bottom-right by default, fully **draggable**
- Header controls:
  - ⟳ Manual refresh
  - ☀️ / 🌙 Theme toggle (dark / light, persisted in `localStorage`)
  - − / + Minimize / expand

### Visual & Bilingual
- Color-coded values (green → orange → red)
- `remaining / total` where the API provides totals
- **Chinese / English** UI (auto-detected from `navigator.language`)

### Smart Refresh & Performance
- Auto-refresh every **60 seconds** while the tab is visible
- Refreshes when the tab becomes visible again
- Usage data captured via network interception when Grok loads it
- MutationObserver updates once when real Usage-tab content appears

---

## Installation

1. Install a userscript manager:
   - [Tampermonkey](https://www.tampermonkey.net/) (recommended)
   - or [Violentmonkey](https://violentmonkey.github.io/)

2. Install the script:
   - Copy `Grok Quota Display Pro.js` into a new userscript, or
   - Install from [Greasy Fork](https://greasyfork.org/scripts/578827-grok-quota-display-pro) (upstream; this local fork is v2.3.0)

Visit https://grok.com while logged in — the panel appears automatically.

---

## Usage

1. Open [grok.com](https://grok.com).
2. Find the floating panel in the bottom-right.
3. Badge shows your tier (e.g. **SuperGrok**).
4. **Usage total limit** — progress bar when data is available.
5. **Chat quotas** — Fast / Expert / Heavy; Heavy locked for non-Heavy accounts.
6. Use header buttons to refresh, switch theme, or minimize.
7. Drag the header to reposition the panel.

**Tip**: If usage total limit is empty, open **Settings → Usage** once — the panel updates immediately and caches data for the session.

---

## Technical Notes

- Grok REST endpoints:
  - `POST /rest/rate-limits` with `modelName: "grok-3" | "grok-4" | "grok-4-heavy"` and `requestKind: "DEFAULT"`
  - Probing `/rest/subscriptions`, `/rest/user`, `/rest/usage`, etc. for usage total limit
- **Deprecated**: `POST /rest/media/imagine/quota_info` — not used; endpoint disabled by xAI
- Early **fetch interception** (`@run-at document-start`) for usage and rate-limit data
- Tier detection via page/header text
- UI injected client-side with `GM_addStyle` — no external servers or tracking

---

## Development

Single source file: `Grok Quota Display Pro.js`

---

## License

GPL-3.0 — based on [BExhei/Grok-Quota-Display-Pro](https://github.com/BExhei/Grok-Quota-Display-Pro)
