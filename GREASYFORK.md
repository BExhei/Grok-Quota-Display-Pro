# Grok Quota Display Pro

Grok quota monitor — SuperGrok **weekly usage** + **current model** indicator; silent refresh, bilingual UI

---

## What you get

| Section | Content |
| --- | --- |
| **Weekly usage** | Remaining % / used %, progress bar, product breakdown (Chat / Imagine / API / …), reset time + countdown |
| **Current model** | Horizontal chips: Auto · Fast · Expert · Heavy — active chip highlighted |
| **Tier badge** | Guest, SuperGrok, SuperGrok Heavy, etc. |

---

## v2.5.0 highlights

* **Weekly SuperGrok quota** — uses `GetGrokCreditsConfig` (grpc-web protobuf) for the new weekly usage system
* **Replaces old free-points + short-term rate-limit rows** — no more `POST /rest/rate-limits` as the main panel content
* **Current model chips** — four horizontal options; detail line shows model name and Think / DeepSearch when relevant
* **Silent refresh** — no “Loading…” flash after first paint; ⟳ only spins while fetching
* **Refresh cadence** — weekly API every **5 minutes** while tab is visible; model chips update locally; force refresh after send (~4s)
* **Intercept** — caches usage when the site itself loads `GetGrokCreditsConfig`
* Imagine quotas remain removed (xAI disabled the endpoint)

---

## Panel controls

* ⟳ Refresh · ☀️/🌙 Theme · −/+ Minimize · drag header to move
* Auto-refresh weekly usage every 5 minutes while tab is visible (pauses when hidden)
* Switching model only updates chips (no network flash)

---

## Heavy tier

Only **SuperGrok Heavy** accounts show Heavy as an available chip state. Other tiers show a dimmed Heavy chip (*Heavy only* / *需 Heavy*).

---

## Usage tip

If **Weekly usage** is empty, confirm SuperGrok, click ⟳, or open **Settings → Usage** once so credits config can load (the script also intercepts that response).

---

## Privacy

Runs entirely in your browser. No third-party servers. Uses your existing grok.com session cookies only.

---

## Language

UI auto-detects **English** or **Chinese** from your browser.
