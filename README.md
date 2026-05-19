# Grok Quota Display

A clean and simple Tampermonkey userscript that displays your Grok quotas in a floating panel.

## Features
- Clean left-right layout
- Prominent remaining quota numbers
- Dark mode + one-click theme toggle (☀️ / 🌙)
- Auto refreshes every 5 minutes
- Remembers your theme preference

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/)
2. Open Tampermonkey dashboard → **Create a new script**
3. Paste the entire content of `grok-quota-display.user.js`
4. Save the script (`Ctrl + S`)
5. Visit [https://grok.com](https://grok.com)

The quota panel will appear at the bottom right corner.

## Usage
- Click **Refresh** to manually update quotas
- Click **☀️** to switch between dark and light theme
- The panel automatically refreshes every 5 minutes

## Notes
- Quotas are on a rolling 18-hour window
- Theme preference is saved locally

## License
MIT