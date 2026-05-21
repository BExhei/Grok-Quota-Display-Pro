# Grok Quota Display Pro

A clean and feature-rich Tampermonkey userscript that displays real-time chat and image generation quotas on [grok.com](https://grok.com).

![Version](https://img.shields.io/badge/version-2.1-blue)
![Language](https://img.shields.io/badge/language-Bilingual-brightgreen)
![License](https://img.shields.io/badge/license-GPL--3.0-orange)

## v2.1 Update

Due to changes in Grok’s backend API, **exact remaining quota numbers for image and video generation are no longer available**.

- The previous functionality that attempted to display specific remaining counts for Imagine quotas has been disabled.
- The script now only shows **availability status** (Available / Unavailable) within the current 18-hour window.
- Added a tooltip icon in the Imagine section to explain the current limitation.

---

## Features

- **Real-time Quota Monitoring**
  - Chat quotas: Fast, Expert, and Heavy (Heavy is only shown for eligible accounts)
  - ~~Image generation quotas with exact remaining counts~~ (No longer available — see v2.1 Update)
  - Image generation now only shows availability status

- **Smart Subscription Detection**
  - Automatically detects your current plan (SuperGrok, SuperGrok Heavy, Premium+, Logged in, or Guest)
  - Improved detection accuracy even when inside conversations

- **Interactive Floating Panel**
  - Draggable panel positioned at the bottom-right
  - One-click minimize / expand
  - Dark and Light theme toggle
  - Toggle visibility of Text quotas and Image quotas separately

- **Visual Quota Status**
  - Color-coded remaining quotas for chat models (Green = sufficient, Orange = warning, Red = low)
  - Displays both remaining and total values (e.g. `120 / 200`)

- **Auto Refresh**
  - Automatically refreshes quota data every 60 seconds
  - Manual refresh button available
  - Only refreshes when the page is visible

- **Bilingual Support**
  - Automatically displays interface in Chinese or English based on your browser language

- **Persistent Settings**
  - Your preferences (shown sections, theme, minimized state) are saved automatically

## Installation

1. Install a userscript manager:
   - [Tampermonkey](https://www.tampermonkey.net/)
   - or [Violentmonkey](https://violentmonkey.github.io/)

2. Install the script:
   - **[Click here to install from Greasyfork](https://greasyfork.org/zh-CN/scripts/578827-grok-quota-display-pro)** (Recommended)
   - Or manually create a new script and paste the code

## Usage

1. Visit [https://grok.com](https://grok.com) after installation.
2. A floating quota panel will appear in the bottom-right corner.
3. The top of the panel shows your detected subscription tier.
4. Use the buttons in the header to:
   - Refresh quotas manually
   - Switch between dark and light theme
   - Minimize or expand the panel
5. Click the category buttons ("Text" / "Image") to show or hide corresponding sections.

## Technical Notes

- The script fetches quota data directly from Grok's official APIs.
- Due to backend changes, Imagine quotas now only return availability status instead of exact remaining counts.
- Subscription tier is detected via page content with improved logic.
- All settings are persisted using `GM_setValue` and `localStorage`.
- Fully client-side implementation with no external backend required.

## License

This project is licensed under the [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.html) License.
