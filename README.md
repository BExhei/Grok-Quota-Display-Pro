# Grok Quota Display Pro

A clean Tampermonkey / Violentmonkey userscript that shows **real-time Grok quotas** in an interactive floating panel on [grok.com](https://grok.com).

[![Version](https://img.shields.io/badge/version-2.4.0-blue)](.)
[![Language](https://img.shields.io/badge/language-Bilingual-brightgreen)](.)
[![License](https://img.shields.io/badge/license-GPL--3.0-orange)](https://www.gnu.org/licenses/gpl-3.0.html)

**Upstream**: https://github.com/BExhei/Grok-Quota-Display-Pro
**Greasy Fork**: https://greasyfork.org/scripts/578827-grok-quota-display-pro

---

## What's New (v2.4.0)

- **Auto model detection & Auto row**
  - Reads the model selector button in real time — no more hardcoded model names
  - Supports all model variants: `grok-4-auto`, `grok-420`, `grok-4.1`, `grok-4.1 Thinking`, `grok-4 Fast`, `grok-2`, `grok-2 Mini`, etc.
  - New **Auto** row shows the `grok-4-auto` low-effort 50-query limit as the primary number, with high-effort quota as secondary
  - Current model row highlighted with blue border + pulsing dot

- **requestKind awareness for grok-3**
  - Detects Think / DeepSearch / DeeperSearch button states
  - Sends the correct `requestKind` (`REASONING`, `DEEPSEARCH`, `DEEPERSEARCH`) instead of always `DEFAULT`
  - Yields accurate quota readings for each mode

- **Faster & smarter refresh**
  - 30-second polling (down from 60s), pauses when tab is hidden
  - Immediate refresh on: model switch, message submission (Enter key or send button click)
  - Live countdown timer when any model reaches 0 remaining queries

- **Usage total limit** unchanged
  - Progress bar for SuperGrok free points (随 SuperGrok 附赠的免费积分)
  - Percentage used, color-coded bar, and reset date
  - Fetched via API probing + early `fetch` interception + DOM scan

- Imagine quotas removed (API disabled by xAI)
- Bilingual UI, membership-aware Heavy row, draggable panel unchanged

---

## Features

### Real-time Quota Monitoring
- **Auto**: grok-4-auto low-effort limit (primary) + high-effort quota (secondary)
- **Chat quotas**: Fast, Expert, Heavy (remaining / total, with tier gating for Heavy)
- **Usage total limit**: Progress bar + reset info for SuperGrok bundled free points

### Smart Model Detection
- Reads the Grok model selector button directly (SVG path + text matching)
- Maps 15+ UI model labels to correct internal model names
- Automatically detects grok-3 Think / DeepSearch modes for precise requestKind

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
- Current model row highlighted with blue border + pulsing blue dot

### Visual & Bilingual
- Color-coded values (green → orange → red)
- `remaining / total` where the API provides totals
- Live countdown timer (HH:MM:SS) when quota hits 0
- **Chinese / English** UI (auto-detected from `navigator.language`)

### Smart Refresh & Performance
- Auto-refresh every **30 seconds** while the tab is visible (pauses when hidden)
- Instant refresh on model switch or message submission
- Usage data captured via network interception when Grok loads it
- 8-second fetch timeout with `AbortController` for all API calls

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
2. Find the floating panel in the bottom-right.
3. Badge shows your tier (e.g. **SuperGrok**).
4. **Usage total limit** — progress bar when data is available.
5. **Chat quotas** — Auto / Fast / Expert / Heavy; current model highlighted.
6. Heavy locked for non-Heavy accounts.
7. Use header buttons to refresh, switch theme, or minimize.
8. Drag the header to reposition the panel.

**Tip**: If usage total limit is empty, open **Settings → Usage** once — the panel updates immediately and caches data for the session.

---

## Technical Notes

### Model Detection
- Reads the model selector button's SVG path data and text spans
- Maps UI labels → internal model names via `MODEL_MAP`
- Detects Think/DeepSearch via `aria-pressed` attributes on query-bar buttons

### Grok REST Endpoints
- `POST /rest/rate-limits` — polled every 30s for chat quotas with correct `modelName` + `requestKind`
- Probing `/rest/subscriptions`, `/rest/user`, `/rest/usage` for usage total limit
- **Deprecated**: `POST /rest/media/imagine/quota_info` — not used; endpoint disabled by xAI

### Refresh Strategy
- 30s interval polling (force-fetch every time) — pauses when tab hidden
- Event-driven: model change → immediate refresh; message send → refresh after 3s
- `MutationObserver` on query bar for model/Think/DeepSearch changes (300ms debounce)
- `fetch` interception only for SuperGrok points usage — rate limits are polled directly

### Tier Detection
- Via page/header text scanning for SuperGrok, Premium+, etc.
- UI injected client-side with `GM_addStyle` — no external servers or tracking

---

## Development

Single source file: `grok-quota-display-pro.js`

---

## License

GPL-3.0 — based on [BExhei/Grok-Quota-Display-Pro](https://github.com/BExhei/Grok-Quota-Display-Pro)
