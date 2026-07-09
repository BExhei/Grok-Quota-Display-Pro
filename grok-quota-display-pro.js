// ==UserScript==
// @name Grok Quota Display Pro
// @namespace https://github.com/BExhei/Grok-Quota-Display-Pro
// @version 2.5.0
// @description Grok quota monitor — weekly usage + current model indicator; silent refresh, no flash
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
    const WEEKLY_REFRESH_MS = 5 * 60 * 1000; // 5 min for weekly credits API
    const MODEL_POLL_MS = 1500;              // light local model-chip sync (no network)
    const FETCH_TIMEOUT_MS = 8000;
    const VERSION = '2.5.0';

    const LANG = navigator.language.startsWith('zh') ? 'zh' : 'en';

    // Weekly product breakdown (same mapping as Grok Rate Limit Display)
    const PRODUCT_NAMES = {
        0: LANG === 'zh' ? '第三方' : '3rd Party',
        1: 'API',
        2: 'Grok Build',
        3: LANG === 'zh' ? '插件' : 'Grok Plugins',
        4: LANG === 'zh' ? '聊天' : 'Chat',
        5: 'Imagine',
        6: LANG === 'zh' ? '语音' : 'Voice',
    };
    const PRODUCT_COLORS = {
        0: '#6b7280', 1: '#3b82f6', 2: '#10b981', 3: '#f59e0b',
        4: '#06b6d4', 5: '#a855f7', 6: '#ec4899',
    };

    const MODEL_CHIPS = [
        { kind: 'auto', short: LANG === 'zh' ? '自动' : 'Auto' },
        { kind: 'fast', short: LANG === 'zh' ? '快速' : 'Fast' },
        { kind: 'expert', short: LANG === 'zh' ? '专家' : 'Expert' },
        { kind: 'heavy', short: LANG === 'zh' ? '重度' : 'Heavy' },
    ];

    const L = {
        modelTitle: LANG === 'zh' ? '当前模型' : 'Current model',
        fast: LANG === 'zh' ? '快速' : 'Fast',
        expert: LANG === 'zh' ? '专家' : 'Expert',
        auto: LANG === 'zh' ? '自动' : 'Auto',
        heavy: LANG === 'zh' ? '重度' : 'Heavy',
        usageTitle: LANG === 'zh' ? '每周用量' : 'Weekly usage',
        usageEmpty: LANG === 'zh' ? '暂无周用量数据（需 SuperGrok）' : 'No weekly usage (SuperGrok required)',
        usedLabel: LANG === 'zh' ? '已用' : 'used',
        remainLabel: LANG === 'zh' ? '剩余' : 'left',
        lastUpdate: LANG === 'zh' ? '更新' : 'Updated',
        loading: LANG === 'zh' ? '加载中…' : 'Loading…',
        refreshFail: LANG === 'zh' ? '加载失败' : 'Load failed',
        guest: LANG === 'zh' ? '游客' : 'Guest',
        loggedIn: LANG === 'zh' ? '已登录' : 'Logged in',
        unlockHeavy: LANG === 'zh' ? '需 Heavy' : 'Heavy only',
        resetLabel: LANG === 'zh' ? '重置' : 'Resets',
        active: LANG === 'zh' ? '当前' : 'Active',
        noProducts: LANG === 'zh' ? '暂无分类明细' : 'No category breakdown',
        think: LANG === 'zh' ? '思考' : 'Think',
        deepSearch: 'DeepSearch',
        deeperSearch: 'DeeperSearch',
        unknownModel: LANG === 'zh' ? '未知' : 'Unknown',
    };

    const cfg = {
        get theme() { return localStorage.getItem('grokQuotaTheme') || 'dark'; },
        set theme(v) { localStorage.setItem('grokQuotaTheme', v); },
        get minimized() { return localStorage.getItem('grokQuotaMin') === '1'; },
        set minimized(v) { localStorage.setItem('grokQuotaMin', v ? '1' : '0'); },
    };

    // ─── State ───
    let cachedWeeklyUsage = null;   // { usagePercent, productUsage, currentPeriod, source }
    let lastWeeklyFetchAt = 0;
    let lastUiUsage = null;         // normalized weekly for UI
    let lastSub = null;
    let lastModelName = null;
    let lastRequestKind = 'DEFAULT';
    let lastActiveCategory = null;
    let hasRenderedContent = false;
    let isRefreshing = false;
    let pollInterval = null;
    let modelPollInterval = null;
    let domObserver = null;
    let queryBarObserver = null;
    let queryBarElement = null;

    // ─── Weekly usage: GetGrokCreditsConfig (protobuf / grpc-web) ───
    // Ported from working Grok Rate Limit Display (2.js) for SuperGrok weekly reset system.
    function decodeVarint(buf, offset) {
        let result = 0;
        let shift = 0;
        let pos = offset;
        while (pos < buf.length) {
            const byte = buf[pos++];
            result |= (byte & 0x7f) << shift;
            if ((byte & 0x80) === 0) break;
            shift += 7;
        }
        return { value: result, next: pos };
    }

    function parseProtobufTimestamp(buf, offset, length) {
        const end = offset + length;
        let pos = offset;
        let seconds = 0;
        let nanos = 0;
        while (pos < end) {
            const tag = buf[pos++];
            const field = tag >> 3;
            const wire = tag & 0x07;
            if (wire === 0) {
                const decoded = decodeVarint(buf, pos);
                pos = decoded.next;
                if (field === 1) seconds = decoded.value;
                else if (field === 2) nanos = decoded.value;
            } else {
                break;
            }
        }
        if (!seconds) return null;
        return new Date(seconds * 1000 + nanos / 1e6).toISOString();
    }

    function parseGrpcWebCreditsConfig(buffer) {
        const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        if (buf.length < 10) return null;

        let usagePercent = null;
        const productUsage = [];
        let periodStart = null;
        let periodEnd = null;

        for (let i = 0; i < buf.length - 5; i++) {
            if (buf[i] === 0x0d) {
                const view = new DataView(buf.buffer, buf.byteOffset + i + 1, 4);
                const val = Math.round(view.getFloat32(0, true));
                if (val >= 0 && val <= 100) usagePercent = val;
                break;
            }
        }

        for (let i = 0; i < buf.length - 7; i++) {
            if (buf[i] === 0x3a && buf[i + 1] === 0x07 && buf[i + 2] === 0x08) {
                const product = buf[i + 3];
                if (buf[i + 4] === 0x15) {
                    const view = new DataView(buf.buffer, buf.byteOffset + i + 5, 4);
                    const pct = Math.round(view.getFloat32(0, true));
                    if (pct >= 0 && pct <= 100) {
                        productUsage.push({ product, usagePercent: pct });
                    }
                }
            }
        }

        for (let i = 0; i < buf.length - 4; i++) {
            if (buf[i] === 0x42 && buf[i + 1] > 0 && buf[i + 1] < 40) {
                const blockLen = buf[i + 1];
                const blockStart = i + 2;
                const blockEnd = blockStart + blockLen;
                if (blockEnd > buf.length) continue;
                let pos = blockStart;
                while (pos < blockEnd - 1) {
                    const tag = buf[pos++];
                    const field = tag >> 3;
                    const wire = tag & 0x07;
                    if (wire === 2) {
                        const len = buf[pos++];
                        if (field === 2 && !periodStart) {
                            periodStart = parseProtobufTimestamp(buf, pos, len);
                        } else if (field === 3 && !periodEnd) {
                            periodEnd = parseProtobufTimestamp(buf, pos, len);
                        }
                        pos += len;
                    } else if (wire === 0) {
                        const decoded = decodeVarint(buf, pos);
                        pos = decoded.next;
                    } else {
                        break;
                    }
                }
                if (periodStart || periodEnd) break;
            }
        }

        if (usagePercent === null && productUsage.length === 0) {
            if (periodStart || periodEnd) {
                return {
                    usagePercent: 0,
                    currentPeriod: { type: 'weekly', start: periodStart, end: periodEnd },
                    productUsage: [],
                };
            }
            return null;
        }

        return {
            usagePercent: usagePercent ?? 0,
            currentPeriod: { type: 'weekly', start: periodStart, end: periodEnd },
            productUsage,
        };
    }

    async function fetchGrokCreditsConfig() {
        const url = window.location.origin + '/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig';
        const res = await fetchWithTimeout(url, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'content-type': 'application/grpc-web+proto',
                'connect-protocol-version': '1',
                'x-grpc-web': '1',
            },
            body: new Uint8Array([0, 0, 0, 0, 0]),
        }, FETCH_TIMEOUT_MS);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return parseGrpcWebCreditsConfig(await res.arrayBuffer());
    }

    function formatPeriodReset(isoOrText) {
        if (!isoOrText) return '';
        const d = new Date(isoOrText);
        if (!Number.isNaN(d.getTime())) {
            return d.toLocaleString(LANG === 'zh' ? 'zh-CN' : undefined, {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
            });
        }
        return String(isoOrText);
    }

    // Optional: intercept native GetGrokCreditsConfig responses while browsing
    try {
        const __origFetch = window.fetch;
        window.fetch = async function (input, init) {
            const res = await __origFetch.apply(this, arguments);
            try {
                const urlStr = typeof input === 'string' ? input : (input && input.url) || '';
                if (typeof urlStr === 'string' && urlStr.includes('GetGrokCreditsConfig')) {
                    const buf = await res.clone().arrayBuffer().catch(() => null);
                    if (buf) {
                        const parsed = parseGrpcWebCreditsConfig(buf);
                        if (parsed && typeof parsed.usagePercent === 'number') {
                            cachedWeeklyUsage = { ...parsed, source: 'intercepted' };
                            lastWeeklyFetchAt = Date.now();
                            // Quietly paint new weekly numbers if panel already shown
                            if (hasRenderedContent && getPanel()) {
                                const usage = normalizeWeeklyForUi(cachedWeeklyUsage);
                                const sub = detectSubscription();
                                updateBadge(sub);
                                updateContent({ usage, sub, snap: getModelSnapshot(), timestamp: Date.now(), silent: true });
                            }
                        }
                    }
                }
            } catch (e) { /* never break real fetch */ }
            return res;
        };
    } catch (e) { /* ignore */ }

    // ─── Subscription detection ───
    function detectSubscription() {
        try {
            // If weekly credits API already returned data, treat as SuperGrok-tier
            if (cachedWeeklyUsage && typeof cachedWeeklyUsage.usagePercent === 'number') {
                const fullText = (document.body?.innerText || '').toLowerCase();
                const headerEl = document.querySelector('header, nav, [class*="header"], [data-testid*="top"]');
                const headerText = headerEl ? headerEl.innerText.toLowerCase() : '';
                const isHeavy = headerText.includes('supergrok heavy') || headerText.includes('grok heavy')
                    || (fullText.includes('supergrok heavy') && headerText.includes('heavy'));
                if (isHeavy) return { tier: 'SuperGrok Heavy', color: '#b45309', canUseHeavy: true };
                return { tier: 'SuperGrok', color: '#047857', canUseHeavy: false };
            }
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

    // ─── Weekly usage fetch ───
    async function fetchWithTimeout(url, options, timeoutMs) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, { ...options, signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * Fetch SuperGrok weekly usage via GetGrokCreditsConfig.
     * Falls back to cache when within WEEKLY_REFRESH_MS.
     * force=true always re-fetches (manual refresh button).
     */
    async function fetchWeeklyUsage(force) {
        const now = Date.now();
        if (!force && cachedWeeklyUsage && typeof cachedWeeklyUsage.usagePercent === 'number'
            && (now - lastWeeklyFetchAt) < WEEKLY_REFRESH_MS) {
            return cachedWeeklyUsage;
        }
        try {
            const parsed = await fetchGrokCreditsConfig();
            if (parsed && typeof parsed.usagePercent === 'number') {
                cachedWeeklyUsage = { ...parsed, source: 'api' };
                lastWeeklyFetchAt = now;
                return cachedWeeklyUsage;
            }
        } catch (e) {
            console.warn('[GrokQuotaPro] weekly usage fetch failed:', e);
        }
        // Return stale cache if available
        if (cachedWeeklyUsage && typeof cachedWeeklyUsage.usagePercent === 'number') {
            return cachedWeeklyUsage;
        }
        return null;
    }

    /** Normalize weekly usage for UI (percent + reset date string + products). */
    function normalizeWeeklyForUi(usage) {
        if (!usage || typeof usage.usagePercent !== 'number') return null;
        const pct = Math.max(0, Math.min(100, Math.round(usage.usagePercent)));
        const resetIso = usage.currentPeriod?.end || '';
        return {
            percent: pct,
            remaining: Math.max(0, 100 - pct),
            resetDate: formatPeriodReset(resetIso),
            resetIso,
            productUsage: Array.isArray(usage.productUsage) ? usage.productUsage : [],
            source: usage.source || 'api',
        };
    }

    // ─── Model detection snapshot (local only, no network) ───
    function getModelSnapshot() {
        const queryBar = getQueryBar();
        const modelName = getCurrentModelName(queryBar);
        const requestKind = detectRequestKind(queryBar, modelName);
        const category = MODEL_TO_CATEGORY[modelName] || 'expert';
        return { modelName, requestKind, category };
    }

    function requestKindLabel(rk) {
        if (rk === 'REASONING') return L.think;
        if (rk === 'DEEPSEARCH') return L.deepSearch;
        if (rk === 'DEEPERSEARCH') return L.deeperSearch;
        return '';
    }

    function friendlyModelLabel(modelName) {
        const map = {
            'grok-4-auto': LANG === 'zh' ? '自动' : 'Auto',
            'grok-3': LANG === 'zh' ? '快速' : 'Fast',
            'grok-4': LANG === 'zh' ? '专家' : 'Expert',
            'grok-4-heavy': LANG === 'zh' ? '重度' : 'Heavy',
            'grok-420': 'Grok 4.20',
            'grok-420-computer-use-sa': 'Grok 4.3',
            'grok-4-mini-thinking-tahoe': 'Grok 4 Fast',
            'grok-4-1-non-thinking-w-tool': 'Grok 4.1',
            'grok-4-1-thinking-1129': 'Grok 4.1 Think',
        };
        return map[modelName] || modelName || L.unknownModel;
    }

    function formatResetRemaining(resetIso) {
        if (!resetIso) return '';
        const end = new Date(resetIso).getTime();
        if (!Number.isFinite(end)) return '';
        let sec = Math.max(0, Math.floor((end - Date.now()) / 1000));
        if (sec <= 0) return LANG === 'zh' ? '即将重置' : 'Resetting soon';
        const d = Math.floor(sec / 86400);
        sec %= 86400;
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        if (d > 0) return LANG === 'zh' ? `${d}天${h}小时后` : `in ${d}d ${h}h`;
        if (h > 0) return LANG === 'zh' ? `${h}小时${m}分后` : `in ${h}h ${m}m`;
        return LANG === 'zh' ? `${m}分钟后` : `in ${m}m`;
    }

    // ─── UI builders ───
    function buildUsageSection(usage) {
        let html = `<div class="gqp-section gqp-usage-sec"><div class="gqp-sec-title">${L.usageTitle}</div>`;
        if (!usage || typeof usage.percent !== 'number') {
            return html + `<div class="gqp-hint" style="padding:6px 2px">${L.usageEmpty}</div></div>`;
        }
        const pct = usage.percent;
        const remaining = usage.remaining != null ? usage.remaining : Math.max(0, 100 - pct);
        const cls = pct >= 90 ? 'c-danger' : pct >= 70 ? 'c-warn' : 'c-ok';
        const remainHint = formatResetRemaining(usage.resetIso);

        html += `<div class="gqp-usage-card">`;
        // Big remaining + used summary
        html += `<div class="gqp-usage-hero">`;
        html += `<div class="gqp-usage-big ${cls}">${remaining}<span class="gqp-usage-unit">%</span></div>`;
        html += `<div class="gqp-usage-hero-meta">`;
        html += `<div class="gqp-usage-hero-label">${L.remainLabel}</div>`;
        html += `<div class="gqp-usage-hero-sub">${pct}% ${L.usedLabel}</div>`;
        html += `</div></div>`;

        // Progress (used portion)
        html += `<div class="gqp-progress gqp-progress-lg"><div class="gqp-bar ${cls}" style="width:${pct}%"></div></div>`;

        // Product breakdown
        const products = (usage.productUsage || []).filter(p => (p.usagePercent || 0) > 0)
            .sort((a, b) => (b.usagePercent || 0) - (a.usagePercent || 0));
        if (products.length > 0) {
            html += `<div class="gqp-product-bar">`;
            for (const p of products) {
                const color = PRODUCT_COLORS[p.product] || '#6b7280';
                const name = PRODUCT_NAMES[p.product] || `P${p.product}`;
                html += `<div class="gqp-product-seg" style="width:${p.usagePercent}%;background:${color}" title="${name}: ${p.usagePercent}%"></div>`;
            }
            html += `</div>`;
            html += `<div class="gqp-products">`;
            for (const p of products) {
                const color = PRODUCT_COLORS[p.product] || '#6b7280';
                const name = PRODUCT_NAMES[p.product] || `P${p.product}`;
                html += `<div class="gqp-product-item"><span class="gqp-dot" style="background:${color}"></span>`;
                html += `<span class="gqp-product-name">${name}</span><span class="gqp-product-pct">${p.usagePercent}%</span></div>`;
            }
            html += `</div>`;
        } else if (pct > 0) {
            html += `<div class="gqp-hint" style="margin-top:6px">${L.noProducts}</div>`;
        }

        if (usage.resetDate || remainHint) {
            html += `<div class="gqp-reset-line">`;
            if (usage.resetDate) html += `<span>${L.resetLabel} ${usage.resetDate}</span>`;
            if (remainHint) html += `<span class="gqp-reset-eta">${remainHint}</span>`;
            html += `</div>`;
        }
        html += `</div></div>`;
        return html;
    }

    function buildModelSection(snap, sub) {
        const s = sub || { canUseHeavy: false };
        const active = (snap && snap.category) || 'expert';
        const rk = requestKindLabel(snap && snap.requestKind);
        const detail = friendlyModelLabel(snap && snap.modelName);

        let html = `<div class="gqp-section gqp-model-sec"><div class="gqp-sec-title">${L.modelTitle}</div>`;
        html += `<div class="gqp-chip-row">`;
        for (const chip of MODEL_CHIPS) {
            const isHeavy = chip.kind === 'heavy';
            const locked = isHeavy && !s.canUseHeavy;
            const isOn = chip.kind === active && !locked;
            let cls = 'gqp-chip';
            if (isOn) cls += ' gqp-chip-on';
            if (locked) cls += ' gqp-chip-locked';
            const title = locked ? L.unlockHeavy : (isOn ? L.active : chip.short);
            html += `<div class="${cls}" data-kind="${chip.kind}" title="${title}">${chip.short}</div>`;
        }
        html += `</div>`;
        html += `<div class="gqp-model-detail">`;
        html += `<span class="gqp-model-code">${detail}</span>`;
        if (rk) html += `<span class="gqp-model-rk">${rk}</span>`;
        html += `</div></div>`;
        return html;
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

    function setRefreshSpinning(on) {
        const btn = getPanel()?.querySelector('#gqp-refresh');
        if (!btn) return;
        btn.classList.toggle('gqp-spin', !!on);
        btn.disabled = !!on;
    }

    function updateFooter(ts) {
        const footer = getPanel()?.querySelector('.pfooter');
        if (!footer) return;
        const time = ts
            ? new Date(ts).toLocaleTimeString(LANG === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' })
            : '--';
        footer.innerHTML = `<span>${L.lastUpdate}: ${time}</span><span class="fver">v${VERSION}</span>`;
    }

    function updateContent({ usage, sub, snap, timestamp, silent } = {}) {
        const p = getPanel();
        if (!p) return;
        const body = p.querySelector('.pbody');
        if (!body) return;

        if (usage) lastUiUsage = usage;
        if (sub) lastSub = sub;
        if (snap) {
            lastModelName = snap.modelName;
            lastRequestKind = snap.requestKind;
            lastActiveCategory = snap.category;
        }

        const u = usage || lastUiUsage || normalizeWeeklyForUi(cachedWeeklyUsage);
        const s = sub || lastSub || detectSubscription();
        const m = snap || getModelSnapshot();

        // In-place render — never flash a blank loading screen when content exists
        body.innerHTML = buildUsageSection(u) + buildModelSection(m, s);
        hasRenderedContent = true;
        if (timestamp) updateFooter(timestamp);
        else if (!silent) updateFooter(Date.now());
    }

    /** Local-only model chip update (no network, no flash). */
    function syncModelChips() {
        if (!hasRenderedContent || !getPanel()) return;
        const snap = getModelSnapshot();
        if (snap.modelName === lastModelName
            && snap.requestKind === lastRequestKind
            && snap.category === lastActiveCategory) {
            return;
        }
        lastModelName = snap.modelName;
        lastRequestKind = snap.requestKind;
        lastActiveCategory = snap.category;

        const body = getPanel().querySelector('.pbody');
        if (!body) return;
        const modelSec = body.querySelector('.gqp-model-sec');
        const html = buildModelSection(snap, lastSub || detectSubscription());
        if (modelSec) {
            // Replace only model section to avoid usage flicker
            const tmp = document.createElement('div');
            tmp.innerHTML = html;
            const next = tmp.firstElementChild;
            if (next) modelSec.replaceWith(next);
        } else {
            updateContent({ snap, silent: true });
        }
    }

    // ─── Core refresh ───
    /**
     * @param {boolean} forceWeekly - force re-fetch GetGrokCreditsConfig
     * @param {{ silent?: boolean }} opts - silent=true never shows loading blank
     */
    async function refreshData(forceWeekly, opts) {
        const silent = !!(opts && opts.silent) || hasRenderedContent;
        const p = getPanel();
        if (!p || isRefreshing) return;
        isRefreshing = true;
        setRefreshSpinning(true);

        const body = p.querySelector('.pbody');
        // Only show loading on first paint when we have nothing to display
        if (!silent && body && !hasRenderedContent) {
            body.innerHTML = `<div class="loading">${L.loading}</div>`;
        }

        try {
            const rawWeekly = await fetchWeeklyUsage(!!forceWeekly);
            const usage = normalizeWeeklyForUi(rawWeekly);
            const sub = detectSubscription();
            updateBadge(sub);
            const snap = getModelSnapshot();
            updateContent({ usage, sub, snap, timestamp: Date.now(), silent: true });
        } catch {
            if (!hasRenderedContent) {
                const b = getPanel()?.querySelector('.pbody');
                if (b) b.innerHTML = `<div class="loading" style="color:var(--danger)">${L.refreshFail}</div>`;
            }
            // Keep previous content if silent / already rendered
        } finally {
            isRefreshing = false;
            setRefreshSpinning(false);
        }
    }

    // ─── Polling & event management ───
    function startPolling() {
        stopPolling();
        // Weekly usage network poll (5 min), always silent
        pollInterval = setInterval(() => {
            if (document.visibilityState === 'visible' && getPanel()) {
                refreshData(false, { silent: true });
            }
        }, WEEKLY_REFRESH_MS);
        // Local model chips — no network
        modelPollInterval = setInterval(() => {
            if (document.visibilityState === 'visible' && getPanel()) {
                syncModelChips();
            }
        }, MODEL_POLL_MS);
    }

    function stopPolling() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
        if (modelPollInterval) {
            clearInterval(modelPollInterval);
            modelPollInterval = null;
        }
    }

    // ─── Query bar observer — detects model changes and submit events ───
    function setupQueryBarObserver() {
        if (queryBarObserver) queryBarObserver.disconnect();

        const qb = getQueryBar();
        if (!qb) return;

        queryBarElement = qb;

        const debouncedModelCheck = debounce(() => {
            syncModelChips();
        }, 200);

        queryBarObserver = new MutationObserver((mutations) => {
            for (const mut of mutations) {
                if (mut.type === 'childList' || mut.type === 'characterData' ||
                    (mut.type === 'attributes' && (mut.attributeName === 'aria-label' || mut.attributeName === 'aria-pressed'))) {
                    debouncedModelCheck();
                    break;
                }
            }
        });
        queryBarObserver.observe(qb, { childList: true, subtree: true, attributes: true, characterData: true });

        // After send: quietly refresh weekly usage (usage may tick up)
        const scheduleSoftUsageRefresh = () => {
            setTimeout(() => refreshData(true, { silent: true }), 4000);
        };

        const inputEl = qb.querySelector('div[contenteditable="true"]');
        if (inputEl) {
            inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) scheduleSoftUsageRefresh();
            });
        }

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
            submitBtn.addEventListener('click', scheduleSoftUsageRefresh);
        }
    }

    // ─── DOM observer — detect query bar appearance/disappearance ───
    function setupDomObserver() {
        if (domObserver) return;

        domObserver = new MutationObserver(() => {
            const qb = getQueryBar();
            if (qb && qb !== queryBarElement) {
                queryBarElement = qb;
                setupQueryBarObserver();
                syncModelChips();
                startPolling();
            } else if (!qb && queryBarElement) {
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
                refreshData(false, { silent: true });
                syncModelChips();
                startPolling();
            } else {
                stopPolling();
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

        panel.querySelector('#gqp-refresh').onclick = () => refreshData(true, { silent: true });
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
        #${PANEL_ID}{--bg:#18181b;--bg2:#1c1c1f;--bg3:#27272a;--border:#3f3f46;--text:#e4e4e7;--sub:#a1a1aa;--hint:#71717a;--ok:#a3e635;--warn:#fb923c;--danger:#f87171;--active:#60a5fa;position:fixed;bottom:16px;right:16px;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;font-size:12.5px;min-width:268px;max-width:300px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,0.12);overflow:hidden;user-select:none}
        #${PANEL_ID}.light{--bg:#fff;--bg2:#fafafa;--bg3:#f4f4f5;--border:#e4e4e7;--text:#18181b;--sub:#52525b;--hint:#a1a1aa;--ok:#16a34a;--warn:#ea580c;--danger:#dc2626;--active:#2563eb}
        #${PANEL_ID} .pheader{display:flex;align-items:center;justify-content:space-between;padding:9px 12px 8px;background:var(--bg2);border-bottom:1px solid var(--border)}
        #${PANEL_ID} .badge{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;font-size:11.5px;font-weight:600;color:#fff;opacity:.92}
        #${PANEL_ID} .hbtns{display:flex;gap:2px}
        #${PANEL_ID} button{background:transparent;color:var(--sub);border:none;padding:3px 7px;border-radius:6px;font-size:13px;cursor:pointer}
        #${PANEL_ID} button:hover{background:var(--bg3);color:var(--text)}
        #${PANEL_ID} button:disabled{opacity:.55;cursor:default}
        #${PANEL_ID} #gqp-refresh.gqp-spin{animation:gqp-spin 0.8s linear infinite}
        @keyframes gqp-spin{to{transform:rotate(360deg)}}
        #${PANEL_ID} .pbody{padding:10px 12px 8px}
        #${PANEL_ID} .loading{padding:10px 2px;color:var(--hint);font-size:12.5px}
        #${PANEL_ID} .gqp-section{margin-bottom:10px}
        #${PANEL_ID} .gqp-section:last-child{margin-bottom:2px}
        #${PANEL_ID} .gqp-sec-title{font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--hint);margin-bottom:6px;padding-left:1px}
        #${PANEL_ID} .gqp-hint{font-size:10.5px;color:var(--hint);font-style:italic}
        #${PANEL_ID} .c-ok{color:var(--ok)} #${PANEL_ID} .c-warn{color:var(--warn)} #${PANEL_ID} .c-danger{color:var(--danger)}

        /* Weekly usage */
        #${PANEL_ID} .gqp-usage-card{background:var(--bg3);border-radius:10px;padding:10px 12px}
        #${PANEL_ID} .gqp-usage-hero{display:flex;align-items:center;gap:12px;margin-bottom:8px}
        #${PANEL_ID} .gqp-usage-big{font-family:ui-monospace,SF Mono,Menlo,Consolas,monospace;font-size:28px;font-weight:700;line-height:1;letter-spacing:-0.02em}
        #${PANEL_ID} .gqp-usage-unit{font-size:14px;font-weight:600;margin-left:1px;opacity:.85}
        #${PANEL_ID} .gqp-usage-hero-label{font-size:12px;font-weight:600;color:var(--text)}
        #${PANEL_ID} .gqp-usage-hero-sub{font-size:11px;color:var(--hint);margin-top:2px}
        #${PANEL_ID} .gqp-progress{height:5px;background:var(--bg);border-radius:999px;overflow:hidden}
        #${PANEL_ID} .gqp-progress-lg{height:7px}
        #${PANEL_ID} .gqp-bar{height:100%;background:var(--ok);transition:width .35s ease}
        #${PANEL_ID} .gqp-bar.c-warn{background:var(--warn)}
        #${PANEL_ID} .gqp-bar.c-danger{background:var(--danger)}
        #${PANEL_ID} .gqp-product-bar{display:flex;height:4px;width:100%;border-radius:999px;overflow:hidden;margin-top:7px;background:var(--bg)}
        #${PANEL_ID} .gqp-product-seg{height:100%;min-width:2px}
        #${PANEL_ID} .gqp-products{display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;margin-top:8px}
        #${PANEL_ID} .gqp-product-item{display:flex;align-items:center;gap:5px;font-size:10.5px;color:var(--hint);min-width:0}
        #${PANEL_ID} .gqp-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
        #${PANEL_ID} .gqp-product-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        #${PANEL_ID} .gqp-product-pct{margin-left:auto;font-weight:600;color:var(--sub);font-variant-numeric:tabular-nums}
        #${PANEL_ID} .gqp-reset-line{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px;padding-top:7px;border-top:1px solid var(--border);font-size:10.5px;color:var(--hint)}
        #${PANEL_ID} .gqp-reset-eta{color:var(--sub);font-weight:500;white-space:nowrap}

        /* Model chips (horizontal) */
        #${PANEL_ID} .gqp-chip-row{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}
        #${PANEL_ID} .gqp-chip{text-align:center;padding:7px 2px;border-radius:8px;font-size:11.5px;font-weight:500;color:var(--hint);background:var(--bg3);border:1px solid transparent;transition:background .15s,color .15s,border-color .15s}
        #${PANEL_ID} .gqp-chip-on{color:var(--text);background:rgba(96,165,250,.12);border-color:var(--active);font-weight:650;box-shadow:0 0 0 1px rgba(96,165,250,.15)}
        #${PANEL_ID}.light .gqp-chip-on{background:rgba(37,99,235,.08)}
        #${PANEL_ID} .gqp-chip-locked{opacity:.38}
        #${PANEL_ID} .gqp-model-detail{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:7px;padding:0 2px;font-size:10.5px;color:var(--hint)}
        #${PANEL_ID} .gqp-model-code{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        #${PANEL_ID} .gqp-model-rk{flex-shrink:0;padding:1px 7px;border-radius:999px;background:var(--bg3);color:var(--sub);font-weight:500}

        #${PANEL_ID} .pfooter{padding:5px 12px;font-size:10.5px;color:var(--hint);background:var(--bg2);border-top:1px solid var(--border);display:flex;justify-content:space-between}
        #${PANEL_ID} .fver{opacity:.45}
    `);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
