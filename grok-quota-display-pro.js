// ==UserScript==
// @name Grok Quota Display Pro
// @namespace https://github.com/BExhei/Grok-Quota-Display-Pro
// @version 2.2.1
// @description Grok quota monitor (fixed tooltip clipping + proper case) + updated for Fast/Expert/Heavy + SuperGrok points (API+progress bar) + membership tier for Heavy + imagine numeric support
// @author BExhei
// @icon https://www.google.com/s2/favicons?sz=64&domain=grok.com
// @match https://grok.com/*
// @grant GM_addStyle
// @grant GM_setValue
// @grant GM_getValue
// @license GPL-3.0
// @downloadURL https://update.greasyfork.org/scripts/578827/Grok%20Quota%20Display%20Pro.user.js
// @updateURL https://update.greasyfork.org/scripts/578827/Grok%20Quota%20Display%20Pro.meta.js
// ==/UserScript==

(function () {
    'use strict';

    // Cache for subscription points/usage captured from the page's own API calls.
    // This allows the progress bar to appear without the user ever opening the settings/Usage tab.
    let cachedPointsUsage = null;

    // Monkey-patch fetch *early* so we snoop on any /rest/* responses the official Grok app makes
    // (initial load, header, user menu, settings, etc.). When it contains the points info we cache it.
    try {
        const __origFetch = window.fetch;
        window.fetch = async function (input, init) {
            const res = await __origFetch.apply(this, arguments);
            try {
                const urlStr = typeof input === 'string' ? input : (input && input.url) || (init && init.url) || '';
                if (typeof urlStr === 'string' && urlStr.includes('grok.com/rest')) {
                    const clone = res.clone();
                    const ct = (clone.headers && clone.headers.get) ? clone.headers.get('content-type') || '' : '';
                    if (ct.includes('json')) {
                        const j = await clone.json().catch(() => null);
                        if (j) {
                            // direct percent fields
                            let p = null;
                            const walkFindPct = (o, d) => {
                                if (!o || typeof o !== 'object' || d > 5) return null;
                                for (const k in o) {
                                    const v = o[k];
                                    if (typeof v === 'number' && v >= 0 && v <= 100 && /percent|used|usage|quota|积分/i.test(k)) return v;
                                    const sub = walkFindPct(v, d + 1);
                                    if (sub != null) return sub;
                                }
                                return null;
                            };
                            p = walkFindPct(j, 0);

                            // exact phrase in any string value (the one user sees in settings)
                            const jstr = JSON.stringify(j);
                            let m = jstr.match(/随\s*SuperGrok\s*附赠的免费积分[，,]?\s*(\d{1,3})%\s*已用\s*[·•]\s*在\s*([^重置\r\n]+?)\s*重置/i);
                            if (m) {
                                cachedPointsUsage = {
                                    percent: parseInt(m[1], 10),
                                    resetDate: m[2].trim(),
                                    raw: m[0],
                                    source: 'intercepted'
                                };
                            } else if (p != null) {
                                // fallback numeric
                                cachedPointsUsage = {
                                    percent: Math.max(0, Math.min(100, Math.round(p))),
                                    resetDate: '',
                                    source: 'intercepted'
                                };
                            }
                        }
                    } else {
                        const t = await clone.text().catch(() => '');
                        const m = t.match(/随\s*SuperGrok\s*附赠的免费积分[，,]?\s*(\d{1,3})%\s*已用\s*[·•]\s*在\s*([^重置\r\n]+?)\s*重置/i);
                        if (m) {
                            cachedPointsUsage = {
                                percent: parseInt(m[1], 10),
                                resetDate: m[2].trim(),
                                raw: m[0],
                                source: 'intercepted'
                            };
                        }
                    }
                }
            } catch (e) {
                // never break the real fetch
            }
            return res;
        };
    } catch (e) {
        // patch failed (unlikely), ignore
    }

    const PANEL_ID = 'grok-quota-pro';
    const REFRESH_MS = 60 * 1000;
    const VERSION = '2.2.1';
    const LANG = navigator.language.startsWith('zh') ? 'zh' : 'en';

    const L = {
        chatTitle: LANG === 'zh' ? '聊天配额 / Chat Quotas' : 'Chat Quotas',
        imagineTitle: LANG === 'zh' ? '图像生成配额 / Imagine Quotas' : 'Imagine Quotas',
        fast: LANG === 'zh' ? '快速 (Fast)' : 'Fast',
        expert: LANG === 'zh' ? '专家 (Expert)' : 'Expert',
        heavy: LANG === 'zh' ? '重度 (Heavy)' : 'Heavy',
        pointsTitle: LANG === 'zh' ? '订阅积分使用 / Points' : 'Subscription Points',
        lastUpdate: LANG === 'zh' ? '更新' : 'Updated',
        loading: LANG === 'zh' ? '加载中…' : 'Loading…',
        refreshFail: LANG === 'zh' ? '加载失败' : 'Load failed',
        guest: LANG === 'zh' ? '游客' : 'Guest',
        loggedIn: LANG === 'zh' ? '已登录' : 'Logged in',
        textCategory: LANG === 'zh' ? '文字类' : 'Text',
        imageCategory: LANG === 'zh' ? '图片类' : 'Image',
        unlockHeavy: LANG === 'zh' ? '仅限 Heavy 订阅账户' : 'Heavy subscribers only',
        available: LANG === 'zh' ? '可用' : 'Available',
        unavailable: LANG === 'zh' ? '不可用' : 'Unavailable',
        imagineHelpText: LANG === 'zh'
            ? '图像配额：若后端返回具体数字则显示剩余/总额，否则显示可用状态。Grok 曾限制查询，当前以返回为准。'
            : 'Imagine quotas: shows remaining/total if the backend provides numbers, otherwise availability status. Grok previously restricted the interface; display follows the current response.'
    };

    const imagineKeyMap = LANG === 'zh'
        ? {
            image: '图像 (Image)',
            imagePro: '图像 Pro (Image Pro)',
            imageEdit: '图像编辑 (Image Edit)',
            video: '视频 (Video)',
            video720p: '视频 720p (Video 720p)'
          }
        : {
            image: 'Image',
            imagePro: 'Image Pro',
            imageEdit: 'Image Edit',
            video: 'Video',
            video720p: 'Video 720p'
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

    let tooltipEl = null;

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

    function getPointsUsage() {
        // Prefer data intercepted from the app's own fetches (works without opening settings)
        if (cachedPointsUsage && typeof cachedPointsUsage.percent === 'number') {
            return cachedPointsUsage;
        }
        try {
            const bodyText = document.body.innerText || '';
            // Chinese: e.g. "随 SuperGrok 附赠的免费积分，6% 已用 · 在 7月1日 重置"
            let m = bodyText.match(/随\s*SuperGrok\s*附赠的免费积分[，,]?\s*(\d{1,3})%\s*已用\s*[·•]\s*在\s*([^重置\r\n]+?)\s*重置/i);
            if (m) {
                return { percent: parseInt(m[1], 10), resetDate: m[2].trim(), raw: m[0] };
            }
            // More flexible Chinese
            m = bodyText.match(/SuperGrok[^%]{0,40}?(\d{1,3})%\s*已用[^·]{0,10}[·•]\s*在\s*([^重置\r\n]+?重置)/i);
            if (m) {
                return { percent: parseInt(m[1], 10), resetDate: m[2].trim() };
            }
            // English approx: "Free points included with SuperGrok, 6% used · Resets on July 1"
            m = bodyText.match(/Free points?\s*(?:included with|bundled with|for)\s*SuperGrok[,.]?\s*(\d{1,3})%\s*(?:used|used up)[^·]{0,10}[·•]?\s*(?:Resets?|Reset)\s*(?:on\s+)?([^\n\r]+)/i);
            if (m) {
                return { percent: parseInt(m[1], 10), resetDate: m[2].trim(), raw: m[0] };
            }
            // Fallback: scan lines containing SuperGrok + % + (used/已用/reset)
            const lines = bodyText.split(/[\r\n]+/);
            for (let line of lines) {
                if (/SuperGrok/i.test(line) && /%/.test(line) && /(已用|used|reset|重置)/i.test(line)) {
                    const pm = line.match(/(\d{1,3})%/);
                    if (pm) {
                        const rm = line.match(/(?:重置|reset|Resets?)[^\n\r]{0,40}/i);
                        const found = {
                            percent: parseInt(pm[1], 10),
                            resetDate: rm ? rm[0].replace(/^(?:重置|reset|Resets?)\s*(?:on\s*)?/i, '').trim() : '',
                            raw: line.trim()
                        };
                        cachedPointsUsage = found;  // keep cache fresh from DOM too
                        return found;
                    }
                }
            }
        } catch {}
        return null;
    }

    function parseUsageJson(data) {
        if (!data) return null;
        try {
            const jstr = JSON.stringify(data);
            // 优先抓用户看到的完整中文短语（即使它作为 label 存在于 API JSON 里）
            let m = jstr.match(/随\s*SuperGrok\s*附赠的免费积分[，,]?\s*(\d{1,3})%\s*已用\s*[·•]\s*在\s*([^重置\r\n]+?)\s*重置/i);
            if (m) {
                return {
                    percent: parseInt(m[1], 10),
                    resetDate: m[2].trim(),
                    raw: m[0],
                    source: 'api'
                };
            }

            // 常见结构：数组订阅、或 {usage, quota, credits, subscription}
            const candidates = Array.isArray(data) ? data : [data, data.subscription, data.usage, data.quota, data.credits, ...(Array.isArray(data.subscriptions) ? data.subscriptions : [])];
            for (let item of candidates) {
                if (!item || typeof item !== 'object') continue;
                let pct = null;
                let reset = null;
                // 直接字段
                if (typeof item.percentUsed === 'number') pct = item.percentUsed;
                else if (typeof item.usagePercent === 'number') pct = item.usagePercent;
                else if (typeof item.percent === 'number' && item.percent <= 100) pct = item.percent;
                else if (item.usage && typeof item.usage.percent === 'number') pct = item.usage.percent;
                else if (item.points && typeof item.points.percent === 'number') pct = item.points.percent;
                else if (item.freePoints && typeof item.freePoints.usedPercent === 'number') pct = item.freePoints.usedPercent;

                // 递归浅搜数字百分比附近 key
                if (pct == null) {
                    const walk = (o, d=0) => {
                        if (d > 4 || !o || typeof o !== 'object') return null;
                        for (const k in o) {
                            const v = o[k];
                            if (typeof v === 'number' && v >= 0 && v <= 100 && /percent|used|usage|quota/i.test(k)) return v;
                            if (typeof v === 'object') {
                                const r = walk(v, d+1);
                                if (r != null) return r;
                            }
                        }
                        return null;
                    };
                    pct = walk(item);
                }

                // reset / renewal
                const findReset = (o, d=0) => {
                    if (d > 4 || !o || typeof o !== 'object') return null;
                    for (const k in o) {
                        const v = o[k];
                        if (/reset|renew|expire|billing|next|date/i.test(k)) {
                            if (typeof v === 'string' && v.length > 3) return v;
                            if (v && typeof v === 'object' && v.date) return v.date;
                        }
                        if (typeof v === 'object') {
                            const r = findReset(v, d+1);
                            if (r) return r;
                        }
                    }
                    return null;
                };
                reset = findReset(item);

                // 也试着从字符串描述里抓（如果后端返回了 label）
                if (pct == null) {
                    const m2 = jstr.match(/(\d{1,3})%/);
                    if (m2) pct = parseInt(m2[1], 10);
                }

                if (pct != null) {
                    return {
                        percent: Math.max(0, Math.min(100, Math.round(pct))),
                        resetDate: (reset && typeof reset === 'string') ? reset.replace(/T.*|Z$/g, '').trim() : (typeof reset === 'string' ? reset : ''),
                        source: 'api'
                    };
                }
            }
        } catch {}
        return null;
    }

    async function fetchSubscriptionUsage() {
        if (cachedPointsUsage && typeof cachedPointsUsage.percent === 'number') {
            return cachedPointsUsage;
        }
        const endpoints = [
            { url: 'https://grok.com/rest/subscriptions', method: 'GET' },
            { url: 'https://grok.com/rest/subscriptions', method: 'POST', body: '{}' },
            { url: 'https://grok.com/rest/subscription', method: 'GET' },
            { url: 'https://grok.com/rest/user', method: 'GET' },
            { url: 'https://grok.com/rest/user', method: 'POST', body: '{}' },
            { url: 'https://grok.com/rest/usage', method: 'POST', body: '{}' },
            { url: 'https://grok.com/rest/account/usage', method: 'POST', body: '{}' },
            { url: 'https://grok.com/rest/rate-limits', method: 'POST', body: '{}' },
        ];
        for (const ep of endpoints) {
            try {
                const res = await fetch(ep.url, {
                    method: ep.method,
                    headers: { 'Content-Type': 'application/json' },
                    body: ep.body || undefined,
                    credentials: 'include'
                });
                if (res.ok) {
                    const json = await res.json();
                    const parsed = parseUsageJson(json);
                    if (parsed && typeof parsed.percent === 'number') {
                        cachedPointsUsage = parsed;
                        return parsed;
                    }
                }
            } catch (e) {
                // 忽略，继续下一个
            }
        }
        return null;
    }

    function buildSubscriptionSection(usage) {
        if (!usage || typeof usage.percent !== 'number') return '';
        const pct = usage.percent;
        const cls = pct >= 90 ? 'c-danger' : pct >= 70 ? 'c-warn' : 'c-ok';
        const usedLabel = LANG === 'zh' ? '已用' : 'used';
        const resetLabel = LANG === 'zh' ? '重置' : 'Resets';
        let html = `<div class="gqp-section"><div class="gqp-sec-title">${L.pointsTitle}</div>`;
        html += `<div class="gqp-row gqp-usage-row" style="flex-direction:column;align-items:stretch;padding:6px 10px;">`;
        html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">`;
        html += `<span class="gqp-name">${LANG === 'zh' ? '免费积分' : 'Free points'}</span>`;
        html += `<span class="gqp-val ${cls}" style="font-size:13px;font-weight:700;">${pct}% ${usedLabel}</span>`;
        html += `</div>`;
        html += `<div class="gqp-progress"><div class="gqp-bar ${cls}" style="width:${pct}%"></div></div>`;
        if (usage.resetDate) {
            html += `<div class="gqp-usage-text" style="margin-top:3px;font-size:10.5px;color:var(--hint);">${resetLabel}: ${usage.resetDate}</div>`;
        }
        if (usage.source === 'api') {
            html += `<div class="gqp-usage-text" style="font-size:9px;opacity:.6;">(live)</div>`;
        }
        html += `</div></div>`;
        return html;
    }

    async function fetchChatQuota(kind) {
        try {
            const res = await fetch('https://grok.com/rest/rate-limits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modelName: kind }),
                credentials: 'include'
            });
            return res.ok ? await res.json() : { error: true };
        } catch {
            return { error: true };
        }
    }

    async function fetchImagineQuota() {
        try {
            const res = await fetch('https://grok.com/rest/media/imagine/quota_info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}',
                credentials: 'include'
            });
            return res.ok ? await res.json() : { error: true };
        } catch {
            return { error: true };
        }
    }

    async function fetchAllQuotas(sub) {
        const chat = {};
        const tasks = [
            fetchChatQuota('fast').then(d => chat.fast = d),
            fetchChatQuota('expert').then(d => chat.expert = d)
        ];
        if (sub && sub.canUseHeavy) {
            tasks.push(fetchChatQuota('heavy').then(d => chat.heavy = d));
        }
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
        if (hint) {
            return `<div class="gqp-row"><span class="gqp-name">${label}</span><span class="gqp-hint">${hint}</span></div>`;
        }
        if (!info || info.error) {
            return `<div class="gqp-row"><span class="gqp-name">${label}</span><span class="gqp-val c-danger">${L.refreshFail}</span></div>`;
        }
        const rem = info.remainingQueries ?? info.remaining ?? 'N/A';
        const total = info.totalQueries ?? info.total ?? null;
        const cls = valClass(rem, total);
        const tot = total != null ? `<span class="gqp-total">/ ${total}</span>` : '';
        return `<div class="gqp-row"><span class="gqp-name">${label}</span><span class="gqp-num"><span class="gqp-val ${cls}">${rem}</span>${tot}</span></div>`;
    }

    function buildChatSection(chat, sub) {
        if (!cfg.showText) return '';
        chat = chat || {};
        const s = sub || { canUseHeavy: false };
        let html = `<div class="gqp-section"><div class="gqp-sec-title">${L.chatTitle}</div>`;
        html += buildQuotaRow(L.fast, chat.fast) + buildQuotaRow(L.expert, chat.expert);
        html += s.canUseHeavy ? buildQuotaRow(L.heavy, chat.heavy) : buildQuotaRow(L.heavy, null, L.unlockHeavy);
        return html + '</div>';
    }

    function buildImagineSection(imagine) {
        if (!cfg.showImagine) return '';
        let html = `<div class="gqp-section"><div class="gqp-sec-title">${L.imagineTitle} <span class="gqp-help">?</span></div>`;
        if (!imagine || imagine.error) {
            return html + `<div class="gqp-hint" style="padding:4px 2px">${L.refreshFail}</div></div>`;
        }
        const entries = Object.entries(imagine).filter(([, v]) => v != null);
        if (!entries.length) {
            html += `<div class="gqp-hint" style="padding:4px 2px">—</div>`;
        } else {
            for (const [key, val] of entries) {
                const displayKey = imagineKeyMap[key] || key;
                if (val && typeof val === 'object') {
                    // 如果后端现在返回实际数字（remaining / total），优先像聊天配额一样显示
                    const rem = val.remainingQueries ?? val.remaining ?? val.count ?? val.used ?? null;
                    const total = val.totalQueries ?? val.total ?? val.limit ?? null;
                    if (typeof rem === 'number' || typeof total === 'number') {
                        const cls = valClass(rem, total);
                        const totStr = total != null ? `<span class="gqp-total">/ ${total}</span>` : '';
                        html += `<div class="gqp-row"><span class="gqp-name">${displayKey}</span><span class="gqp-num"><span class="gqp-val ${cls}">${rem ?? '—'}</span>${totStr}</span></div>`;
                        continue;
                    }
                    // 否则回退到可用性
                    let displayValue = '—';
                    let cls = '';
                    if (val.available === true) {
                        displayValue = L.available;
                        cls = 'c-ok';
                    } else if (val.available === false) {
                        displayValue = L.unavailable;
                        cls = 'c-danger';
                    } else if (typeof val.available === 'string') {
                        displayValue = val.available;
                    }
                    html += `<div class="gqp-row"><span class="gqp-name">${displayKey}</span><span class="gqp-num"><span class="${cls}" style="font-size:12.5px;font-weight:500;">${displayValue}</span></span></div>`;
                } else {
                    html += `<div class="gqp-row"><span class="gqp-name">${displayKey}</span><span class="gqp-num"><span style="font-size:12.5px;">${val}</span></span></div>`;
                }
            }
        }
        return html + '</div>';
    }

    function buildToggles() {
        const t = cfg.showText ? 'on' : 'off';
        const i = cfg.showImagine ? 'on' : 'off';
        return `<div class="gqp-toggles"><button class="gqp-tbtn ${t}" data-tid="text">${L.textCategory}</button><button class="gqp-tbtn ${i}" data-tid="img">${L.imageCategory}</button></div>`;
    }

    function getPanel() {
        return document.getElementById(PANEL_ID);
    }

    function applyTheme() {
        const p = getPanel();
        if (!p) return;
        p.classList.toggle('light', cfg.theme === 'light');
        const btn = p.querySelector('#gqp-theme');
        if (btn) btn.textContent = cfg.theme === 'light' ? '🌙' : '☀️';
    }

    function applyMinimized() {
        const p = getPanel();
        if (!p) return;
        const body = p.querySelector('.pbody');
        if (body) body.style.display = cfg.minimized ? 'none' : '';
        const tog = p.querySelector('.gqp-toggles');
        if (tog) tog.style.display = cfg.minimized ? 'none' : '';
        const btn = p.querySelector('#gqp-min');
        if (btn) btn.textContent = cfg.minimized ? '+' : '−';
    }

    function updateBadge(sub) {
        const el = getPanel()?.querySelector('.badge');
        if (el) {
            el.style.background = sub.color;
            el.textContent = sub.tier;
        }
    }

    function updateContent(data) {
        const p = getPanel();
        if (!p) return;
        const body = p.querySelector('.pbody');
        const usage = (data && data.usage) ? data.usage : getPointsUsage();
        if (body) body.innerHTML = buildSubscriptionSection(usage) + buildChatSection(data ? data.chat : null, data ? data.sub : null) + buildImagineSection(data ? data.imagine : null);
        const old = p.querySelector('.gqp-toggles');
        if (old) old.remove();
        const footer = p.querySelector('.pfooter');
        const tog = Object.assign(document.createElement('div'), { innerHTML: buildToggles() }).firstElementChild;
        if (footer) p.insertBefore(tog, footer);
        p.querySelectorAll('.gqp-tbtn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.tid === 'text') cfg.showText = !cfg.showText;
                else cfg.showImagine = !cfg.showImagine;
                updateContent(data);
                applyMinimized();
            });
        });
        const helpIcon = p.querySelector('.gqp-help');
        if (helpIcon) {
            helpIcon.addEventListener('mouseenter', showTooltip);
            helpIcon.addEventListener('mouseleave', hideTooltip);
        }
        const ts = (data && data.timestamp) ? new Date(data.timestamp).toLocaleTimeString(LANG === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' }) : '--';
        if (footer) footer.innerHTML = `<span>${L.lastUpdate}: ${ts}</span><span class="fver">v${VERSION}</span>`;
    }

    function showTooltip(e) {
        hideTooltip();
        tooltipEl = document.createElement('div');
        tooltipEl.style.cssText = 'position:fixed;background:#f0f0f0;color:#222;padding:10px 14px;border-radius:8px;font-size:12.5px;font-weight:400;line-height:1.55;white-space:pre-wrap;width:320px;max-width:340px;z-index:9999999;box-shadow:0 6px 16px rgba(0,0,0,0.25);border:1px solid #ddd;pointer-events:none;';
        tooltipEl.textContent = L.imagineHelpText;
        document.body.appendChild(tooltipEl);
        const rect = e.target.getBoundingClientRect();
        const tooltipRect = tooltipEl.getBoundingClientRect();
        let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
        let top = rect.top - tooltipRect.height - 8;
        if (left < 10) left = 10;
        if (left + tooltipRect.width > window.innerWidth - 10) left = window.innerWidth - tooltipRect.width - 10;
        tooltipEl.style.left = left + 'px';
        tooltipEl.style.top = top + 'px';
    }

    function hideTooltip() {
        if (tooltipEl) {
            tooltipEl.remove();
            tooltipEl = null;
        }
    }

    let refreshTimer = null;

    async function refreshData() {
        const p = getPanel();
        if (!p) return;
        const body = p.querySelector('.pbody');
        if (body) body.innerHTML = `<div class="loading">${L.loading}</div>`;
        try {
            const sub = detectSubscription();
            updateBadge(sub);
            // 优先尝试 API（无需打开设置也能拿到），失败回退 DOM
            let usage = await fetchSubscriptionUsage();
            if (!usage) usage = getPointsUsage();
            const data = await fetchAllQuotas(sub);
            data.usage = usage;
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

    let domObserver = null;
    function setupDomObserver() {
        if (domObserver) return;
        let debounce = null;
        domObserver = new MutationObserver((mutations) => {
            for (const mut of mutations) {
                const target = mut.target;
                // Ignore anything inside our own floating panel (prevents the "% 已用" we render from re-triggering)
                if (target && target.closest && target.closest('#' + PANEL_ID)) continue;

                const addedText = (mut.addedNodes && mut.addedNodes.length)
                    ? Array.from(mut.addedNodes).map(n => (n && n.textContent) || '').join(' ')
                    : (mut.target && mut.target.textContent) || '';

                // Only react to the *real* full phrase that appears in the settings Usage tab
                if (addedText && /随\s*SuperGrok\s*附赠的免费积分/.test(addedText)) {
                    const u = getPointsUsage();
                    if (u && typeof u.percent === 'number') {
                        cachedPointsUsage = u;
                    }
                    if (debounce) clearTimeout(debounce);
                    debounce = setTimeout(() => {
                        if (getPanel() && document.visibilityState === 'visible') {
                            refreshData();  // one-time update when the real data appears (no loop thanks to exact phrase + panel ignore)
                        }
                    }, 400);
                    break;
                }
            }
        });
        domObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    function enableDrag(panel) {
        const header = panel.querySelector('.pheader');
        if (!header) return;
        let ox = 0, oy = 0, sx = 0, sy = 0, on = false;
        header.style.cursor = 'grab';
        header.addEventListener('mousedown', e => {
            if (e.target.tagName === 'BUTTON') return;
            on = true;
            sx = e.clientX;
            sy = e.clientY;
            const r = panel.getBoundingClientRect();
            ox = r.left;
            oy = r.top;
            header.style.cursor = 'grabbing';
            e.preventDefault();
        });
        document.addEventListener('mousemove', e => {
            if (!on) return;
            panel.style.right = panel.style.bottom = 'unset';
            panel.style.left = Math.max(0, Math.min(ox + e.clientX - sx, window.innerWidth - panel.offsetWidth)) + 'px';
            panel.style.top = Math.max(0, Math.min(oy + e.clientY - sy, window.innerHeight - panel.offsetHeight)) + 'px';
        });
        document.addEventListener('mouseup', () => {
            if (on) {
                on = false;
                header.style.cursor = 'grab';
            }
        });
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
        panel.querySelector('#gqp-theme').onclick = () => {
            cfg.theme = cfg.theme === 'dark' ? 'light' : 'dark';
            applyTheme();
        };
        panel.querySelector('#gqp-min').onclick = () => {
            cfg.minimized = !cfg.minimized;
            applyMinimized();
        };

        applyTheme();
        applyMinimized();
        enableDrag(panel);
        refreshData();
    }

    function init() {
        if (getPanel()) return;
        createPanel();
        startAutoRefresh();
        setupDomObserver();
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && getPanel()) refreshData();
        });
    }

    GM_addStyle(`
        #${PANEL_ID}{--bg:#18181b;--bg2:#1c1c1f;--bg3:#27272a;--border:#3f3f46;--text:#e4e4e7;--sub:#a1a1aa;--hint:#71717a;--ok:#a3e635;--warn:#fb923c;--danger:#f87171;position:fixed;bottom:16px;right:16px;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;font-size:12.5px;min-width:260px;max-width:300px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,0.12);overflow:hidden;user-select:none}
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
        .gqp-help{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;font-size:11px;font-weight:bold;color:#888;background:#333;border-radius:50%;margin-left:6px;cursor:help;user-select:none;vertical-align:middle}
        .c-ok{color:var(--ok)}
        .c-danger{color:var(--danger)}
        #${PANEL_ID} .gqp-progress{height:5px;background:var(--bg3);border-radius:999px;overflow:hidden;margin:2px 0 1px}
        #${PANEL_ID} .gqp-bar{height:100%;background:var(--ok);transition:width .25s ease}
        #${PANEL_ID} .gqp-bar.c-warn{background:var(--warn)}
        #${PANEL_ID} .gqp-bar.c-danger{background:var(--danger)}
        #${PANEL_ID} .gqp-usage-row .gqp-name{font-size:12px}
        #${PANEL_ID} .gqp-usage-text{font-size:10.5px;color:var(--hint)}
    `);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
