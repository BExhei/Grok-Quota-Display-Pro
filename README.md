# Grok Quota Display Pro

A clean Tampermonkey / Violentmonkey userscript that shows **Grok SuperGrok weekly usage** and the **current model** in an interactive floating panel on [grok.com](https://grok.com).

[![Version](https://img.shields.io/badge/version-2.5.0-blue)](.)
[![Language](https://img.shields.io/badge/language-Bilingual-brightgreen)](.)
[![License](https://img.shields.io/badge/license-GPL--3.0-orange)](https://www.gnu.org/licenses/gpl-3.0.html)

**Upstream**: https://github.com/BExhei/Grok-Quota-Display-Pro  
**Greasy Fork**: https://greasyfork.org/scripts/578827-grok-quota-display-pro

---

## What's New (v2.5.0)

Adapted to Grok’s **weekly SuperGrok usage** system (replacing the old free-points + short-term rate-limit panel focus).

- **Weekly usage (primary)**
  - Reads `GetGrokCreditsConfig` (grpc-web / protobuf), same approach as current working rate-limit tools
  - Large **remaining %**, used %, color progress bar
  - Product breakdown (Chat / Imagine / API / Voice / …)
  - Reset time + relative countdown (e.g. `2d 5h` / `2天5小时后`)
- **Current model (horizontal chips)**
  - Auto · Fast · Expert · Heavy in one row
  - Active chip highlighted; Heavy dimmed when not available
  - Detail line with friendly model name + Think / DeepSearch when active
- **No more short-term rate-limit rows**
  - Removed dependency on `POST /rest/rate-limits` for the main UI (obsolete for weekly quotas)
- **Silent refresh (no flash)**
  - First load may show “Loading…” once
  - Background refresh updates in place; manual refresh only spins the ⟳ button
  - Weekly network poll every **5 minutes** (aligned with similar tools)
  - Local model chips sync ~1.5s + MutationObserver on the query bar
  - After send: silent force-refresh of weekly usage ~4s later
  - Intercepts page `GetGrokCreditsConfig` responses when Grok loads them

---

## Features

### Weekly usage

- SuperGrok weekly **usage % / remaining %**
- Segmented bar + list for product categories
- Reset timestamp and time-until-reset
- Requires SuperGrok-tier access for meaningful weekly data

### Current model indicator

- Horizontal chips: **Auto / Fast / Expert / Heavy**
- Detects selector UI (text + SVG paths; `Model select` / `模型选择`)
- Maps labels to internal names (`grok-4-auto`, `grok-3`, `grok-4`, `grok-4-heavy`, Grok 4.20 / 4.3, …)
- Optional Think / DeepSearch / DeeperSearch badge on Fast-related modes

### Subscription badge

- Guest, Logged in, Premium+, **SuperGrok**, **SuperGrok Heavy**
- Color-coded header badge
- Heavy chip locked for non-Heavy accounts

### Interactive panel

- Bottom-right by default, **draggable** header
- ⟳ Manual refresh (force weekly API, silent)
- ☀️ / 🌙 Theme (dark / light, `localStorage`)
- − / + Minimize
- **Chinese / English** UI from `navigator.language`

---

## Installation

1. Install a userscript manager:
   - [Tampermonkey](https://www.tampermonkey.net/) (recommended)
   - or [Violentmonkey](https://violentmonkey.github.io/)

2. Install the script:
   - Copy `grok-quota-display-pro.js` into a new userscript, or
   - Install from [Greasy Fork](https://greasyfork.org/scripts/578827-grok-quota-display-pro)

Visit https://grok.com while logged in — the panel appears automatically.

---

## Usage

1. Open [grok.com](https://grok.com).
2. Floating panel appears bottom-right.
3. Badge shows your tier (e.g. **SuperGrok**).
4. **Weekly usage** — remaining %, breakdown, reset time.
5. **Current model** — which of Auto / Fast / Expert / Heavy is selected.
6. Use header buttons to refresh, switch theme, or minimize.
7. Drag the header to reposition.

**Tip**: If weekly usage is empty, confirm you are on SuperGrok and try ⟳, or open **Settings → Usage** so Grok may load credits config (also intercepted).

---

## Technical Notes

### Weekly usage API

- `POST /grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig`  
  Headers: `content-type: application/grpc-web+proto`, `x-grpc-web: 1`  
  Body: empty protobuf frame  
- Response parsed for `usagePercent`, `productUsage[]`, `currentPeriod.start/end`
- Optional `fetch` intercept when the site loads the same endpoint

### Model detection

- Query bar `.query-bar` + model button (`Model select` / `模型选择`)
- `MODEL_MAP` + SVG path heuristics
- Think / DeepSearch via `aria-pressed` (where available)

### Refresh strategy

| Trigger | Behavior |
|--------|----------|
| First open | Load weekly usage once (may show loading) |
| Every 5 min | Silent weekly refresh if tab visible |
| Model change | Local chip update only (no network) |
| After send | Silent force weekly refresh ~4s later |
| Manual ⟳ | Force weekly refresh; button spins |
| Tab hidden | Polling paused |

- 8s fetch timeout with `AbortController`
- UI injected with `GM_addStyle` — no third-party servers

### Deprecated / removed (v2.5)

- Primary UI no longer uses `POST /rest/rate-limits` remaining counts
- Old SuperGrok “free points” text scraping as the main usage source
- Imagine quota endpoint still unused (disabled by xAI)

---

## Development

Single source file: `grok-quota-display-pro.js`

---

## License

GPL-3.0 — [BExhei/Grok-Quota-Display-Pro](https://github.com/BExhei/Grok-Quota-Display-Pro)
