// ==UserScript==
// @name         Grok Quota Display
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Grok quota display with theme toggle at bottom right
// @author       BExhei
// @match        https://grok.com/*
// @grant        GM_addStyle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    GM_addStyle(`
        #grok-quota {
            position: fixed;
            bottom: 16px;
            right: 16px;
            background: #1f2937;
            color: #e5e7eb;
            border: 1px solid #374151;
            border-radius: 8px;
            padding: 12px 16px;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 13px;
            z-index: 99999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            min-width: 220px;
            transition: background 0.2s, color 0.2s;
        }
        #grok-quota.light {
            background: #f8fafc;
            color: #1e2937;
            border-color: #cbd5e1;
        }
        #grok-quota .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            font-weight: 600;
        }
        #grok-quota .header span {
            color: #60a5fa;
        }
        #grok-quota.light .header span {
            color: #2563eb;
        }
        #grok-quota button {
            background: #3b82f6;
            color: white;
            border: none;
            padding: 3px 10px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        #grok-quota .theme-btn {
            background: #64748b;
            padding: 2px 7px;
            font-size: 13px;
        }
        #grok-quota .quota-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 6px;
        }
        #grok-quota .quota-name {
            color: #93c5fd;
        }
        #grok-quota.light .quota-name {
            color: #1e40af;
        }
        #grok-quota .remaining {
            font-size: 15px;
            font-weight: 700;
            color: #4ade80;
            font-family: monospace;
        }
        #grok-quota.light .remaining {
            color: #15803d;
        }
        #grok-quota .footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 10px;
            padding-top: 8px;
            border-top: 1px solid #374151;
            font-size: 11px;
            color: #9ca3af;
        }
        #grok-quota.light .footer {
            border-color: #cbd5e1;
            color: #64748b;
        }
    `);

    function createPanel() {
        const panel = document.createElement('div');
        panel.id = 'grok-quota';
        panel.innerHTML = `
            <div class="header">
                <span>Grok Quotas</span>
                <button id="refresh-btn">Refresh</button>
            </div>
            <div id="quota-content">Loading...</div>
            <div class="footer">
                <span>Refreshes every 18 hours</span>
                <button id="theme-btn" class="theme-btn">☀️</button>
            </div>
        `;
        document.body.appendChild(panel);

        document.getElementById('refresh-btn').onclick = fetchQuota;
        document.getElementById('theme-btn').onclick = toggleTheme;

        loadTheme();
    }

    function toggleTheme() {
        const panel = document.getElementById('grok-quota');
        const btn = document.getElementById('theme-btn');

        if (panel.classList.contains('light')) {
            panel.classList.remove('light');
            btn.textContent = '☀️';
            localStorage.setItem('grokQuotaTheme', 'dark');
        } else {
            panel.classList.add('light');
            btn.textContent = '🌙';
            localStorage.setItem('grokQuotaTheme', 'light');
        }
    }

    function loadTheme() {
        const panel = document.getElementById('grok-quota');
        const btn = document.getElementById('theme-btn');
        const savedTheme = localStorage.getItem('grokQuotaTheme');

        if (savedTheme === 'light') {
            panel.classList.add('light');
            btn.textContent = '🌙';
        } else {
            btn.textContent = '☀️';
        }
    }

    async function fetchQuota() {
        const content = document.getElementById('quota-content');
        if (!content) return;

        content.innerHTML = 'Loading...';

        try {
            const res = await fetch('https://grok.com/rest/media/imagine/quota_info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}',
                credentials: 'include'
            });

            const data = await res.json();
            let html = '';

            for (const [key, val] of Object.entries(data)) {
                const remaining = val.remainingQueries ?? 'N/A';
                html += `
                    <div class="quota-item">
                        <span class="quota-name">${key}</span>
                        <span class="remaining">${remaining}</span>
                    </div>
                `;
            }

            content.innerHTML = html || 'No data';

        } catch (e) {
            content.innerHTML = 'Failed to load';
        }
    }

    function init() {
        if (document.getElementById('grok-quota')) return;

        createPanel();
        fetchQuota();

        setInterval(fetchQuota, 5 * 60 * 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
