// ==UserScript==
// @name Grok Quota Display Pro
// @namespace https://github.com/BExhei/Grok-Quota-Display-Pro
// @version 2.3.0
// @description Grok quota monitor — text chat quotas + usage total limit; grok-3/grok-4/grok-4-heavy API
// @run-at       document-start
// @author BExhei
// @icon https://www.google.com/s2/favicons?sz=64&domain=grok.com
// @match https://grok.com/*
// @grant GM_addStyle
// @license GPL-3.0
// @downloadURL https://update.greasyfork.org/scripts/578827/Grok%20Quota%20Display%20Pro.user.js
// @updateURL https://update.greasyfork.org/scripts/578827/Grok%20Quota%20Display%20Pro.meta.js
// ==/UserScript==

(function () {
    'use strict';

    // Cache for subscription points/usage captured from the page's own API calls.
    let cachedPointsUsage = null;
    const cachedChatQuotas = {};

    function cacheChatQuotaFromIntercept(urlStr, reqBody, payload) {
        if (!payload || typeof payload !== 'object' || !/\/rest\/rate-limits/.test(urlStr)) return;
        let body = {};
        try { body = reqBody ? JSON.parse(reqBody) : {}; } catch { body = {}; }
        const modelName = body.modelName || '';
        const parsed = normalizeRateLimitResponse(payload);
        if (parsed.error || parsed.disabled) return;
        for (const [kind, model] of Object.entries(CHAT_MODELS)) {
            if (modelName === model || modelName === kind) cachedChatQuotas[kind] = parsed;
        }
    }

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
                            cacheChatQuotaFromIntercept(urlStr, init && init.body, j);
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
    const VERSION = '2.3.0';

    const CHAT_MODELS = {
        fast: 'grok-3',
        expert: 'grok-4',
        heavy: 'grok-4-heavy',
    };

    const CHAT_MODEL_FALLBACKS = {
        fast: ['fast'],
        expert: ['expert'],
        heavy: ['heavy'],
    };

    const DEFAULT_REQUEST_KIND = 'DEFAULT';
    const LANG = navigator.language.startsWith('zh') ? 'zh' : 'en';

    const L = {
        chatTitle: LANG === 'zh' ? '聊天配额 / Chat Quotas' : 'Chat Quotas',
        fast: LANG === 'zh' ? '快速 (Fast)' : 'Fast',
        expert: LANG === 'zh' ? '专家 (Expert)' : 'Expert',
        heavy: LANG === 'zh' ? '重度 (Heavy)' : 'Heavy',
        usageTitle: LANG === 'zh' ? '使用量总限额 / Usage Limit' : 'Usage Total Limit',
        usageEmpty: LANG === 'zh' ? '暂无用量数据，可打开设置 → 用量 刷新' : 'No usage data — open Settings → Usage',
        lastUpdate: LANG === 'zh' ? '更新' : 'Updated',
        loading: LANG === 'zh' ? '加载中…' : 'Loading…',
        refreshFail: LANG === 'zh' ? '加载失败' : 'Load failed',
        guest: LANG === 'zh' ? '游客' : 'Guest',
        loggedIn: LANG === 'zh' ? '已登录' : 'Logged in',
        unlockHeavy: LANG === 'zh' ? '仅限 Heavy 订阅账户' : 'Heavy subscribers only',
    };

    const cfg = {
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

    function buildUsageSection(usage) {
        let html = `<div class="gqp-section"><div class="gqp-sec-title">${L.usageTitle}</div>`;
        if (!usage || typeof usage.percent !== 'number') {
            return html + `<div class="gqp-hint" style="padding:4px 2px">${L.usageEmpty}</div></div>`;
        }
        const pct = usage.percent;
        const cls = pct >= 90 ? 'c-danger' : pct >= 70 ? 'c-warn' : 'c-ok';
        const usedLabel = LANG === 'zh' ? '已用' : 'used';
        const resetLabel = LANG === 'zh' ? '重置' : 'Resets';
        html += `<div class="gqp-row gqp-usage-row" style="flex-direction:column;align-items:stretch;padding:6px 10px;">`;
        html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">`;
        html += `<span class="gqp-name">${LANG === 'zh' ? '免费积分' : 'Free points'}</span>`;
        html += `<span class="gqp-val ${cls}" style="font-size:13px;font-weight:700;">${pct}% ${usedLabel}</span>`;
        html += `</div>`;
        html += `<div class="gqp-progress"><div class="gqp-bar ${cls}" style="width:${pct}%"></div></div>`;
        if (usage.resetDate) {
            html += `<div class="gqp-usage-text" style="margin-top:3px;font-size:10.5px;color:var(--hint);">${resetLabel}: ${usage.resetDate}</div>`;
        }
        html += `</div></div>`;
        return html;
    }

    function apiHeaders() {
        return {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Xai-Request-Id': Math.random().toString(16).slice(2),
        };
    }

    function getRateLimitTotal(info) {
        if (!info || typeof info !== 'object') return null;
        const direct = info.totalQueries ?? info.totalTokens ?? info.maxQueries
            ?? info.limit ?? info.queryLimit ?? info.quotaLimit ?? info.maxRequests ?? info.total;
        if (typeof direct === 'number') return direct;
        const rem = info.remainingQueries ?? info.remainingTokens ?? info.remaining;
        const used = info.usedQueries ?? info.usedTokens ?? info.used;
        if (typeof rem === 'number' && typeof used === 'number') return rem + used;
        return null;
    }

    function getRateLimitRemaining(info) {
        if (!info || typeof info !== 'object') return null;
        const rem = info.remainingQueries ?? info.remainingTokens ?? info.remaining;
        return typeof rem === 'number' ? rem : null;
    }

    function normalizeRateLimitResponse(data) {
        if (!data || typeof data !== 'object') return { error: true };
        if (data.error) return data;

        const disabledMsg = data.message || data.errorMessage || data.detail || data.error?.message;
        if (typeof disabledMsg === 'string' && /temporarily disabled|暂时禁用|暂时关闭/i.test(disabledMsg)) {
            return { disabled: true, message: disabledMsg };
        }

        const pick = (info) => {
            const rem = getRateLimitRemaining(info);
            if (rem == null) return null;
            return {
                remainingQueries: rem,
                totalQueries: getRateLimitTotal(info),
                waitTimeSeconds: info.waitTimeSeconds ?? info.resetAfterSeconds ?? info.retryAfterSeconds ?? 0,
            };
        };

        const high = pick(data.highEffortRateLimits);
        const low = pick(data.lowEffortRateLimits);
        if (high && low) {
            return {
                remainingQueries: high.remainingQueries,
                totalQueries: high.totalQueries,
                lowRemaining: low.remainingQueries,
                lowTotal: low.totalQueries,
            };
        }
        if (high) return high;
        if (low) return low;

        const direct = pick(data);
        if (direct) return direct;

        return { error: true };
    }

    async function fetchRateLimitRaw(modelName, requestKind = DEFAULT_REQUEST_KIND) {
        const res = await fetch('https://grok.com/rest/rate-limits', {
            method: 'POST',
            headers: apiHeaders(),
            body: JSON.stringify({ modelName, requestKind }),
            credentials: 'include',
        });
        if (!res.ok) return null;
        try {
            return await res.json();
        } catch {
            return null;
        }
    }

    async function fetchChatQuota(kind) {
        if (cachedChatQuotas[kind]) return cachedChatQuotas[kind];
        const models = [CHAT_MODELS[kind], ...(CHAT_MODEL_FALLBACKS[kind] || [])].filter(Boolean);
        for (const modelName of models) {
            try {
                const raw = await fetchRateLimitRaw(modelName, DEFAULT_REQUEST_KIND);
                const parsed = normalizeRateLimitResponse(raw);
                if (!parsed.error && !parsed.disabled) {
                    cachedChatQuotas[kind] = parsed;
                    return parsed;
                }
            } catch {
                // try next model id
            }
        }
        return { error: true };
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
        return { chat, timestamp: Date.now(), sub };
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
        let extra = '';
        if (typeof info.lowRemaining === 'number') {
            const lowTot = info.lowTotal != null ? ` / ${info.lowTotal}` : '';
            extra = `<div class="gqp-usage-text" style="margin-top:2px;font-size:10px;color:var(--hint);">${LANG === 'zh' ? '低消耗' : 'Low'}: ${info.lowRemaining}${lowTot}</div>`;
        }
        return `<div class="gqp-row" style="flex-direction:column;align-items:stretch;"><div style="display:flex;justify-content:space-between;align-items:center;"><span class="gqp-name">${label}</span><span class="gqp-num"><span class="gqp-val ${cls}">${rem}</span>${tot}</span></div>${extra}</div>`;
    }

    function buildChatSection(chat, sub) {
        chat = chat || {};
        const s = sub || { canUseHeavy: false };
        let html = `<div class="gqp-section"><div class="gqp-sec-title">${L.chatTitle}</div>`;
        html += buildQuotaRow(L.fast, chat.fast) + buildQuotaRow(L.expert, chat.expert);
        html += s.canUseHeavy ? buildQuotaRow(L.heavy, chat.heavy) : buildQuotaRow(L.heavy, null, L.unlockHeavy);
        return html + '</div>';
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
        if (body) body.innerHTML = buildUsageSection(usage) + buildChatSection(data ? data.chat : null, data ? data.sub : null);
        const footer = p.querySelector('.pfooter');
        const ts = (data && data.timestamp) ? new Date(data.timestamp).toLocaleTimeString(LANG === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' }) : '--';
        if (footer) footer.innerHTML = `<span>${L.lastUpdate}: ${ts}</span><span class="fver">v${VERSION}</span>`;
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
        #${PANEL_ID} .pfooter{padding:5px 12px;font-size:10.5px;color:var(--hint);background:var(--bg2);border-top:1px solid var(--border);display:flex;justify-content:space-between}
        #${PANEL_ID} .fver{opacity:.45}
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
