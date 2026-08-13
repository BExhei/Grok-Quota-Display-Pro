# Grok Quota Display Pro

A Tampermonkey / Violentmonkey userscript for [grok.com](https://grok.com): floating panel with **weekly usage**, **one-click usage-limit reset**, and **current model** for **SuperGrok Lite / SuperGrok / SuperGrok Plus / SuperGrok Heavy**.

[![Version](https://img.shields.io/badge/version-3.0.0-blue)](.)
[![Language](https://img.shields.io/badge/language-Bilingual-brightgreen)](.)
[![License](https://img.shields.io/badge/license-GPL--3.0-orange)](https://www.gnu.org/licenses/gpl-3.0.html)

**Repository**: https://github.com/BExhei/Grok-Quota-Display-Pro  
**Greasy Fork**: https://greasyfork.org/zh-CN/scripts/578827-grok-quota-display-pro  
**Feedback**: https://greasyfork.org/zh-CN/scripts/578827-grok-quota-display-pro/feedback

---

## What's New (v3.0.0)

Adapted to Grok’s **weekly usage pool**, official **usage-limit reset**, and the current SuperGrok plan ladder.

### Tiers
| Tier | Weekly pool bar | Heavy chip |
|------|-----------------|------------|
| **Free / Guest** | Explains no weekly shared pool | Locked |
| **SuperGrok Lite** | Full weekly % + product segments | Locked |
| **SuperGrok** | Full weekly % + product segments | Locked |
| **SuperGrok Plus** | Full weekly % + product segments | Locked |
| **SuperGrok Heavy** | Full weekly % + product segments | Unlocked |

### Weekly usage
- Fetches data via `GetGrokCreditsConfig` (grpc-web / protobuf) when the plan has a weekly pool
- Large **remaining %** + used %
- Progress bar matches official markup: `flex` + `gap-px`, **electric blue** (`#1a5eff` / opacity steps `1 → 0.7 → 0.45…`), unused track `flex-1`
- Product breakdown (Chat / Imagine / API / Build / Voice / …)
- Reset time + relative countdown

### Usage-limit reset
- Shows the official **Reset Available** card when Grok grants a one-time weekly reset
- **Redeem** uses the same APIs as Settings → Usage (`GetRemainingResets` / `RedeemReset`)
- Browser confirm before redeeming (resets do not stack; the token is consumed)
- After a successful redeem, weekly usage refreshes automatically

### Current model
- Horizontal pills: **Auto · Fast · Expert · Heavy** (~20px)
- Subtle selected state (no harsh invert)
- Heavy only for SuperGrok Heavy accounts

### Minimized mode
- Hides the expanded card and tier badge
- Compact remaining-% capsule on the left, with a translucent fill that follows remaining %
- Fill and text change color by usage stage (ok / warn / danger)

### Reliability & UX
- **Silent refresh** — no “Loading…” flash after first paint; ⟳ only spins
- **Startup bootstrap** — wait for page/session, multi-retry (avoids first-open failure)
- Intercepts page `GetGrokCreditsConfig` / `GetRemainingResets` when Grok loads them
- Weekly network poll every **5 minutes**; model chips update locally
- After send: quiet force-refresh ~4s later
- **Theme-aware** light / dark; both themes use the same light panel shadow

### Removed / deprecated
- Short-term per-model rate-limit rows (`POST /rest/rate-limits` no longer the main UI)
- Old SuperGrok “free points” text scraping as primary source
- Extra model-name line under the chips (the pills already show the active category)

---

## Features

| Section | Content |
|--------|---------|
| **Weekly usage** | Remaining / used %, segmented bar, categories, reset time |
| **Usage-limit reset** | Reset Available card + Redeem (confirm first) |
| **Current model** | Auto / Fast / Expert / Heavy chips |
| **Tier badge** | SuperGrok Lite / SuperGrok / SuperGrok Plus / SuperGrok Heavy, etc. |
| **Panel** | Drag header · ⟳ refresh · ☀️/🌙 theme · −/+ minimize |

---

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Install from [Greasy Fork](https://greasyfork.org/zh-CN/scripts/578827-grok-quota-display-pro), or copy `grok-quota-display-pro.js` into a new userscript.
3. Open https://grok.com while logged in — the panel appears bottom-right.

**Tip**: Weekly pool numbers appear on **SuperGrok Lite / SuperGrok / SuperGrok Plus / SuperGrok Heavy**. Free accounts still get the panel and model chips, with a clear free-tier message. If paid data is empty, click ⟳ or open **Settings → Usage**.

---

## Usage

1. Open [grok.com](https://grok.com).
2. Panel shows tier badge, weekly usage, reset (if available), and current model.
3. Switch model in Grok’s selector — chips update without a network flash.
4. If a reset is available, click **Redeem** and confirm to clear this week’s pool.
5. Drag the header to move; use theme / minimize as needed. Minimized view is a compact remaining-% capsule.

---

## Technical Notes

### Weekly usage API
```
POST /grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig
content-type: application/grpc-web+proto
x-grpc-web: 1
```
Parses `usagePercent`, `productUsage[]`, `currentPeriod.start/end`.

### Usage-limit reset API
```
POST /prod_mc_billing.ConsumerUiSvc/GetRemainingResets
POST /prod_mc_billing.ConsumerUiSvc/RedeemReset
content-type: application/grpc-web+proto
x-grpc-web: 1
```
Reads remaining reset tokens (`tokenId`, `validityEnd`) and redeems with confirmation.

### Refresh strategy

| Trigger | Behavior |
|--------|----------|
| First open | Bootstrap: load wait + multi-retry |
| Every 5 min | Silent weekly + reset-token refresh (tab visible) |
| Model change | Local chip update only |
| After send | Silent force refresh ~4s |
| Manual ⟳ | Force weekly + reset fetch |
| Redeem | Confirm → RedeemReset → refresh weekly usage |
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
