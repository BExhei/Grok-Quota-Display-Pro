// ==UserScript==
// @name Grok Quota Display Pro
// @namespace https://github.com/BExhei/Grok-Quota-Display-Pro
// @version 3.0.0
// @description Grok weekly usage + one-click usage-limit reset + model chips for Lite / SuperGrok / Plus / Heavy; silent refresh
// @run-at       document-start
// @author BExhei
// @icon https://www.google.com/s2/favicons?sz=64&domain=grok.com
// @match https://grok.com/*
// @grant GM_addStyle
// @license GPL-3.0
// @homepageURL https://greasyfork.org/zh-CN/scripts/578827-grok-quota-display-pro
// @supportURL https://greasyfork.org/zh-CN/scripts/578827-grok-quota-display-pro/feedback
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
            // EN + common ZH labels for Think / DeepSearch
            if (btn.getAttribute('aria-pressed') === 'true') {
                if (aria === 'Think' || aria === '思考') {
                    const path = btn.querySelector('path');
                    const d = path ? (path.getAttribute('d') || '') : '';
                    // Prefer brain-icon path when present; aria match is enough for ZH UI
                    if (!d || d.includes('M19 9C19 12.866') || aria === '思考') thinkPressed = true;
                }
                if (/Deep(?:er)?Search/i.test(aria) || /深度搜索|更深搜索|深度研究/i.test(aria)) {
                    if (/deeper|更深/i.test(aria)) searchKind = 'DEEPERSEARCH';
                    else searchKind = 'DEEPSEARCH';
                }
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
    const FETCH_TIMEOUT_MS = 10000;
    // First open: page/session often not ready — wait + retry before giving up
    const STARTUP_DELAY_MS = 1200;
    const STARTUP_RETRY_DELAYS_MS = [0, 700, 1500, 2800, 4500];
    const VERSION = '3.0.0';

    const LANG = navigator.language.startsWith('zh') ? 'zh' : 'en';

    // Weekly product breakdown (Grok Settings → Usage)
    const PRODUCT_NAMES = {
        0: LANG === 'zh' ? '第三方' : '3rd Party',
        1: 'API',
        2: 'Grok Build',
        3: LANG === 'zh' ? '插件' : 'Grok Plugins',
        4: LANG === 'zh' ? '聊天' : 'Chat',
        5: 'Imagine',
        6: LANG === 'zh' ? '语音' : 'Voice',
    };
    // Official bar uses one electric blue with stepped opacity (see --fg-electric-blue)
    // #1a5eff ≈ hsl(221 100% 55%)
    const ELECTRIC_BLUE_HSL = '221 100% 55%';
    const SEGMENT_OPACITIES = [1, 0.7, 0.45, 0.32, 0.22, 0.15, 0.1];
    function electricBlue(alpha) {
        return `hsl(${ELECTRIC_BLUE_HSL} / ${alpha})`;
    }

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
        usageEmpty: LANG === 'zh' ? '暂无周用量数据' : 'No weekly usage data',
        usageGuest: LANG === 'zh' ? '登录后可查看每周用量' : 'Sign in to view weekly usage',
        usageFree: LANG === 'zh'
            ? '免费账户无每周共享额度 · SuperGrok 套餐可用'
            : 'No weekly pool on Free · available with SuperGrok plans',
        usageEmptyPaid: LANG === 'zh'
            ? '暂无周用量数据，可点 ⟳ 重试或打开设置 → 用量'
            : 'No data yet — tap ⟳ or open Settings → Usage',
        usedLabel: LANG === 'zh' ? '已用' : 'used',
        remainLabel: LANG === 'zh' ? '剩余' : 'left',
        lastUpdate: LANG === 'zh' ? '更新' : 'Updated',
        loading: LANG === 'zh' ? '加载中…' : 'Loading…',
        refreshFail: LANG === 'zh' ? '加载失败' : 'Load failed',
        guest: LANG === 'zh' ? '游客' : 'Guest',
        free: LANG === 'zh' ? '免费' : 'Free',
        loggedIn: LANG === 'zh' ? '已登录' : 'Logged in',
        unlockHeavy: LANG === 'zh' ? '需 SuperGrok Heavy' : 'SuperGrok Heavy only',
        resetLabel: LANG === 'zh' ? '重置' : 'Resets',
        resetTitle: LANG === 'zh' ? '用量限额重置' : 'Usage Limit Reset',
        resetInfo: LANG === 'zh'
            ? '一次重置会清空本周用量。重置不可叠加，到期失效。'
            : "A reset clears your weekly usage once. Resets don't stack and expire.",
        resetAvailable: LANG === 'zh' ? '重置可用' : 'Reset Available',
        resetExpires: (date) => LANG === 'zh' ? `将于 ${date} 过期` : `Expires on ${date}`,
        resetRedeem: LANG === 'zh' ? '兑换' : 'Redeem',
        resetRedeeming: LANG === 'zh' ? '兑换中…' : 'Redeeming…',
        resetConfirm: LANG === 'zh'
            ? '确认兑换这次重置？将立即清空本周用量。重置不可叠加，兑换后即失效。'
            : 'Redeem this reset? It will clear your weekly usage now. Resets do not stack, and this token will be used.',
        resetOk: LANG === 'zh' ? '已重置，本周用量已刷新' : 'Reset applied — weekly usage is fresh again',
        resetFail: LANG === 'zh' ? '兑换失败，重置仍可用' : "Couldn't apply reset — it is still available",
        active: LANG === 'zh' ? '当前' : 'Active',
        noProducts: LANG === 'zh' ? '暂无分类明细' : 'No category breakdown',
        think: LANG === 'zh' ? '思考' : 'Think',
        deepSearch: 'DeepSearch',
        deeperSearch: 'DeeperSearch',
        unknownModel: LANG === 'zh' ? '未知' : 'Unknown',
    };

    /** Tier ids: guest | free | premium | lite | super | plus | heavy */
    const TIER = {
        guest:  { id: 'guest',   tier: () => L.guest,           color: '#6b7280', canUseHeavy: false, hasWeeklyPool: false },
        free:   { id: 'free',    tier: () => L.free,            color: '#4b5563', canUseHeavy: false, hasWeeklyPool: false },
        premium:{ id: 'premium', tier: () => 'Premium+',        color: '#1d4ed8', canUseHeavy: false, hasWeeklyPool: true },
        lite:   { id: 'lite',    tier: () => 'SuperGrok Lite',  color: '#0d9488', canUseHeavy: false, hasWeeklyPool: true },
        super:  { id: 'super',   tier: () => 'SuperGrok',       color: '#047857', canUseHeavy: false, hasWeeklyPool: true },
        plus:   { id: 'plus',    tier: () => 'SuperGrok Plus',  color: '#4f46e5', canUseHeavy: false, hasWeeklyPool: true },
        heavy:  { id: 'heavy',   tier: () => 'SuperGrok Heavy', color: '#b45309', canUseHeavy: true,  hasWeeklyPool: true },
    };
    function makeTier(key) {
        const t = TIER[key] || TIER.free;
        return { id: t.id, tier: typeof t.tier === 'function' ? t.tier() : t.tier, color: t.color, canUseHeavy: t.canUseHeavy, hasWeeklyPool: t.hasWeeklyPool };
    }

    const cfg = {
        get theme() { return localStorage.getItem('grokQuotaTheme') || 'dark'; },
        set theme(v) { localStorage.setItem('grokQuotaTheme', v); },
        get minimized() { return localStorage.getItem('grokQuotaMin') === '1'; },
        set minimized(v) { localStorage.setItem('grokQuotaMin', v ? '1' : '0'); },
    };

    // ─── State ───
    let cachedWeeklyUsage = null;   // { usagePercent, productUsage, currentPeriod, source }
    let lastWeeklyFetchAt = 0;
    let cachedResetToken = null;    // { tokenId, validityEnd: Date, availableCount } | null
    let lastResetFetchAt = 0;
    let isRedeemingReset = false;
    let lastUiUsage = null;         // normalized weekly for UI
    let lastSub = null;
    let lastModelName = null;
    let lastRequestKind = 'DEFAULT';
    let lastActiveCategory = null;
    let hasRenderedContent = false;
    let isRefreshing = false;
    let bootstrapDone = false;       // first successful weekly read (or exhausted retries)
    let startupRetryTimer = null;
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

    // ─── Usage-limit reset: ConsumerUiSvc GetRemainingResets / RedeemReset ───
    function encodeVarintBytes(n) {
        const bytes = [];
        n = n >>> 0;
        while (n > 0x7f) {
            bytes.push((n & 0x7f) | 0x80);
            n >>>= 7;
        }
        bytes.push(n);
        return bytes;
    }

    function encodeLengthDelimited(fieldNum, payload) {
        const tag = encodeVarintBytes((fieldNum << 3) | 2);
        const len = encodeVarintBytes(payload.length);
        const out = new Uint8Array(tag.length + len.length + payload.length);
        out.set(tag, 0);
        out.set(len, tag.length);
        out.set(payload, tag.length + len.length);
        return out;
    }

    function grpcWebFrame(payload) {
        const out = new Uint8Array(5 + payload.length);
        out[0] = 0;
        const view = new DataView(out.buffer);
        view.setUint32(1, payload.length);
        out.set(payload, 5);
        return out;
    }

    function unwrapGrpcWebPayload(buffer) {
        const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        if (buf.length < 5) return buf;
        const flag = buf[0];
        const len = (buf[1] << 24) | (buf[2] << 16) | (buf[3] << 8) | buf[4];
        if ((flag & 0x7f) === 0 && len >= 0 && 5 + len <= buf.length) {
            return buf.subarray(5, 5 + len);
        }
        return buf;
    }

    function parseConsumerResetToken(buf) {
        let tokenId = '';
        let validityEnd = null;
        let pos = 0;
        while (pos < buf.length) {
            const tag = decodeVarint(buf, pos);
            pos = tag.next;
            const field = tag.value >> 3;
            const wire = tag.value & 0x07;
            if (wire === 2) {
                const len = decodeVarint(buf, pos);
                pos = len.next;
                if (field === 10 || field === 1) {
                    const s = new TextDecoder().decode(buf.subarray(pos, pos + len.value));
                    if (s && s.length >= 4 && s.length < 200) tokenId = s;
                } else if (field === 30 || field === 20 || field === 2 || field === 3) {
                    const ts = parseProtobufTimestamp(buf, pos, len.value);
                    if (ts && (field === 30 || field === 3 || !validityEnd)) validityEnd = ts;
                }
                pos += len.value;
            } else if (wire === 0) {
                pos = decodeVarint(buf, pos).next;
            } else {
                break;
            }
        }
        if (!tokenId) return null;
        let end = validityEnd ? new Date(validityEnd) : null;
        if (end && !Number.isFinite(end.getTime())) end = null;
        if (end && end.getTime() <= Date.now()) return null;
        return { tokenId, validityEnd: end };
    }

    function walkResetTokens(buf, tokens) {
        let pos = 0;
        while (pos < buf.length) {
            const tag = decodeVarint(buf, pos);
            if (tag.next <= pos) break;
            pos = tag.next;
            const field = tag.value >> 3;
            const wire = tag.value & 0x07;
            if (wire === 2) {
                const len = decodeVarint(buf, pos);
                pos = len.next;
                const chunk = buf.subarray(pos, pos + len.value);
                pos += len.value;
                if (field === 10 || field === 1) {
                    const tok = parseConsumerResetToken(chunk);
                    if (tok) tokens.push(tok);
                    else walkResetTokens(chunk, tokens);
                }
            } else if (wire === 0) {
                pos = decodeVarint(buf, pos).next;
            } else {
                break;
            }
        }
    }

    function parseRemainingResetsJson(text) {
        try {
            const obj = JSON.parse(text);
            const raw = obj.tokens || obj.stillRedeemable || obj.still_redeemable || [];
            const tokens = [];
            for (const t of raw) {
                const tokenId = t.tokenId || t.token_id;
                const rawEnd = t.validityEnd || t.validity_end;
                if (!tokenId) continue;
                let end = rawEnd ? new Date(typeof rawEnd === 'string' ? rawEnd : (rawEnd.seconds ? Number(rawEnd.seconds) * 1000 : rawEnd)) : null;
                if (end && !Number.isFinite(end.getTime())) end = null;
                if (end && end.getTime() <= Date.now()) continue;
                tokens.push({ tokenId, validityEnd: end });
            }
            return pickResetToken(tokens);
        } catch {
            return null;
        }
    }

    function parseRemainingResets(buffer) {
        const raw = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        const tokens = [];
        walkResetTokens(unwrapGrpcWebPayload(raw), tokens);
        if (!tokens.length) walkResetTokens(raw, tokens);
        return pickResetToken(tokens);
    }

    function pickResetToken(tokens) {
        const valid = (tokens || []).filter(t => t && t.tokenId);
        if (!valid.length) return null;
        const dated = valid.filter(t => t.validityEnd && t.validityEnd.getTime() > Date.now());
        const pool = dated.length ? dated : valid;
        const soonest = pool.reduce((a, b) => {
            if (!a.validityEnd) return b;
            if (!b.validityEnd) return a;
            return a.validityEnd.getTime() <= b.validityEnd.getTime() ? a : b;
        });
        return { ...soonest, availableCount: valid.length };
    }

    function encodeRedeemResetRequest(tokenId) {
        const payload = encodeLengthDelimited(10, new TextEncoder().encode(String(tokenId)));
        return grpcWebFrame(payload);
    }

    const GRPC_WEB_HEADERS = {
        'content-type': 'application/grpc-web+proto',
        'connect-protocol-version': '1',
        'x-grpc-web': '1',
    };
    const RESET_RPC_BASES = [
        '/prod_mc_billing.ConsumerUiSvc',
        '/grok_api_v2.ConsumerUiSvc',
    ];
    let lastResetRpcBase = RESET_RPC_BASES[0];

    async function fetchRemainingResets(maxAttempts) {
        if (maxAttempts == null) maxAttempts = 1;
        let lastErr = null;
        const bases = lastResetRpcBase
            ? [lastResetRpcBase, ...RESET_RPC_BASES.filter(b => b !== lastResetRpcBase)]
            : RESET_RPC_BASES.slice();
        for (const base of bases) {
            const url = window.location.origin + base + '/GetRemainingResets';
            const init = {
                method: 'POST',
                credentials: 'include',
                headers: GRPC_WEB_HEADERS,
                body: new Uint8Array([0, 0, 0, 0, 0]),
            };
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    const res = await fetchWithTimeout(url, init, FETCH_TIMEOUT_MS);
                    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + base);
                    const buf = await res.arrayBuffer();
                    const parsed = parseRemainingResets(buf);
                    lastResetRpcBase = base;
                    if (!parsed) {
                        console.warn('[GrokQuotaPro] GetRemainingResets empty', base, 'bytes', buf.byteLength);
                    }
                    return parsed;
                } catch (e) {
                    lastErr = e;
                }
                if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 350 * attempt));
            }
        }
        // Connect JSON fallback (some gateways accept this)
        try {
            const url = window.location.origin + RESET_RPC_BASES[0] + '/GetRemainingResets';
            const res = await fetchWithTimeout(url, {
                method: 'POST',
                credentials: 'include',
                headers: { 'content-type': 'application/json', accept: 'application/json' },
                body: '{}',
            }, FETCH_TIMEOUT_MS);
            if (res.ok) {
                const parsed = parseRemainingResetsJson(await res.text());
                if (parsed) {
                    lastResetRpcBase = RESET_RPC_BASES[0];
                    return parsed;
                }
            }
        } catch (e) {
            lastErr = e;
        }
        if (lastErr) throw lastErr;
        return null;
    }

    async function redeemUsageReset(tokenId) {
        const bases = lastResetRpcBase
            ? [lastResetRpcBase, ...RESET_RPC_BASES.filter(b => b !== lastResetRpcBase)]
            : RESET_RPC_BASES.slice();
        let lastErr = null;
        for (const base of bases) {
            try {
                const res = await fetchWithTimeout(window.location.origin + base + '/RedeemReset', {
                    method: 'POST',
                    credentials: 'include',
                    headers: GRPC_WEB_HEADERS,
                    body: encodeRedeemResetRequest(tokenId),
                }, FETCH_TIMEOUT_MS);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                lastResetRpcBase = base;
                return parseRemainingResets(await res.arrayBuffer());
            } catch (e) {
                lastErr = e;
            }
        }
        throw lastErr || new Error('redeem failed');
    }

    async function fetchGrokCreditsConfig(maxAttempts) {
        if (maxAttempts == null) maxAttempts = 1;
        const url = window.location.origin + '/grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig';
        const init = {
            method: 'POST',
            credentials: 'include',
            headers: {
                'content-type': 'application/grpc-web+proto',
                'connect-protocol-version': '1',
                'x-grpc-web': '1',
            },
            body: new Uint8Array([0, 0, 0, 0, 0]),
        };
        let lastErr = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const res = await fetchWithTimeout(url, init, FETCH_TIMEOUT_MS);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const parsed = parseGrpcWebCreditsConfig(await res.arrayBuffer());
                if (parsed && typeof parsed.usagePercent === 'number') return parsed;
                lastErr = new Error('empty or unparsable credits config');
            } catch (e) {
                lastErr = e;
            }
            if (attempt < maxAttempts) {
                await new Promise(r => setTimeout(r, 350 * attempt));
            }
        }
        if (lastErr) throw lastErr;
        return null;
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
                if (typeof urlStr === 'string' && res.ok) {
                    if (urlStr.includes('GetGrokCreditsConfig')) {
                        const buf = await res.clone().arrayBuffer().catch(() => null);
                        if (buf) {
                            const parsed = parseGrpcWebCreditsConfig(buf);
                            if (parsed && typeof parsed.usagePercent === 'number') {
                                cachedWeeklyUsage = { ...parsed, source: 'intercepted' };
                                lastWeeklyFetchAt = Date.now();
                                bootstrapDone = true;
                                clearStartupRetry();
                                if (getPanel()) {
                                    const usage = normalizeWeeklyForUi(cachedWeeklyUsage);
                                    const sub = detectSubscription();
                                    updateBadge(sub);
                                    updateContent({ usage, sub, snap: getModelSnapshot(), timestamp: Date.now(), silent: true });
                                    refreshResetToken(false, 1).then(() => {
                                        if (getPanel() && liveResetToken()) updateContent({ silent: true });
                                    }).catch(() => {});
                                }
                            }
                        }
                    } else if (urlStr.includes('GetRemainingResets')) {
                        const ctype = (res.headers.get('content-type') || '').toLowerCase();
                        let parsed = null;
                        if (ctype.includes('json')) {
                            const txt = await res.clone().text().catch(() => '');
                            parsed = parseRemainingResetsJson(txt);
                        } else {
                            const buf = await res.clone().arrayBuffer().catch(() => null);
                            if (buf) parsed = parseRemainingResets(buf);
                        }
                        cachedResetToken = parsed;
                        lastResetFetchAt = Date.now();
                        if (urlStr.includes('prod_mc_billing')) lastResetRpcBase = '/prod_mc_billing.ConsumerUiSvc';
                        else if (urlStr.includes('grok_api_v2.ConsumerUiSvc')) lastResetRpcBase = '/grok_api_v2.ConsumerUiSvc';
                        if (getPanel() && hasRenderedContent) {
                            updateContent({ silent: true });
                        }
                    }
                }
            } catch (e) { /* never break real fetch */ }
            return res;
        };
    } catch (e) { /* ignore */ }

    // ─── Subscription detection (Lite / SuperGrok / Plus / Heavy) ───
    function pageTextBundle() {
        const fullText = (document.body?.innerText || '').toLowerCase();
        const headerEl = document.querySelector('header, nav, [class*="header"], [data-testid*="top"]');
        const headerText = headerEl ? headerEl.innerText.toLowerCase() : '';
        return { fullText, headerText, blob: headerText + '\n' + fullText };
    }

    function isLikelyGuest() {
        try {
            const loginBtn = document.querySelector(
                'a[href*="login"], a[href*="sign-in"], button[aria-label*="sign in" i], button[aria-label*="log in" i], [data-testid*="login"]'
            );
            if (!loginBtn) return false;
            const { blob } = pageTextBundle();
            // Logged-in Free still has no SuperGrok string; guest usually has sign-in CTA
            if (/supergrok|sign\s*out|log\s*out|账户|退出/.test(blob)) return false;
            return true;
        } catch {
            return false;
        }
    }

    function matchSuperGrokTier(text) {
        if (!text) return null;
        if (/supergrok\s*heavy|supergrok\s*pro(?!\s*lite)|grok\s*heavy/.test(text)) return 'heavy';
        if (/supergrok\s*plus/.test(text)) return 'plus';
        if (/supergrok\s*lite/.test(text)) return 'lite';
        if (/\bsupergrok\b/.test(text)) return 'super';
        return null;
    }

    function detectSubscription() {
        try {
            const { fullText, headerText, blob } = pageTextBundle();
            const fromHeader = matchSuperGrokTier(headerText);
            if (fromHeader) return makeTier(fromHeader);
            const fromPage = matchSuperGrokTier(blob);
            if (fromPage) return makeTier(fromPage);

            // Weekly pool API only returns meaningful data for paid weekly plans
            if (cachedWeeklyUsage && typeof cachedWeeklyUsage.usagePercent === 'number') {
                return makeTier('super');
            }

            if (fullText.includes('premium+') || fullText.includes('premium plus')) {
                return makeTier('premium');
            }
            if (isLikelyGuest()) return makeTier('guest');
            return makeTier('free');
        } catch {
            return makeTier('free');
        }
    }

    function usageEmptyHint(sub) {
        const s = sub || lastSub || detectSubscription();
        if (s.id === 'guest') return L.usageGuest;
        if (s.id === 'free' || s.id === 'premium') return L.usageFree;
        if (s.hasWeeklyPool) return L.usageEmptyPaid;
        return L.usageEmpty;
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
     * opts.attempts: HTTP/parse retries for cold start.
     */
    async function fetchWeeklyUsage(force, opts) {
        const now = Date.now();
        const attempts = (opts && opts.attempts) || 1;
        if (!force && cachedWeeklyUsage && typeof cachedWeeklyUsage.usagePercent === 'number'
            && (now - lastWeeklyFetchAt) < WEEKLY_REFRESH_MS) {
            await refreshResetToken(false, 1);
            return cachedWeeklyUsage;
        }
        try {
            const parsed = await fetchGrokCreditsConfig(attempts);
            if (parsed && typeof parsed.usagePercent === 'number') {
                cachedWeeklyUsage = { ...parsed, source: 'api' };
                lastWeeklyFetchAt = Date.now();
                bootstrapDone = true;
                await refreshResetToken(force, attempts);
                return cachedWeeklyUsage;
            }
        } catch (e) {
            console.warn('[GrokQuotaPro] weekly usage fetch failed:', e);
        }
        await refreshResetToken(!!force, attempts).catch(() => {});
        // Return stale cache if available
        if (cachedWeeklyUsage && typeof cachedWeeklyUsage.usagePercent === 'number') {
            return cachedWeeklyUsage;
        }
        return null;
    }

    async function refreshResetToken(force, attempts) {
        const now = Date.now();
        if (!force && cachedResetToken && cachedResetToken.validityEnd
            && cachedResetToken.validityEnd.getTime() > now
            && (now - lastResetFetchAt) < WEEKLY_REFRESH_MS) {
            return cachedResetToken;
        }
        try {
            const token = await fetchRemainingResets(attempts || 1);
            cachedResetToken = token;
            lastResetFetchAt = Date.now();
            return cachedResetToken;
        } catch (e) {
            console.warn('[GrokQuotaPro] remaining resets fetch failed:', e);
            if (cachedResetToken && cachedResetToken.validityEnd
                && cachedResetToken.validityEnd.getTime() > Date.now()) {
                return cachedResetToken;
            }
            cachedResetToken = null;
            return null;
        }
    }

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    function clearStartupRetry() {
        if (startupRetryTimer) {
            clearTimeout(startupRetryTimer);
            startupRetryTimer = null;
        }
    }

    /**
     * Cold-start bootstrap: wait for page/session, retry GetGrokCreditsConfig
     * several times. Keeps "Loading…" instead of flashing permanent failure.
     */
    async function bootstrapWeeklyUsage() {
        if (bootstrapDone && cachedWeeklyUsage) return cachedWeeklyUsage;

        // Let SPA + auth cookies settle (common cause of first-hit failure)
        if (document.readyState !== 'complete') {
            await new Promise(resolve => {
                if (document.readyState === 'complete') return resolve();
                window.addEventListener('load', resolve, { once: true });
                // Fallback if load already fired or hangs
                setTimeout(resolve, STARTUP_DELAY_MS);
            });
        }
        await sleep(STARTUP_DELAY_MS);

        for (let i = 0; i < STARTUP_RETRY_DELAYS_MS.length; i++) {
            // Intercept / parallel refresh may have filled cache mid-bootstrap
            if (bootstrapDone && cachedWeeklyUsage
                && typeof cachedWeeklyUsage.usagePercent === 'number') {
                return cachedWeeklyUsage;
            }
            if (i > 0) await sleep(STARTUP_RETRY_DELAYS_MS[i]);
            // Keep loading hint visible during retries (do not paint empty/fail yet)
            const body = getPanel()?.querySelector('.pbody');
            if (body && !hasRenderedContent) {
                body.innerHTML = `<div class="loading">${L.loading}</div>`;
            }
            const raw = await fetchWeeklyUsage(true, { attempts: 2 });
            if (raw && typeof raw.usagePercent === 'number') {
                return raw;
            }
        }
        return (cachedWeeklyUsage && typeof cachedWeeklyUsage.usagePercent === 'number')
            ? cachedWeeklyUsage
            : null;
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

    function formatResetExpiryDate(date) {
        if (!date) return '';
        const d = date instanceof Date ? date : new Date(date);
        if (!Number.isFinite(d.getTime())) return '';
        return d.toLocaleDateString(LANG === 'zh' ? 'zh-CN' : undefined, {
            month: 'short', day: 'numeric',
        });
    }

    function liveResetToken() {
        const t = cachedResetToken;
        if (!t || !t.tokenId) return null;
        if (t.validityEnd && t.validityEnd.getTime() <= Date.now()) return null;
        return t;
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
    function buildUsageSection(usage, sub) {
        let html = `<div class="gqp-section gqp-usage-sec"><div class="gqp-sec-title">${L.usageTitle}</div>`;
        if (!usage || typeof usage.percent !== 'number') {
            // Free / guest: soft empty card; paid: retry hint
            html += `<div class="gqp-usage-card gqp-usage-empty">`;
            html += `<div class="gqp-hint" style="padding:2px 0;font-style:normal;line-height:1.45">${usageEmptyHint(sub)}</div>`;
            html += `</div></div>`;
            return html;
        }
        const pct = usage.percent;
        const remaining = usage.remaining != null ? usage.remaining : Math.max(0, 100 - pct);
        const cls = pct >= 90 ? 'c-danger' : pct >= 70 ? 'c-warn' : 'c-ok';
        const remainHint = formatResetRemaining(usage.resetIso);

        html += `<div class="gqp-usage-card">`;
        // Big remaining + used summary (like Grok SuperGrok weekly limit header)
        html += `<div class="gqp-usage-hero">`;
        html += `<div class="gqp-usage-big ${cls}">${remaining}<span class="gqp-usage-unit">%</span></div>`;
        html += `<div class="gqp-usage-hero-meta">`;
        html += `<div class="gqp-usage-hero-label">${L.remainLabel}</div>`;
        html += `<div class="gqp-usage-hero-sub">${pct}% ${L.usedLabel}</div>`;
        html += `</div></div>`;

        // Match Grok official usage bar DOM:
        // flex h-5 w-full gap-px | segments width:% electric-blue / opacity | flex-1 remainder track
        const products = (usage.productUsage || []).filter(p => (p.usagePercent || 0) > 0)
            .sort((a, b) => (b.usagePercent || 0) - (a.usagePercent || 0));
        const nSeg = products.length || (pct > 0 ? 1 : 0);
        html += `<div class="gqp-progress" title="${pct}% ${L.usedLabel}">`;
        if (products.length > 0) {
            products.forEach((p, i) => {
                const alpha = SEGMENT_OPACITIES[Math.min(i, SEGMENT_OPACITIES.length - 1)];
                const name = PRODUCT_NAMES[p.product] || `P${p.product}`;
                const isFirst = i === 0;
                const isLastUsed = i === products.length - 1 && pct >= 100;
                let rad = 'gqp-seg-mid';
                if (isFirst && isLastUsed) rad = 'gqp-seg-only';
                else if (isFirst) rad = 'gqp-seg-start';
                else if (isLastUsed) rad = 'gqp-seg-end';
                html += `<div class="gqp-product-seg ${rad}" style="width:${p.usagePercent}%;background-color:${electricBlue(alpha)}" title="${name}: ${p.usagePercent}%"></div>`;
            });
        } else if (pct > 0) {
            const rad = pct >= 100 ? 'gqp-seg-only' : 'gqp-seg-start';
            html += `<div class="gqp-product-seg ${rad}" style="width:${pct}%;background-color:${electricBlue(1)}"></div>`;
        }
        // Unused remainder (official: flex-1 bg-surface-l3 rounded-l-sm rounded-r-md)
        if (pct < 100) {
            const remRad = nSeg === 0 ? 'gqp-seg-only' : 'gqp-seg-rest';
            html += `<div class="gqp-progress-rest ${remRad}"></div>`;
        }
        html += `</div>`;

        if (products.length > 0) {
            html += `<div class="gqp-products">`;
            products.forEach((p, i) => {
                const alpha = SEGMENT_OPACITIES[Math.min(i, SEGMENT_OPACITIES.length - 1)];
                const color = electricBlue(alpha);
                const name = PRODUCT_NAMES[p.product] || `P${p.product}`;
                html += `<div class="gqp-product-item"><span class="gqp-dot" style="background:${color}"></span>`;
                html += `<span class="gqp-product-name">${name}</span><span class="gqp-product-pct">${p.usagePercent}%</span></div>`;
            });
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

    function buildResetSection() {
        const tok = liveResetToken();
        if (!tok) return '';
        const exp = tok.validityEnd ? formatResetExpiryDate(tok.validityEnd) : '';
        const soon = !!(tok.validityEnd && (tok.validityEnd.getTime() - Date.now()) < 3 * 86400000);
        const countHint = tok.availableCount > 1
            ? ` · ${tok.availableCount}`
            : '';
        const btnLabel = isRedeemingReset ? L.resetRedeeming : L.resetRedeem;
        let html = `<div class="gqp-section gqp-reset-sec"><div class="gqp-sec-title" title="${L.resetInfo}">${L.resetTitle}</div>`;
        html += `<div class="gqp-reset-card">`;
        html += `<div class="gqp-reset-meta">`;
        html += `<div class="gqp-reset-avail">${L.resetAvailable}${countHint}</div>`;
        if (exp) html += `<div class="gqp-reset-exp${soon ? ' gqp-reset-exp-soon' : ''}">${L.resetExpires(exp)}</div>`;
        html += `</div>`;
        html += `<button type="button" id="gqp-redeem" class="gqp-redeem"${isRedeemingReset ? ' disabled' : ''}>${btnLabel}</button>`;
        html += `</div></div>`;
        return html;
    }

    function buildModelSection(snap, sub) {
        const s = sub || { canUseHeavy: false };
        const active = (snap && snap.category) || 'expert';
        const rk = requestKindLabel(snap && snap.requestKind);

        let html = `<div class="gqp-section gqp-model-sec"><div class="gqp-sec-title">${L.modelTitle}</div>`;
        html += `<div class="gqp-chip-row">`;
        for (const chip of MODEL_CHIPS) {
            const isHeavy = chip.kind === 'heavy';
            const locked = isHeavy && !s.canUseHeavy;
            const isOn = chip.kind === active && !locked;
            let cls = 'gqp-chip';
            if (isOn) cls += ' gqp-chip-on';
            if (locked) cls += ' gqp-chip-locked';
            const title = locked ? L.unlockHeavy : (isOn ? (rk || L.active) : chip.short);
            html += `<div class="${cls}" data-kind="${chip.kind}" title="${title}">${chip.short}</div>`;
        }
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
        p.classList.toggle('min', !!cfg.minimized);
        const body = p.querySelector('.pbody');
        if (body) body.style.display = cfg.minimized ? 'none' : '';
        const footer = p.querySelector('.pfooter');
        if (footer) footer.style.display = cfg.minimized ? 'none' : '';
        const btn = p.querySelector('#gqp-min');
        if (btn) btn.textContent = cfg.minimized ? '+' : '\u2212';
        updateMiniMeter();
    }

    function updateMiniMeter() {
        const el = getPanel()?.querySelector('#gqp-mini');
        if (!el) return;
        const u = lastUiUsage || normalizeWeeklyForUi(cachedWeeklyUsage);
        if (!u || typeof u.remaining !== 'number') {
            el.innerHTML = `<span class="gqp-mini-cap" title="${L.usageEmpty}"><span class="gqp-mini-pct">—</span></span>`;
            return;
        }
        const rem = Math.max(0, Math.min(100, u.remaining));
        const used = u.percent;
        const cls = used >= 90 ? 'c-danger' : used >= 70 ? 'c-warn' : 'c-ok';
        const tip = `${rem}% ${L.remainLabel} · ${used}% ${L.usedLabel}`;
        el.innerHTML = `<span class="gqp-mini-cap ${cls}" title="${tip}"><span class="gqp-mini-fill" style="width:${rem}%"></span><span class="gqp-mini-pct">${rem}%</span></span>`;
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
        body.innerHTML = buildUsageSection(u, s) + buildResetSection() + buildModelSection(m, s);
        hasRenderedContent = true;
        updateMiniMeter();
        if (timestamp) updateFooter(timestamp);
        else if (!silent) updateFooter(Date.now());
    }

    async function handleRedeemReset() {
        const tok = liveResetToken();
        if (!tok || isRedeemingReset) return;
        if (!window.confirm(L.resetConfirm)) return;
        isRedeemingReset = true;
        updateContent({ silent: true });
        try {
            const leftover = await redeemUsageReset(tok.tokenId);
            cachedResetToken = leftover;
            lastResetFetchAt = Date.now();
            // Official UI waits ~2s for usage pool to refresh
            await sleep(2000);
            await fetchWeeklyUsage(true, { attempts: 2 });
            isRedeemingReset = false;
            updateContent({
                usage: normalizeWeeklyForUi(cachedWeeklyUsage),
                timestamp: Date.now(),
                silent: true,
            });
            const footer = getPanel()?.querySelector('.pfooter');
            if (footer) {
                footer.innerHTML = `<span>${L.resetOk}</span><span class="fver">v${VERSION}</span>`;
                setTimeout(() => updateFooter(Date.now()), 4000);
            }
            return;
        } catch (e) {
            console.warn('[GrokQuotaPro] redeem reset failed:', e);
            alert(L.resetFail);
        } finally {
            isRedeemingReset = false;
        }
        updateContent({ silent: true });
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
     * @param {{ silent?: boolean, bootstrap?: boolean }} opts
     *   silent    — never blank the panel (default once content exists)
     *   bootstrap — cold-start wait + multi-retry (first open only)
     */
    async function refreshData(forceWeekly, opts) {
        const silent = !!(opts && opts.silent) || hasRenderedContent;
        const useBootstrap = !!(opts && opts.bootstrap) && !bootstrapDone;
        const p = getPanel();
        if (!p || isRefreshing) return;
        isRefreshing = true;
        setRefreshSpinning(true);

        const body = p.querySelector('.pbody');
        // Only show loading on first paint when we have nothing to display
        if ((!silent || useBootstrap) && body && !hasRenderedContent) {
            body.innerHTML = `<div class="loading">${L.loading}</div>`;
        }

        try {
            let rawWeekly;
            if (useBootstrap) {
                rawWeekly = await bootstrapWeeklyUsage();
            } else {
                rawWeekly = await fetchWeeklyUsage(!!forceWeekly, {
                    attempts: forceWeekly ? 2 : 1,
                });
            }

            // Intercept may have filled cache while we were waiting
            if (!rawWeekly && cachedWeeklyUsage) rawWeekly = cachedWeeklyUsage;

            const usage = normalizeWeeklyForUi(rawWeekly);
            const sub = detectSubscription();
            updateBadge(sub);
            const snap = getModelSnapshot();

            if (usage) {
                clearStartupRetry();
                bootstrapDone = true;
                updateContent({ usage, sub, snap, timestamp: Date.now(), silent: true });
            } else if (hasRenderedContent) {
                // Keep previous good UI; only refresh model chips / badge
                updateContent({ sub, snap, silent: true });
            } else {
                // Soft empty by tier: Free/Guest stop retrying; paid can late-retry once
                updateContent({ usage: null, sub, snap, timestamp: Date.now(), silent: true });
                if (!sub.hasWeeklyPool) {
                    bootstrapDone = true;
                    clearStartupRetry();
                } else if (!startupRetryTimer && !bootstrapDone) {
                    startupRetryTimer = setTimeout(() => {
                        startupRetryTimer = null;
                        if (!bootstrapDone) {
                            refreshData(true, { silent: true, bootstrap: true });
                        }
                    }, 8000);
                }
            }
        } catch (e) {
            console.warn('[GrokQuotaPro] refreshData error:', e);
            // Avoid permanent "加载失败" after a single early miss
            if (!hasRenderedContent) {
                const sub = detectSubscription();
                const snap = getModelSnapshot();
                updateContent({ usage: null, sub, snap, timestamp: Date.now(), silent: true });
                if (!sub.hasWeeklyPool) {
                    bootstrapDone = true;
                    clearStartupRetry();
                } else if (!startupRetryTimer) {
                    startupRetryTimer = setTimeout(() => {
                        startupRetryTimer = null;
                        refreshData(true, { silent: true, bootstrap: true });
                    }, 2500);
                }
            }
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
                // Ensure weekly poll is running (init may have started it already)
                if (!pollInterval) startPolling();
            } else if (!qb && queryBarElement) {
                queryBarElement = null;
                if (queryBarObserver) { queryBarObserver.disconnect(); queryBarObserver = null; }
                // Keep weekly usage polling even without query bar
            }
        });
        if (document.body) {
            domObserver.observe(document.body, { childList: true, subtree: true });
        }
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
        if (!document.body) return;
        const sub = detectSubscription();
        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML = `
            <div class="pheader">
                <span class="badge" style="background:${sub.color}">${sub.tier}</span>
                <div class="pmini" id="gqp-mini"></div>
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
        panel.addEventListener('click', (e) => {
            const btn = e.target && e.target.closest ? e.target.closest('#gqp-redeem') : null;
            if (btn) handleRedeemReset();
        });
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
        if (!getPanel()) return; // body not ready yet

        // Weekly poll always on (does not require query bar)
        startPolling();

        // Query bar: model chips only
        const qb = getQueryBar();
        if (qb) {
            queryBarElement = qb;
            setupQueryBarObserver();
        }

        setupDomObserver();
        setupVisibilityHandler();

        // First open: delayed multi-retry bootstrap (avoids early "load failed")
        const body = getPanel()?.querySelector('.pbody');
        if (body) body.innerHTML = `<div class="loading">${L.loading}</div>`;
        refreshData(true, { bootstrap: true, silent: false });
    }

    // ─── Styles ───
    GM_addStyle(`
        /* Dark (default) — grok.com surface layers */
        #${PANEL_ID}{
            --bg:#0c0c0e;--bg2:#121214;--bg3:#1c1c1f;--border:#2a2a30;
            --text:#f4f4f5;--sub:#a1a1aa;--hint:#71717a;
            --track:#3f3f46;--ok:#4ade80;--warn:#fbbf24;--danger:#fb7185;--active:#e4e4e7;
            /* usage card (dark elevated surface, not forced light) */
            --card-bg:#26262b;--card-text:#f4f4f5;--card-sub:#a1a1aa;--card-hint:#8b8b93;
            --card-track:#3f3f46;--card-line:#3f3f46;--card-pct:#d4d4d8;
            --chip-bg:rgba(255,255,255,.04);--chip-border:rgba(255,255,255,.08);--chip-hover:rgba(255,255,255,.07);
            --chip-on-bg:rgba(255,255,255,.1);--chip-on-text:#e4e4e7;--chip-on-border:rgba(255,255,255,.18);
            position:fixed;bottom:16px;right:16px;z-index:999999;
            font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',sans-serif;font-size:12.5px;
            min-width:268px;max-width:300px;background:var(--bg);color:var(--text);
            border:1px solid var(--border);border-radius:16px;
            box-shadow:0 12px 32px rgba(0,0,0,.08),0 0 0 1px rgba(0,0,0,.04);
            overflow:hidden;user-select:none
        }
        /* Light — official #f2f2f2 card surface */
        #${PANEL_ID}.light{
            --bg:#ffffff;--bg2:#f7f7f8;--bg3:#efeff1;--border:#e4e4e7;
            --text:#18181b;--sub:#52525b;--hint:#a1a1aa;
            --track:#e5e5e5;--ok:#16a34a;--warn:#d97706;--danger:#e11d48;--active:#18181b;
            --card-bg:#f2f2f2;--card-text:#0a0a0a;--card-sub:#525252;--card-hint:#737373;
            --card-track:#e5e5e5;--card-line:#e5e5e5;--card-pct:#404040;
            --chip-bg:#f2f2f2;--chip-border:#e8e8e8;--chip-hover:#ebebeb;
            --chip-on-bg:#e8e8e8;--chip-on-text:#18181b;--chip-on-border:#d4d4d4
        }
        #${PANEL_ID} .pheader{display:flex;align-items:center;justify-content:space-between;padding:10px 12px 9px;background:var(--bg2);border-bottom:1px solid var(--border);gap:8px}
        #${PANEL_ID}.min .pheader{border-bottom:none;padding:7px 10px}
        #${PANEL_ID} .badge{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;font-size:11.5px;font-weight:600;color:#fff;opacity:.95;flex-shrink:0}
        #${PANEL_ID}.min .badge{display:none}
        #${PANEL_ID}.min .pmini{justify-content:flex-start}
        #${PANEL_ID}.min .gqp-mini-cap{width:100%;max-width:none}
        #${PANEL_ID} .pmini{display:none;flex:1;align-items:center;justify-content:center;min-width:0}
        #${PANEL_ID}.min .pmini{display:flex}
        #${PANEL_ID} .gqp-mini-cap{position:relative;display:inline-flex;align-items:center;justify-content:center;min-width:56px;height:20px;padding:0 10px;border-radius:999px;overflow:hidden;background:var(--chip-bg);border:1px solid var(--chip-border)}
        #${PANEL_ID} .gqp-mini-fill{position:absolute;inset:0 auto 0 0;height:100%;pointer-events:none;opacity:.28;transition:width .3s ease}
        #${PANEL_ID} .gqp-mini-cap.c-ok .gqp-mini-fill{background:var(--ok)}
        #${PANEL_ID} .gqp-mini-cap.c-warn .gqp-mini-fill{background:var(--warn)}
        #${PANEL_ID} .gqp-mini-cap.c-danger .gqp-mini-fill{background:var(--danger)}
        #${PANEL_ID} .gqp-mini-pct{position:relative;z-index:1;font-family:inherit;font-size:11.5px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:.02em;line-height:1;-webkit-font-smoothing:antialiased}
        #${PANEL_ID} .hbtns{display:flex;gap:2px}
        #${PANEL_ID} button{background:transparent;color:var(--sub);border:none;padding:3px 7px;border-radius:8px;font-size:13px;cursor:pointer}
        #${PANEL_ID} button:hover{background:var(--bg3);color:var(--text)}
        #${PANEL_ID} button:disabled{opacity:.55;cursor:default}
        #${PANEL_ID} #gqp-refresh.gqp-spin{animation:gqp-spin 0.8s linear infinite}
        @keyframes gqp-spin{to{transform:rotate(360deg)}}
        #${PANEL_ID} .pbody{padding:11px 12px 9px}
        #${PANEL_ID} .loading{padding:10px 2px;color:var(--hint);font-size:12.5px}
        #${PANEL_ID} .gqp-section{margin-bottom:10px}
        #${PANEL_ID} .gqp-section:last-child{margin-bottom:2px}
        #${PANEL_ID} .gqp-sec-title{font-size:10.5px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--hint);margin-bottom:7px;padding-left:1px}
        #${PANEL_ID} .gqp-hint{font-size:10.5px;color:var(--hint);font-style:italic}
        #${PANEL_ID} .c-ok{color:var(--ok)} #${PANEL_ID} .c-warn{color:var(--warn)} #${PANEL_ID} .c-danger{color:var(--danger)}

        /* Weekly usage card — theme-aware surface */
        #${PANEL_ID} .gqp-usage-card{background:var(--card-bg);border-radius:12px;padding:12px 14px;border:1px solid var(--card-line);color:var(--card-text)}
        #${PANEL_ID} .gqp-usage-hero{display:flex;align-items:center;gap:12px;margin-bottom:10px}
        #${PANEL_ID} .gqp-usage-big{font-family:ui-monospace,SF Mono,Menlo,Consolas,monospace;font-size:28px;font-weight:700;line-height:1;letter-spacing:-0.03em}
        #${PANEL_ID} .gqp-usage-unit{font-size:14px;font-weight:600;margin-left:1px;opacity:.8}
        #${PANEL_ID} .gqp-usage-hero-label{font-size:12px;font-weight:600;color:var(--card-text)}
        #${PANEL_ID} .gqp-usage-hero-sub{font-size:11px;color:var(--card-hint);margin-top:2px}

        /* Official Grok usage bar */
        #${PANEL_ID} .gqp-progress{display:flex;align-items:stretch;width:100%;height:20px;gap:1px}
        #${PANEL_ID} .gqp-product-seg{height:100%;min-width:2px;flex-shrink:0;transition:width .3s ease}
        #${PANEL_ID} .gqp-progress-rest{flex:1;min-width:2px;background:var(--card-track);transition:flex .3s ease}
        #${PANEL_ID} .gqp-seg-start{border-radius:6px 2px 2px 6px}
        #${PANEL_ID} .gqp-seg-mid{border-radius:2px}
        #${PANEL_ID} .gqp-seg-end{border-radius:2px 6px 6px 2px}
        #${PANEL_ID} .gqp-seg-rest{border-radius:2px 6px 6px 2px}
        #${PANEL_ID} .gqp-seg-only{border-radius:6px}

        #${PANEL_ID} .gqp-products{display:grid;grid-template-columns:1fr 1fr;gap:5px 12px;margin-top:10px}
        #${PANEL_ID} .gqp-product-item{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--card-hint);min-width:0}
        #${PANEL_ID} .gqp-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
        #${PANEL_ID} .gqp-product-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        #${PANEL_ID} .gqp-product-pct{margin-left:auto;font-weight:600;color:var(--card-pct);font-variant-numeric:tabular-nums}
        #${PANEL_ID} .gqp-reset-line{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:10px;padding-top:8px;border-top:1px solid var(--card-line);font-size:10.5px;color:var(--card-hint)}
        #${PANEL_ID} .gqp-reset-eta{color:var(--card-sub);font-weight:500;white-space:nowrap}
        #${PANEL_ID} .gqp-usage-card .gqp-hint{color:var(--card-hint)}

        #${PANEL_ID} .gqp-reset-card{display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--card-bg);border:1px solid var(--card-line);border-radius:12px;padding:10px 12px}
        #${PANEL_ID} .gqp-reset-meta{min-width:0}
        #${PANEL_ID} .gqp-reset-avail{font-size:12.5px;font-weight:600;color:var(--card-text)}
        #${PANEL_ID} .gqp-reset-exp{font-size:11px;color:var(--card-hint);margin-top:2px}
        #${PANEL_ID} .gqp-reset-exp-soon{color:var(--warn)}
        #${PANEL_ID} .gqp-redeem{flex-shrink:0;background:var(--text)!important;color:var(--bg)!important;border:none;padding:6px 11px;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer}
        #${PANEL_ID} .gqp-redeem:hover{opacity:.9}
        #${PANEL_ID} .gqp-redeem:disabled{opacity:.55;cursor:default}

        /* Model chips — theme-aware pills */
        #${PANEL_ID} .gqp-chip-row{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}
        #${PANEL_ID} .gqp-chip{display:flex;align-items:center;justify-content:center;box-sizing:border-box;height:20px;padding:0 6px;border-radius:999px;font-size:11px;line-height:18px;font-weight:500;letter-spacing:.01em;color:var(--hint);background:var(--chip-bg);border:1px solid var(--chip-border);transition:background .15s,color .15s,border-color .15s}
        #${PANEL_ID} .gqp-chip:hover{background:var(--chip-hover);color:var(--sub)}
        /* Selected: subtle lift only (no inverted high-contrast pill) */
        #${PANEL_ID} .gqp-chip-on{color:var(--chip-on-text);background:var(--chip-on-bg);border-color:var(--chip-on-border);font-weight:600}
        #${PANEL_ID} .gqp-chip-locked{opacity:.35;pointer-events:none}

        #${PANEL_ID} .pfooter{padding:6px 12px;font-size:10.5px;color:var(--hint);background:var(--bg2);border-top:1px solid var(--border);display:flex;justify-content:space-between}
        #${PANEL_ID} .fver{opacity:.45}
    `);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
