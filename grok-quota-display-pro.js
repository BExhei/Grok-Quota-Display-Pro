// ==UserScript==
// @name Grok Quota Display Pro
// @namespace https://github.com/BExhei/Grok-Quota-Display-Pro
// @version 2.4.0
// @description Grok quota monitor — text chat quotas + usage total limit; auto-detects model & requestKind for grok-3 Think/DeepSearch
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

    // ─── Model detection from UI (credit: inspired by lqzone's Grok Rate Limit Display) ───
    const MODEL_MAP = {
        "Grok 4.3 (beta)": "grok-420-computer-use-sa",
        "Grok 4.20 (Beta)": "grok-420",
        "Grok 420": "grok-420",
        "Grok 4": "grok-4",
        "Grok 3": "grok-3",
        "Grok 4 Heavy": "grok-4-heavy",
        "Grok 4 With Effort Decider": "grok-4-auto",
        "Auto": "grok-4-auto",
        "Fast": "grok-3",
        "Expert": "grok-4",
        "Heavy": "grok-4-heavy",
        "Grok 4 Fast": "grok-4-mini-thinking-tahoe",
        "Grok 4.1": "grok-4-1-non-thinking-w-tool",
        "Grok 4.1 Thinking": "grok-4-1-thinking-1129",
        "Grok 2": "grok-2",
        "Grok 2 Mini": "grok-2-mini",
    };

    // Map UI model keys to our display categories
    const MODEL_TO_CATEGORY = {
        "grok-3": "fast",
        "grok-4": "expert",
        "grok-4-heavy": "heavy",
        "grok-4-auto": "auto",
        "grok-4-1-non-thinking-w-tool": "fast",
        "grok-4-1-thinking-1129": "expert",
        "grok-4-mini-thinking-tahoe": "fast",
        "grok-420": "expert",
        "grok-420-computer-use-sa": "expert",
        "grok-2": "fast",
        "grok-2-mini": "fast",
    };

    const QUERY_BAR_SELECTOR = ".query-bar";
    const MODEL_SELECTOR = "button[aria-label='Model select']";
    const MODEL_SELECT_ARIA_LABELS = new Set(["Model select", "模型选择"]);

    function findModelButton(queryBar) {
        const directMatch = queryBar.querySelector(MODEL_SELECTOR);
        if (directMatch) return directMatch;
        const buttons = Array.from(queryBar.querySelectorAll('button'));
        return buttons.find(b => MODEL_SELECT_ARIA_LABELS.has(b.getAttribute('aria-label'))) || null;
    }

    function getCurrentModelName(queryBar) {
        if (!queryBar) return "grok-3";
        const modelButton = findModelButton(queryBar);
        if (!modelButton) return "grok-3";

        // Check text span first
        const textEl = modelButton.querySelector('span.font-semibold');
        if (textEl) {
            const t = textEl.textContent.trim();
            if (MODEL_MAP[t]) return MODEL_MAP[t];
        }
        // Fallback to old chooser text
        const oldText = modelButton.querySelector('span.inline-block');
        if (oldText) {
            const t = oldText.textContent.trim();
            if (MODEL_MAP[t]) return MODEL_MAP[t];
        }
        // SVG path matching
        const svg = modelButton.querySelector('svg');
        if (svg) {
            const pathsD = Array.from(svg.querySelectorAll('path'))
                .map(p => p.getAttribute('d') || '').filter(d => d.length > 0).join(' ');
            const hasBrainFill = svg.querySelector('path[class*="fill-yellow-100"]') !== null;

            if (pathsD.includes('M6.5 12.5L11.5 17.5')) return 'grok-4-auto';
            if (pathsD.includes('M5 14.25L14 4')) return 'grok-3';
            if (hasBrainFill || pathsD.includes('M19 9C19 12.866')) return 'grok-4';
            if (pathsD.includes('M12 3a6 6 0 0 0 9 9')) return 'grok-4-mini-thinking-tahoe';
            if (pathsD.includes('M11 18H10C7.79086 18 6 16.2091 6 14V13')) return 'grok-4-heavy';
        }
        return "grok-3";
    }

    // ─── requestKind detection for grok-3 (Think / DeepSearch) ───
    function detectRequestKind(queryBar, modelName) {
        if (modelName !== 'grok-3') return 'DEFAULT';
        // Find Think button by SVG path
        const buttons = queryBar.querySelectorAll('button');
        let thinkPressed = false;
        let searchKind = null;
        for (const btn of buttons) {
            const aria = btn.getAttribute('aria-label') || '';
            if (aria === 'Think' && btn.getAttribute('aria-pressed') === 'true') {
                const path = btn.querySelector('path');
                if (path) {
                    const d = path.getAttribute('d') || '';
                    if (d.includes('M19 9C19 12.866')) thinkPressed = true;
                }
            }
            if (/Deep(?:er)?Search/i.test(aria) && btn.getAttribute('aria-pressed') === 'true') {
                if (/deeper/i.test(aria)) searchKind = 'DEEPERSEARCH';
                else if (/deep/i.test(aria)) searchKind = 'DEEPSEARCH';
            }
        }
        if (thinkPressed) return 'REASONING';
        if (searchKind) return searchKind;
        return 'DEFAULT';
    }

    function getQueryBar() {
        return document.querySelector(QUERY_BAR_SELECTOR);
    }

    // ─── Constants ───
    const PANEL_ID = 'grok-quota-pro';
    const REFRESH_MS = 30 * 1000;   // 30s polling (matches lqzone's approach)
    const FETCH_TIMEOUT_MS = 8000;
    const VERSION = '2.4.0';

    const CHAT_MODELS = {
        auto: 'grok-4-auto',
        fast: 'grok-3',
        expert: 'grok-4',
        heavy: 'grok-4-heavy',
    };

    const LANG = navigator.language.startsWith('zh') ? 'zh' : 'en';

    const L = {
        chatTitle: LANG === 'zh' ? '聊天配额 / Chat Quotas' : 'Chat Quotas',
        fast: LANG === 'zh' ? '快速 (Fast)' : 'Fast',
        expert: LANG === 'zh' ? '专家 (Expert)' : 'Expert',
        auto: LANG === 'zh' ? '自动 (Auto)' : 'Auto',
        heavy: LANG === 'zh' ? '重度 (Heavy)' : 'Heavy',
        usageTitle: LANG === 'zh' ? '使用量总限额 / Usage Limit' : 'Usage Total Limit',
        usageEmpty: LANG === 'zh' ? '暂无用量数据，可打开设置 → 用量 刷新' : 'No usage data — open Settings → Usage',
        lastUpdate: LANG === 'zh' ? '更新' : 'Updated',
        loading: LANG === 'zh' ? '加载中…' : 'Loading…',
        refreshFail: LANG === 'zh' ? '加载失败' : 'Load failed',
        guest: LANG === 'zh' ? '游客' : 'Guest',
        loggedIn: LANG === 'zh' ? '已登录' : 'Logged in',
        unlockHeavy: LANG === 'zh' ? '仅限 Heavy 订阅账户' : 'Heavy subscribers only',
        resetLabel: LANG === 'zh' ? '重置' : 'Resets',
        active: LANG === 'zh' ? '当前' : 'Active',
        countdown: LANG === 'zh' ? '冷却' : 'Cooldown',
    };

    const cfg = {
        get theme() { return localStorage.getItem('grokQuotaTheme') || 'dark'; },
        set theme(v) { localStorage.setItem('grokQuotaTheme', v); },
        get minimized() { return localStorage.getItem('grokQuotaMin') === '1'; },
        set minimized(v) { localStorage.setItem('grokQuotaMin', v ? '1' : '0'); },
    };

    // ─── State ───
    let cachedPointsUsage = null;
    let lastModelName = null;
    let lastRequestKind = 'DEFAULT';
    let refreshTimer = null;
    let pollInterval = null;
    let countdownTimers = {};   // { kind: intervalId }
    let domObserver = null;
    let queryBarObserver = null;
    let queryBarElement = null;

    // ─── fetch interceptor (usage/points only — rate limits now fetched via active polling) ───
    try {
        const __origFetch = window.fetch;
        window.fetch = async function (input, init) {
            const res = await __origFetch.apply(this, arguments);
            try {
                const urlStr = typeof input === 'string' ? input : (input && input.url) || (init && init.url) || '';
                if (typeof urlStr === 'string' && urlStr.includes('grok.com/rest')) {
                    const ct = (res.headers && res.headers.get) ? res.headers.get('content-type') || '' : '';
                    if (ct.includes('json')) {
                        const clone = res.clone();
                        const j = await clone.json().catch(() => null);
                        if (j) {
                            const jstr = JSON.stringify(j);
                            let m = jstr.match(/随\s*SuperGrok\s*附赠的免费积分[，,]?\s*(\d{1,3})%\s*已用\s*[·•]\s*在\s*([^重置\r\n]+?)\s*重置/i);
                            if (m) {
                                cachedPointsUsage = {
                                    percent: parseInt(m[1], 10),
                                    resetDate: m[2].trim(),
                                    raw: m[0],
                                    source: 'intercepted'
                                };
                            } else if (!cachedPointsUsage) {
                                const p = walkFindPercent(j, 0);
                                if (p != null) {
                                    cachedPointsUsage = {
                                        percent: Math.max(0, Math.min(100, Math.round(p))),
                                        resetDate: '',
                                        source: 'intercepted-fallback'
                                    };
                                }
                            }
                        }
                    } else {
                        const t = await res.clone().text().catch(() => '');
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
            } catch (e) { /* never break real fetch */ }
            return res;
        };
    } catch (e) { /* ignore */ }

    function walkFindPercent(o, d) {
        if (!o || typeof o !== 'object' || d > 5) return null;
        for (const k in o) {
            if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
            const v = o[k];
            if (typeof v === 'number' && v >= 0 && v <= 100 && /percent|used|usage|quota|积分/i.test(k)) return v;
            const sub = walkFindPercent(v, d + 1);
            if (sub != null) return sub;
        }
        return null;
    }

    // ─── Subscription detection ───
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

    // ─── Points usage ───
    function getPointsUsage() {
        if (cachedPointsUsage && typeof cachedPointsUsage.percent === 'number') {
            return cachedPointsUsage;
        }
        try {
            const bodyText = document.body.innerText || '';
            let m = bodyText.match(/随\s*SuperGrok\s*附赠的免费积分[，,]?\s*(\d{1,3})%\s*已用\s*[·•]\s*在\s*([^重置\r\n]+?)\s*重置/i);
            if (m) {
                const found = { percent: parseInt(m[1], 10), resetDate: m[2].trim(), raw: m[0] };
                cachedPointsUsage = found;
                return found;
            }
            m = bodyText.match(/SuperGrok.{0,40}?(\d{1,3})%\s*已用.{0,10}?[·•]\s*在\s*(.+?)\s*重置/i);
            if (m) {
                const found = { percent: parseInt(m[1], 10), resetDate: m[2].trim() };
                cachedPointsUsage = found;
                return found;
            }
            m = bodyText.match(/Free points?\s*(?:included with|bundled with|for)\s*SuperGrok[,.]?\s*(\d{1,3})%\s*(?:used|used up).{0,10}?[·•]?\s*(?:Resets?|Reset)\s*(?:on\s+)?([^\n\r]+)/i);
            if (m) {
                const found = { percent: parseInt(m[1], 10), resetDate: m[2].trim(), raw: m[0] };
                cachedPointsUsage = found;
                return found;
            }
            const lines = bodyText.split(/[\r\n]+/);
            for (let line of lines) {
                if (/SuperGrok/i.test(line) && /%/.test(line) && /(已用|used|reset|重置)/i.test(line)) {
                    const pm = line.match(/(\d{1,3})%/);
                    if (pm) {
                        const rm = line.match(/(?:重置|reset|Resets?).{0,40}/i);
                        const found = {
                            percent: parseInt(pm[1], 10),
                            resetDate: rm ? rm[0].replace(/^(?:重置|reset|Resets?)\s*(?:on\s*)?/i, '').trim() : '',
                            raw: line.trim()
                        };
                        cachedPointsUsage = found;
                        return found;
                    }
                }
            }
        } catch {}
        return null;
    }

    // ─── Subscription usage API ───
    function deepSearchString(obj, regex, maxDepth) {
        if (maxDepth === undefined) maxDepth = 6;
        const seen = new WeakSet();
        const walk = (o, d) => {
            if (!o || typeof o !== 'object' || d > maxDepth || seen.has(o)) return null;
            seen.add(o);
            for (const k in o) {
                if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
                const v = o[k];
                if (typeof v === 'string') { const rm = v.match(regex); if (rm) return rm; }
                else if (typeof v === 'object') { const r = walk(v, d + 1); if (r) return r; }
            }
            return null;
        };
        return walk(obj, 0);
    }

    function deepFindPercent(obj) {
        const walk = (o, d) => {
            if (!o || typeof o !== 'object' || d > 5) return null;
            for (const k in o) {
                if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
                const v = o[k];
                if (typeof v === 'number' && v >= 0 && v <= 100 && /percent|used|usage|quota/i.test(k)) return v;
                if (typeof v === 'object') { const r = walk(v, d + 1); if (r != null) return r; }
            }
            return null;
        };
        return walk(obj, 0);
    }

    function deepFindResetDate(obj) {
        const walk = (o, d) => {
            if (!o || typeof o !== 'object' || d > 5) return null;
            for (const k in o) {
                if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
                const v = o[k];
                if (/reset|renew|expire|billing|next|date/i.test(k)) {
                    if (typeof v === 'string' && v.length > 3) return v;
                    if (v && typeof v === 'object' && v.date) return v.date;
                }
                if (typeof v === 'object') { const r = walk(v, d + 1); if (r) return r; }
            }
            return null;
        };
        return walk(obj, 0);
    }

    function parseUsageJson(data) {
        if (!data) return null;
        try {
            const fullMatch = deepSearchString(data, /随\s*SuperGrok\s*附赠的免费积分[，,]?\s*(\d{1,3})%\s*已用\s*[·•]\s*在\s*([^重置\r\n]+?)\s*重置/i);
            if (fullMatch) {
                return { percent: parseInt(fullMatch[1], 10), resetDate: fullMatch[2].trim(), raw: fullMatch[0], source: 'api' };
            }
            const candidates = Array.isArray(data) ? data : [data, data.subscription, data.usage, data.quota, data.credits, ...(Array.isArray(data.subscriptions) ? data.subscriptions : [])];
            for (let item of candidates) {
                if (!item || typeof item !== 'object') continue;
                let pct = null;
                if (typeof item.percentUsed === 'number') pct = item.percentUsed;
                else if (typeof item.usagePercent === 'number') pct = item.usagePercent;
                else if (typeof item.percent === 'number' && item.percent <= 100) pct = item.percent;
                else if (item.usage && typeof item.usage.percent === 'number') pct = item.usage.percent;
                else if (item.points && typeof item.points.percent === 'number') pct = item.points.percent;
                else if (item.freePoints && typeof item.freePoints.usedPercent === 'number') pct = item.freePoints.usedPercent;
                if (pct == null) pct = deepFindPercent(item);
                const reset = deepFindResetDate(item);
                if (pct != null) {
                    return {
                        percent: Math.max(0, Math.min(100, Math.round(pct))),
                        resetDate: (reset && typeof reset === 'string') ? reset.replace(/T.*|Z$/g, '').trim() : '',
                        source: 'api'
                    };
                }
            }
        } catch {}
        return null;
    }

    async function fetchWithTimeout(url, options, timeoutMs) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, { ...options, signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }
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
        ];
        const fetchPromises = endpoints.map(ep =>
            fetchWithTimeout(ep.url, {
                method: ep.method,
                headers: { 'Content-Type': 'application/json' },
                body: ep.body || undefined,
                credentials: 'include'
            }, FETCH_TIMEOUT_MS)
                .then(async (res) => {
                    if (res.ok) {
                        const json = await res.json();
                        const parsed = parseUsageJson(json);
                        if (parsed && typeof parsed.percent === 'number') return parsed;
                    }
                    throw new Error('no data');
                })
                .catch(() => null)
        );
        const results = await Promise.allSettled(fetchPromises);
        for (const r of results) {
            if (r.status === 'fulfilled' && r.value) {
                cachedPointsUsage = r.value;
                return r.value;
            }
        }
        return null;
    }

    // ─── Rate limit API ───
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

    function getRateLimitWaitTime(rateLimit) {
        if (!rateLimit) return 0;
        const direct = rateLimit.waitTimeSeconds
            ?? rateLimit.resetAfterSeconds
            ?? rateLimit.retryAfterSeconds
            ?? rateLimit.windowSizeSeconds
            ?? rateLimit.secondsUntilReset
            ?? rateLimit.timeUntilResetSeconds;
        if (Number.isFinite(direct) && direct > 0) return direct;
        return 0;
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
                waitTimeSeconds: getRateLimitWaitTime(info),
            };
        };
        const high = pick(data.highEffortRateLimits);
        const low = pick(data.lowEffortRateLimits);
        if (high && low) {
            return {
                remainingQueries: high.remainingQueries,
                totalQueries: high.totalQueries,
                waitTimeSeconds: high.waitTimeSeconds,
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

    /**
     * Fetch rate limit for a specific model+requestKind.
     * This is the core fetch — used by polling and event-driven refresh.
     */
    async function fetchRateLimit(modelName, requestKind) {
        try {
            const res = await fetchWithTimeout('https://grok.com/rest/rate-limits', {
                method: 'POST',
                headers: apiHeaders(),
                body: JSON.stringify({ modelName, requestKind }),
                credentials: 'include',
            }, FETCH_TIMEOUT_MS);
            if (!res.ok) return null;
            const raw = await res.json();
            return normalizeRateLimitResponse(raw);
        } catch {
            return null;
        }
    }

    /**
     * Fetch quotas for ALL display categories.
     * Uses model detection for the current model, falls back to generic names.
     */
    async function fetchAllQuotas(sub) {
        const queryBar = getQueryBar();
        const detectedModel = getCurrentModelName(queryBar);
        const requestKind = detectRequestKind(queryBar, detectedModel);
        const activeCategory = MODEL_TO_CATEGORY[detectedModel] || 'expert';

        // Track changes for logging
        lastModelName = detectedModel;
        lastRequestKind = requestKind;

        const chat = {};
        const tasks = [];

        // Build the list of model names to query
        const queries = [
            { kind: 'auto', modelName: CHAT_MODELS.auto, rk: 'DEFAULT' },
            { kind: 'fast', modelName: CHAT_MODELS.fast, rk: 'DEFAULT' },
            { kind: 'expert', modelName: CHAT_MODELS.expert, rk: 'DEFAULT' },
        ];
        if (sub && sub.canUseHeavy) {
            queries.push({ kind: 'heavy', modelName: CHAT_MODELS.heavy, rk: 'DEFAULT' });
        }

        for (const q of queries) {
            // If this query matches the currently-selected model, use the detected modelName + requestKind
            const isActiveModel = (q.kind === activeCategory);
            const fnModelName = isActiveModel ? detectedModel : q.modelName;
            const fnRequestKind = isActiveModel ? requestKind : q.rk;

            tasks.push(
                fetchRateLimit(fnModelName, fnRequestKind).then(result => {
                    const parsed = result || { error: true };
                    chat[q.kind] = parsed;
                    // Store active-model flag for UI highlighting
                    if (isActiveModel) chat[q.kind]._isActive = true;
                    // grok-4-auto has a separate low-effort 50-query limit; swap primary display
                    if (q.kind === 'auto' && parsed && typeof parsed.lowRemaining === 'number') {
                        chat[q.kind]._autoMode = true;
                    }
                })
            );
        }

        await Promise.all(tasks);
        return { chat, timestamp: Date.now(), sub, activeModel: detectedModel, activeRequestKind: requestKind };
    }

    // ─── UI builders ───
    function buildUsageSection(usage) {
        let html = `<div class="gqp-section"><div class="gqp-sec-title">${L.usageTitle}</div>`;
        if (!usage || typeof usage.percent !== 'number') {
            return html + `<div class="gqp-hint" style="padding:4px 2px">${L.usageEmpty}</div></div>`;
        }
        const pct = usage.percent;
        const cls = pct >= 90 ? 'c-danger' : pct >= 70 ? 'c-warn' : 'c-ok';
        const usedLabel = LANG === 'zh' ? '已用' : 'used';
        html += `<div class="gqp-row gqp-usage-row" style="flex-direction:column;align-items:stretch;padding:6px 10px;">`;
        html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">`;
        html += `<span class="gqp-name">${LANG === 'zh' ? '免费积分' : 'Free points'}</span>`;
        html += `<span class="gqp-val ${cls}" style="font-size:13px;font-weight:700;">${pct}% ${usedLabel}</span>`;
        html += `</div>`;
        html += `<div class="gqp-progress"><div class="gqp-bar ${cls}" style="width:${pct}%"></div></div>`;
        if (usage.resetDate) {
            html += `<div class="gqp-usage-text" style="margin-top:3px;font-size:10.5px;color:var(--hint);">${L.resetLabel}: ${usage.resetDate}</div>`;
        }
        html += `</div></div>`;
        return html;
    }

    function formatTimer(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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

    function buildQuotaRow(label, info, hint, isActive) {
        if (hint) {
            return `<div class="gqp-row"><span class="gqp-name">${label}</span><span class="gqp-hint">${hint}</span></div>`;
        }
        if (!info || info.error) {
            return `<div class="gqp-row"><span class="gqp-name">${label}</span><span class="gqp-val c-danger">${L.refreshFail}</span></div>`;
        }

        const isAuto = !!(info._autoMode);
        // Auto mode: primary = lowRemaining (the 50-query Auto-specific limit), secondary = highRemaining
        const primaryRem = isAuto ? (info.lowRemaining ?? info.remainingQueries ?? 'N/A') : (info.remainingQueries ?? info.remaining ?? 'N/A');
        const primaryTotal = isAuto ? (info.lowTotal ?? info.totalQueries ?? null) : (info.totalQueries ?? info.total ?? null);
        const waitSec = info.waitTimeSeconds || 0;
        const cls = valClass(primaryRem, primaryTotal);
        const tot = primaryTotal != null ? `<span class="gqp-total">/ ${primaryTotal}</span>` : '';

        // Countdown display when remaining is 0
        let valHtml;
        const dataAttr = isActive ? ' data-gqp-active="1"' : '';
        if (typeof primaryRem === 'number' && primaryRem <= 0 && waitSec > 0) {
            const labelKind = label === L.fast ? 'fast' : label === L.expert ? 'expert' : label === L.auto ? 'auto' : 'heavy';
            valHtml = `<span class="gqp-val c-danger gqp-countdown" data-gqp-kind="${labelKind}" data-gqp-wait="${waitSec}">${formatTimer(waitSec)}</span>`;
        } else {
            valHtml = `<span class="gqp-val ${cls}">${primaryRem}</span>`;
        }

        // Secondary row: for Auto mode show high effort count; for others show low effort count
        let extra = '';
        if (isAuto) {
            // Auto mode: secondary shows high effort
            const highRem = info.remainingQueries ?? 'N/A';
            const highTot = info.totalQueries != null ? ` / ${info.totalQueries}` : '';
            const highLabel = LANG === 'zh' ? '高消耗' : 'High';
            extra = `<div class="gqp-usage-text" style="margin-top:2px;font-size:10px;color:var(--hint);">${highLabel}: ${highRem}${highTot}</div>`;
        } else if (typeof info.lowRemaining === 'number') {
            const lowTot = info.lowTotal != null ? ` / ${info.lowTotal}` : '';
            extra = `<div class="gqp-usage-text" style="margin-top:2px;font-size:10px;color:var(--hint);">${LANG === 'zh' ? '低消耗' : 'Low'}: ${info.lowRemaining}${lowTot}</div>`;
        }

        const activeDot = isActive ? '<span class="gqp-active-dot" title="' + L.active + '"></span>' : '';
        return `<div class="gqp-row${isActive ? ' gqp-row-active' : ''}" style="flex-direction:column;align-items:stretch;"${dataAttr}><div style="display:flex;justify-content:space-between;align-items:center;"><span class="gqp-name">${activeDot}${label}</span><span class="gqp-num">${valHtml}${tot}</span></div>${extra}</div>`;
    }

    function buildChatSection(chat, sub) {
        chat = chat || {};
        const s = sub || { canUseHeavy: false };
        let html = `<div class="gqp-section"><div class="gqp-sec-title">${L.chatTitle}</div>`;
        html += buildQuotaRow(L.auto, chat.auto, null, !!(chat.auto && chat.auto._isActive));
        html += buildQuotaRow(L.fast, chat.fast, null, !!(chat.fast && chat.fast._isActive));
        html += buildQuotaRow(L.expert, chat.expert, null, !!(chat.expert && chat.expert._isActive));
        html += s.canUseHeavy
            ? buildQuotaRow(L.heavy, chat.heavy, null, !!(chat.heavy && chat.heavy._isActive))
            : buildQuotaRow(L.heavy, null, L.unlockHeavy, false);
        return html + '</div>';
    }

    // ─── Panel management ───
    function getPanel() {
        return document.getElementById(PANEL_ID);
    }

    function applyTheme() {
        const p = getPanel();
        if (!p) return;
        p.classList.toggle('light', cfg.theme === 'light');
        const btn = p.querySelector('#gqp-theme');
        if (btn) btn.textContent = cfg.theme === 'light' ? '\uD83C\uDF19' : '\u2600\uFE0F';
    }

    function applyMinimized() {
        const p = getPanel();
        if (!p) return;
        const body = p.querySelector('.pbody');
        if (body) body.style.display = cfg.minimized ? 'none' : '';
        const btn = p.querySelector('#gqp-min');
        if (btn) btn.textContent = cfg.minimized ? '+' : '\u2212';
    }

    function updateBadge(sub) {
        const el = getPanel()?.querySelector('.badge');
        if (el) {
            el.style.background = sub.color;
            el.textContent = sub.tier;
        }
    }

    function startCountdowns() {
        // Clear any existing countdown timers
        for (const k in countdownTimers) {
            clearInterval(countdownTimers[k]);
        }
        countdownTimers = {};

        const panel = getPanel();
        if (!panel) return;

        const countdownEls = panel.querySelectorAll('.gqp-countdown');
        countdownEls.forEach(el => {
            const kind = el.dataset.gqpKind;
            if (!kind || countdownTimers[kind]) return;

            let remaining = parseInt(el.dataset.gqpWait, 10) || 0;
            if (remaining <= 0) return;

            countdownTimers[kind] = setInterval(() => {
                remaining--;
                if (remaining <= 0) {
                    clearInterval(countdownTimers[kind]);
                    delete countdownTimers[kind];
                    // Trigger immediate refresh when countdown expires
                    if (getPanel() && document.visibilityState === 'visible') {
                        refreshData();
                    }
                } else {
                    el.textContent = formatTimer(remaining);
                }
            }, 1000);
        });
    }

    function updateContent(data) {
        const p = getPanel();
        if (!p) return;
        const body = p.querySelector('.pbody');
        const usage = (data && data.usage) ? data.usage : getPointsUsage();
        if (body) body.innerHTML = buildUsageSection(usage) + buildChatSection(data ? data.chat : null, data ? data.sub : null);

        // Start countdowns for any models at 0 quota
        startCountdowns();

        const footer = p.querySelector('.pfooter');
        const ts = (data && data.timestamp) ? new Date(data.timestamp).toLocaleTimeString(LANG === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' }) : '--';
        if (footer) footer.innerHTML = `<span>${L.lastUpdate}: ${ts}</span><span class="fver">v${VERSION}</span>`;
    }

    // ─── Core refresh ───
    async function refreshData() {
        const p = getPanel();
        if (!p) return;
        const body = p.querySelector('.pbody');
        if (body) body.innerHTML = `<div class="loading">${L.loading}</div>`;
        try {
            const sub = detectSubscription();
            updateBadge(sub);
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

    // ─── Polling & event management ───
    function startPolling() {
        stopPolling();
        pollInterval = setInterval(() => {
            if (document.visibilityState === 'visible' && getPanel()) {
                refreshData();
            }
        }, REFRESH_MS);
    }

    function stopPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }

    // ─── Query bar observer — detects model changes and submit events ───
    function setupQueryBarObserver() {
        if (queryBarObserver) queryBarObserver.disconnect();

        const qb = getQueryBar();
        if (!qb) return;

        queryBarElement = qb;

        const debouncedModelCheck = debounce(() => {
            const newModel = getCurrentModelName(qb);
            if (newModel !== lastModelName) {
                // Model changed — immediate refresh
                refreshData();
            }
        }, 300);

        queryBarObserver = new MutationObserver((mutations) => {
            // Check if model might have changed
            for (const mut of mutations) {
                if (mut.type === 'childList' || mut.type === 'characterData' ||
                    (mut.type === 'attributes' && (mut.attributeName === 'aria-label' || mut.attributeName === 'aria-pressed'))) {
                    debouncedModelCheck();
                    break;
                }
            }
        });
        queryBarObserver.observe(qb, { childList: true, subtree: true, attributes: true, characterData: true });

        // Submit detection
        const inputEl = qb.querySelector('div[contenteditable="true"]');
        if (inputEl) {
            inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    // Wait 3s for rate limit to update after submission
                    setTimeout(() => refreshData(), 3000);
                }
            });
        }

        // Submit button click detection
        const bottomBar = qb.querySelector('div.absolute.inset-x-0.bottom-0');
        const submitBtn = bottomBar
            ? Array.from(bottomBar.querySelectorAll('button')).find(b => {
                const svg = b.querySelector('svg');
                if (!svg) return false;
                const path = svg.querySelector('path');
                return path && (path.getAttribute('d') || '').includes('M6 11L12 5');
              })
            : null;

        if (submitBtn) {
            submitBtn.addEventListener('click', () => {
                setTimeout(() => refreshData(), 3000);
            });
        }
    }

    // ─── DOM observer — detect query bar appearance/disappearance ───
    function setupDomObserver() {
        if (domObserver) return;

        domObserver = new MutationObserver(() => {
            const qb = getQueryBar();
            if (qb && qb !== queryBarElement) {
                // New query bar appeared
                queryBarElement = qb;
                setupQueryBarObserver();
                refreshData();
                startPolling();
            } else if (!qb && queryBarElement) {
                // Query bar removed
                queryBarElement = null;
                if (queryBarObserver) { queryBarObserver.disconnect(); queryBarObserver = null; }
                stopPolling();
            }
        });
        domObserver.observe(document.body, { childList: true, subtree: true });
    }

    function debounce(func, delay) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), delay);
        };
    }

    // ─── Visibility change — pause/resume polling ───
    function setupVisibilityHandler() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && getPanel()) {
                refreshData();    // immediate refresh on return
                startPolling();   // resume polling
            } else {
                stopPolling();    // pause when hidden
            }
        });
    }

    // ─── Drag ───
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

    // ─── Panel creation ───
    function createPanel() {
        if (getPanel()) return;
        const sub = detectSubscription();
        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML = `
            <div class="pheader">
                <span class="badge" style="background:${sub.color}">${sub.tier}</span>
                <div class="hbtns">
                    <button id="gqp-refresh">\u27F3</button>
                    <button id="gqp-theme">\u2600\uFE0F</button>
                    <button id="gqp-min">\u2212</button>
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
    }

    // ─── Init ───
    function init() {
        if (getPanel()) return;
        createPanel();

        // Initial query bar check
        const qb = getQueryBar();
        if (qb) {
            queryBarElement = qb;
            setupQueryBarObserver();
            startPolling();
        }

        setupDomObserver();
        setupVisibilityHandler();
        refreshData();
    }

    // ─── Styles ───
    GM_addStyle(`
        #${PANEL_ID}{--bg:#18181b;--bg2:#1c1c1f;--bg3:#27272a;--border:#3f3f46;--text:#e4e4e7;--sub:#a1a1aa;--hint:#71717a;--ok:#a3e635;--warn:#fb923c;--danger:#f87171;--active:#60a5fa;position:fixed;bottom:16px;right:16px;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;font-size:12.5px;min-width:260px;max-width:300px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,0.12);overflow:hidden;user-select:none}
        #${PANEL_ID}.light{--bg:#fff;--bg2:#fafafa;--bg3:#f4f4f5;--border:#e4e4e7;--text:#18181b;--sub:#52525b;--hint:#a1a1aa;--ok:#16a34a;--warn:#ea580c;--danger:#dc2626;--active:#2563eb}
        #${PANEL_ID} .pheader{display:flex;align-items:center;justify-content:space-between;padding:9px 12px 8px;background:var(--bg2);border-bottom:1px solid var(--border)}
        #${PANEL_ID} .badge{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;font-size:11.5px;font-weight:600;color:#fff;opacity:.92}
        #${PANEL_ID} .hbtns{display:flex;gap:2px}
        #${PANEL_ID} button{background:transparent;color:var(--sub);border:none;padding:3px 7px;border-radius:6px;font-size:13px;cursor:pointer}
        #${PANEL_ID} button:hover{background:var(--bg3);color:var(--text)}
        #${PANEL_ID} .pbody{padding:10px 12px 6px}
        #${PANEL_ID} .loading{padding:10px 2px;color:var(--hint);font-size:12.5px}
        .gqp-section{margin-bottom:8px}
        .gqp-sec-title{font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--hint);margin-bottom:5px;padding-left:1px}
        .gqp-row{display:flex;justify-content:space-between;align-items:center;padding:6px 10px;margin-bottom:3px;background:var(--bg3);border-radius:8px;transition:background .2s}
        .gqp-row.gqp-row-active{background:var(--bg2);border:1px solid var(--active);padding:5px 9px}
        .gqp-name{font-size:12.5px;font-weight:500;color:var(--sub)}
        .gqp-num{display:flex;align-items:baseline;gap:4px}
        .gqp-val{font-family:ui-monospace,SF Mono,Menlo,Consolas,monospace;font-size:14px;font-weight:700;line-height:1}
        .gqp-val.c-ok{color:var(--ok)}.gqp-val.c-warn{color:var(--warn)}.gqp-val.c-danger{color:var(--danger)}
        .gqp-total{font-size:10.5px;color:var(--hint);font-family:ui-monospace,Menlo,monospace}
        .gqp-hint{font-size:10.5px;color:var(--hint);font-style:italic}
        .gqp-active-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--active);margin-right:5px;vertical-align:middle;flex-shrink:0;animation:gqp-pulse 2s ease-in-out infinite}
        @keyframes gqp-pulse{0%,100%{opacity:1}50%{opacity:.4}}
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
        .gqp-countdown{font-variant-numeric:tabular-nums}
    `);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
