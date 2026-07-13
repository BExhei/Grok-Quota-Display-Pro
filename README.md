# Grok Quota Display Pro

A Tampermonkey / Violentmonkey userscript for [grok.com](https://grok.com): floating panel with **SuperGrok weekly usage** and **current model** indicator.

[![Version](https://img.shields.io/badge/version-2.6.0-blue)](.)
[![Language](https://img.shields.io/badge/language-Bilingual-brightgreen)](.)
[![License](https://img.shields.io/badge/license-GPL--3.0-orange)](https://www.gnu.org/licenses/gpl-3.0.html)

**Repository**: https://github.com/BExhei/Grok-Quota-Display-Pro  
**Greasy Fork**: https://greasyfork.org/scripts/578827-grok-quota-display-pro

---

## What's New (v2.6.0)

Adapted to Grok’s **weekly SuperGrok usage** system and aligned with the official Settings → Usage UI.

### Weekly usage
- Fetches data via `GetGrokCreditsConfig` (grpc-web / protobuf)
- Large **remaining %** + used %
- Progress bar matches official markup: `flex` + `gap-px`, **electric blue** (`#1a5eff` / opacity steps `1 → 0.7 → 0.45…`), unused track `flex-1`
- Product breakdown (Chat / Imagine / API / Build / Voice / …)
- Reset time + relative countdown

### Current model
- Horizontal pills: **Auto · Fast · Expert · Heavy**
- Subtle selected state (no harsh invert)
- Detail line: friendly model name + Think / DeepSearch when active
- Heavy dimmed when not available

### Reliability & UX
- **Silent refresh** — no “Loading…” flash after first paint; ⟳ only spins
- **Startup bootstrap** — wait for page/session, multi-retry (avoids first-open failure)
- Intercepts page `GetGrokCreditsConfig` responses when Grok loads them
- Weekly network poll every **5 minutes**; model chips update locally
- After send: quiet force-refresh ~4s later
- **Theme-aware** light / dark (usage card: light `#f2f2f2`, dark elevated surface)

### Removed / deprecated
- Short-term per-model rate-limit rows (`POST /rest/rate-limits` no longer the main UI)
- Old SuperGrok “free points” text scraping as primary source

---

## Features

| Section | Content |
|--------|---------|
| **Weekly usage** | Remaining / used %, segmented bar, categories, reset |
| **Current model** | Auto / Fast / Expert / Heavy chips + detail |
| **Tier badge** | Guest, SuperGrok, SuperGrok Heavy, etc. |
| **Panel** | Drag header · ⟳ refresh · ☀️/🌙 theme · −/+ minimize |

---

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Install from [Greasy Fork](https://greasyfork.org/scripts/578827-grok-quota-display-pro), or copy `grok-quota-display-pro.js` into a new userscript.
3. Open https://grok.com while logged in — the panel appears bottom-right.

**Tip**: SuperGrok (or equivalent) is needed for meaningful weekly data. If empty, click ⟳ or open **Settings → Usage** once.

---

## Usage

1. Open [grok.com](https://grok.com).
2. Panel shows tier badge, weekly usage, and current model.
3. Switch model in Grok’s selector — chips update without a network flash.
4. Drag the header to move; use theme / minimize as needed.

---

## Technical Notes

### Weekly usage API
```
POST /grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig
content-type: application/grpc-web+proto
x-grpc-web: 1
```
Parses `usagePercent`, `productUsage[]`, `currentPeriod.start/end`.

### Refresh strategy

| Trigger | Behavior |
|--------|----------|
| First open | Bootstrap: load wait + multi-retry |
| Every 5 min | Silent weekly refresh (tab visible) |
| Model change | Local chip update only |
| After send | Silent force refresh ~4s |
| Manual ⟳ | Force weekly fetch |
| Tab hidden | Polling paused |

### Language
UI auto **Chinese / English** from `navigator.language`.

### Privacy
Runs only in your browser. No third-party servers. Uses your grok.com session cookies.

---

## Development

Single source file: `grok-quota-display-pro.js`

---

## License

GPL-3.0 — [BExhei/Grok-Quota-Display-Pro](https://github.com/BExhei/Grok-Quota-Display-Pro)
