// ==UserScript==
// @name         Grok Quota Display Pro
// @namespace    https://github.com/optimized-grok-scripts
// @version      2.0
// @description  Grok quota monitor (fixed subscription detection)
// @author       BExhei
// @icon         https://www.google.com/s2/favicons?sz=64&domain=grok.com
// @match        https://grok.com/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @license      GPL-3.0
// ==/UserScript==

(function () {
    'use strict';

    const PANEL_ID = 'grok-quota-pro';
    const REFRESH_MS = 60 * 1000;
    const VERSION = '3.4';
    const LANG = navigator.language.startsWith('zh') ? 'zh' : 'en';

    const L = {
        chatTitle: LANG === 'zh' ? '聊天配额 / Chat Quotas' : 'Chat Quotas',
        imagineTitle: LANG === 'zh' ? '图像生成配额 / Imagine' : 'Imagine Quotas',
        fast: LANG === 'zh' ? '快速 (Fast)' : 'Fast',
        expert: LANG === 'zh' ? '专家 (Expert)' : 'Expert',
        heavy: LANG === 'zh' ? '重度 (Heavy)' : 'Heavy',
        lastUpdate: LANG === 'zh' ? '更新' : 'Updated',
        loading: LANG === 'zh' ? '加载中…' : 'Loading…',
        refreshFail: LANG === 'zh' ? '加载失败' : 'Load failed',
        guest: LANG === 'zh' ? '游客' : 'Guest',
        loggedIn: LANG === 'zh' ? '已登录' : 'Logged in',
        textCategory: LANG === 'zh' ? '文字类' : 'Text',
        imageCategory: LANG === 'zh' ? '图片类' : 'Image',
        unlockHeavy: LANG === 'zh' ? '需 SuperGrok Heavy' : 'SuperGrok Heavy only',
    };

    const cfg = {
        get showText() { return GM_getValue('grok_show_text', true); },
        set showText(v) { GM_setValue('grok_show_text', v); },
        get showImagine() { return GM_getValue('grok_show_imagine', true); },
        set showImagine(v) { GM_setValue('grok_show_imagine', v); },
        get theme() { return localStorage.getItem('grokQuotaTheme') || 'dark'; },
        set theme(v) { localStorage.setItem('grokQuotaTheme', v); },
        get minimized() { return localStorage.getItem('grokQuotaMin') === '1'; },
        set minimized(v) { localStorage.setItem('grokQuotaMin', v ? '1' : '0'); },
    };

    function detectSubscription() {
        try {
            const fullText = document.body.innerText.toLowerCase();

            const loginBtn = document.querySelector('a[href*="login"], button[aria-label*="sign" i], [data-testid*="login"]');
            if (loginBtn && !fullText.includes('supergrok')) {
                return { tier: L.guest, color: '#6b7280', canUseHeavy: false };
            }

            const headerEl = document.querySelector('header, nav, [class*="header"], [data-testid*="top"]');
            const headerText = headerEl ? headerEl.innerText.toLowerCase() : '';

            const isHeavy = (headerText.includes('supergrok heavy') || headerText.includes('grok heavy')) ||
                            (fullText.includes('supergrok heavy') && headerText.includes('heavy'));

            if (isHeavy) {
                return { tier: 'SuperGrok Heavy', color: '#b45309', canUseHeavy: true };
            }

            if (fullText.includes('supergrok')) {
                return { tier: 'SuperGrok', color: '#047857', canUseHeavy: false };
            }

            if (fullText.includes('premium+') || fullText.includes('premium plus')) {
                return { tier: 'Premium+', color: '#1d4ed8', canUseHeavy: false };
            }

            return { tier: L.loggedIn, color: '#4b5563', canUseHeavy: false };
        } catch {
            return { tier: L.loggedIn, color: '#4b5563', canUseHeavy: false };
        }
    }

    async function fetchChatQuota(kind) {
        try {
            const res = await fetch('https://grok.com/rest/rate-limits', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modelName: kind }), credentials: 'include'
            });
            return res.ok ? await res.json() : { error: true };
        } catch { return { error: true }; }
    }

    async function fetchImagineQuota() {
        try {
            const res = await fetch('https://grok.com/rest/media/imagine/quota_info', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: '{}', credentials: 'include'
            });
            return res.ok ? await res.json() : { error: true };
        } catch { return { error: true }; }
    }

    async function fetchAllQuotas(sub) {
        const chat = {};
        const tasks = [
            fetchChatQuota('fast').then(d => chat.fast = d),
            fetchChatQuota('expert').then(d => chat.expert = d)
        ];
        if (sub.canUseHeavy) tasks.push(fetchChatQuota('heavy').then(d => chat.heavy = d));
        await Promise.all(tasks);
        const imagine = await fetchImagineQuota();
        return { chat, imagine, timestamp: Date.now(), sub };
    }

    function valClass(rem, total) {
        if (typeof rem !== 'number') return '';
        if (rem <= 5) return 'c-danger';
        if (total && typeof total === 'number') {
            const pct = rem / total;
            if (pct < 0.1) return 'c-danger';
            if (pct < 0.5) return 'c-warn';
        } else if (rem < 10) return 'c-danger';
        else if (rem < 30) return 'c-warn';
        return 'c-ok';
    }

    function buildQuotaRow(label, info, hint) {
        if (hint) return `<div class="gqp-row"><span class="gqp-name">${label}</span><span class="gqp-hint">${hint}</span></div>`;
        if (!info || info.error) return `<div class="gqp-row"><span class="gqp-name">${label}</span><span class="gqp-val c-danger">${L.refreshFail}</span></div>`;
        const rem = info.remainingQueries ?? info.remaining ?? 'N/A';
        const total = info.totalQueries ?? info.total ?? null;
        const cls = valClass(rem, total);
        const tot = total != null ? `<span class="gqp-total">/ ${total}</span>` : '';
        return `<div class="gqp-row"><span class="gqp-name">${label}</span><span class="gqp-num"><span class="gqp-val ${cls}">${rem}</span>${tot}</span></div>`;
    }

    function buildChatSection(chat, sub) {
        if (!cfg.showText) return '';
        let html = `<div class="gqp-section"><div class="gqp-sec-title">${L.chatTitle}</div>`;
        html += buildQuotaRow(L.fast, chat.fast) + buildQuotaRow(L.expert, chat.expert);
        html += sub.canUseHeavy ? buildQuotaRow(L.heavy, chat.heavy) : buildQuotaRow(L.heavy, null, L.unlockHeavy);
        return html + '</div>';
    }

    function buildImagineSection(imagine) {
        if (!cfg.showImagine) return '';
        let html = `<div class="gqp-section"><div class="gqp-sec-title">${L.imagineTitle}</div>`;
        if (!imagine || imagine.error) {
            return html + `<div class="gqp-hint" style="padding:4px 2px">${L.refreshFail}</div></div>`;
        }
        const entries = Object.entries(imagine).filter(([, v]) => v != null);
        if (!entries.length) html += `<div class="gqp-hint" style="padding:4px 2px">—</div>`;
        else {
            for (const [key, val] of entries) {
                const rem = val?.remainingQueries ?? val?.remaining ?? val;
                const total = val?.totalQueries ?? val?.total ?? null;
                const cls = valClass(rem, total);
                const tot = total != null ? `<span class="gqp-total">/ ${total}</span>` : '';
                html += `<div class="gqp-row"><span class="gqp-name">${key}</span><span class="gqp-num"><span class="gqp-val ${cls}">${rem ?? '—'}</span>${tot}</span></div>`;
            }
        }
        return html + '</div>';
    }

    function buildToggles() {
        const t = cfg.showText ? 'on' : 'off';
        const i = cfg.showImagine ? 'on' : 'off';
        return `<div class="gqp-toggles"><button class="gqp-tbtn ${t}" data-tid="text">${L.textCategory}</button><button class="gqp-tbtn ${i}" data-tid="img">${L.imageCategory}</button></div>`;
    }

    function getPanel() { return document.getElementById(PANEL_ID); }

    function applyTheme() {
        const p = getPanel(); if (!p) return;
        p.classList.toggle('light', cfg.theme === 'light');
        const btn = p.querySelector('#gqp-theme');
        if (btn) btn.textContent = cfg.theme === 'light' ? '🌙' : '☀️';
    }

    function applyMinimized() {
        const p = getPanel(); if (!p) return;
        const body = p.querySelector('.pbody');
        if (body) body.style.display = cfg.minimized ? 'none' : '';
        const tog = p.querySelector('.gqp-toggles');
        if (tog) tog.style.display = cfg.minimized ? 'none' : '';
        const btn = p.querySelector('#gqp-min');
        if (btn) btn.textContent = cfg.minimized ? '+' : '−';
    }

    function updateBadge(sub) {
        const el = getPanel()?.querySelector('.badge');
        if (el) { el.style.background = sub.color; el.textContent = sub.tier; }
    }

    function updateContent(data) {
        const p = getPanel(); if (!p) return;
        const body = p.querySelector('.pbody');
        if (body) body.innerHTML = buildChatSection(data.chat, data.sub) + buildImagineSection(data.imagine);

        const old = p.querySelector('.gqp-toggles'); if (old) old.remove();
        const footer = p.querySelector('.pfooter');
        const tog = Object.assign(document.createElement('div'), { innerHTML: buildToggles() }).firstElementChild;
        if (footer) p.insertBefore(tog, footer);

        p.querySelectorAll('.gqp-tbtn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.tid === 'text') cfg.showText = !cfg.showText;
                else cfg.showImagine = !cfg.showImagine;
                updateContent(data); applyMinimized();
            });
        });

        const ts = new Date(data.timestamp).toLocaleTimeString(LANG === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' });
        if (footer) footer.innerHTML = `<span>${L.lastUpdate}: ${ts}</span><span class="fver">v${VERSION}</span>`;
    }

    let refreshTimer = null;
    async function refreshData() {
        const p = getPanel(); if (!p) return;
        const body = p.querySelector('.pbody');
        if (body) body.innerHTML = `<div class="loading">${L.loading}</div>`;
        try {
            const sub = detectSubscription();
            updateBadge(sub);
            const data = await fetchAllQuotas(sub);
            updateContent(data);
        } catch {
            const b = getPanel()?.querySelector('.pbody');
            if (b) b.innerHTML = `<div class="loading" style="color:var(--danger)">${L.refreshFail}</div>`;
        }
    }

    function startAutoRefresh() {
        if (refreshTimer) clearInterval(refreshTimer);
        refreshTimer = setInterval(() => {
            if (document.visibilityState === 'visible' && getPanel()) refreshData();
        }, REFRESH_MS);
    }

    function enableDrag(panel) {
        const header = panel.querySelector('.pheader'); if (!header) return;
        let ox=0, oy=0, sx=0, sy=0, on=false;
        header.style.cursor = 'grab';
        header.addEventListener('mousedown', e => {
            if (e.target.tagName === 'BUTTON') return;
            on = true; sx = e.clientX; sy = e.clientY;
            const r = panel.getBoundingClientRect(); ox = r.left; oy = r.top;
            header.style.cursor = 'grabbing'; e.preventDefault();
        });
        document.addEventListener('mousemove', e => {
            if (!on) return;
            panel.style.right = panel.style.bottom = 'unset';
            panel.style.left = `${Math.max(0, Math.min(ox + e.clientX - sx, window.innerWidth - panel.offsetWidth))}px`;
            panel.style.top = `${Math.max(0, Math.min(oy + e.clientY - sy, window.innerHeight - panel.offsetHeight))}px`;
        });
        document.addEventListener('mouseup', () => { if (on) { on=false; header.style.cursor='grab'; } });
    }

    function createPanel() {
        if (getPanel()) return;
        const sub = detectSubscription();
        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML = `
            <div class="pheader">
                <span class="badge" style="background:${sub.color}">${sub.tier}</span>
                <div class="hbtns">
                    <button id="gqp-refresh">⟳</button>
                    <button id="gqp-theme">☀️</button>
                    <button id="gqp-min">−</button>
                </div>
            </div>
            <div class="pbody"></div>
            <div class="pfooter"></div>`;
        document.body.appendChild(panel);

        panel.querySelector('#gqp-refresh').onclick = refreshData;
        panel.querySelector('#gqp-theme').onclick = () => { cfg.theme = cfg.theme==='dark'?'light':'dark'; applyTheme(); };
        panel.querySelector('#gqp-min').onclick = () => { cfg.minimized = !cfg.minimized; applyMinimized(); };

        applyTheme(); applyMinimized(); enableDrag(panel); refreshData();
    }

    function init() {
        if (getPanel()) return;
        createPanel();
        startAutoRefresh();
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && getPanel()) refreshData();
        });
    }

    GM_addStyle(`
        #${PANEL_ID}{--bg:#18181b;--bg2:#1c1c1f;--bg3:#27272a;--border:#3f3f46;--text:#e4e4e7;--sub:#a1a1aa;--hint:#71717a;--ok:#a3e635;--warn:#fb923c;--danger:#f87171;position:fixed;bottom:16px;right:16px;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;font-size:12.5px;min-width:260px;max-width:300px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:14px;box-shadow:0 16px 32px rgba(0,0,0,.55);overflow:hidden;user-select:none}
        #${PANEL_ID}.light{--bg:#fff;--bg2:#fafafa;--bg3:#f4f4f5;--border:#e4e4e7;--text:#18181b;--sub:#52525b;--hint:#a1a1aa;--ok:#16a34a;--warn:#ea580c;--danger:#dc2626}
        #${PANEL_ID} .pheader{display:flex;align-items:center;justify-content:space-between;padding:9px 12px 8px;background:var(--bg2);border-bottom:1px solid var(--border)}
        #${PANEL_ID} .badge{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;font-size:11.5px;font-weight:600;color:#fff;opacity:.92}
        #${PANEL_ID} .hbtns{display:flex;gap:2px}
        #${PANEL_ID} button{background:transparent;color:var(--sub);border:none;padding:3px 7px;border-radius:6px;font-size:13px;cursor:pointer}
        #${PANEL_ID} button:hover{background:var(--bg3);color:var(--text)}
        #${PANEL_ID} .pbody{padding:10px 12px 6px}
        #${PANEL_ID} .loading{padding:10px 2px;color:var(--hint);font-size:12.5px}
        .gqp-section{margin-bottom:8px}
        .gqp-sec-title{font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--hint);margin-bottom:5px;padding-left:1px}
        .gqp-row{display:flex;justify-content:space-between;align-items:center;padding:6px 10px;margin-bottom:3px;background:var(--bg3);border-radius:8px}
        .gqp-name{font-size:12.5px;font-weight:500;color:var(--sub)}
        .gqp-num{display:flex;align-items:baseline;gap:4px}
        .gqp-val{font-family:ui-monospace,SF Mono,Menlo,Consolas,monospace;font-size:14px;font-weight:700;line-height:1}
        .gqp-val.c-ok{color:var(--ok)}.gqp-val.c-warn{color:var(--warn)}.gqp-val.c-danger{color:var(--danger)}
        .gqp-total{font-size:10.5px;color:var(--hint);font-family:ui-monospace,Menlo,monospace}
        .gqp-hint{font-size:10.5px;color:var(--hint);font-style:italic}
        .gqp-toggles{display:flex;gap:6px;margin-top:8px;padding:8px 12px;background:var(--bg2);border-top:1px solid var(--border)}
        .gqp-tbtn{flex:1;background:var(--bg3);color:var(--sub);border:none;padding:6px 10px;border-radius:7px;font-size:11.5px;font-weight:500;cursor:pointer}
        .gqp-tbtn.on{background:#3f3f46;color:#e4e4e7}
        .gqp-tbtn.off{background:transparent;color:var(--hint);border:1px solid var(--border)}
        #${PANEL_ID} .pfooter{padding:5px 12px;font-size:10.5px;color:var(--hint);background:var(--bg2);border-top:1px solid var(--border);display:flex;justify-content:space-between}
        #${PANEL_ID} .fver{opacity:.45}
    `);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
