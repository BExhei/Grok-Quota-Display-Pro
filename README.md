# Grok Quota Display Pro

在 [grok.com](https://grok.com) 右下角显示 **每周用量**、**一键重置额度**，以及当前模型（**自动 / 快速 / 专家 / 构建 / 重度**）。适用于 Tampermonkey / Violentmonkey。

A Tampermonkey / Violentmonkey userscript for [grok.com](https://grok.com): floating panel with **weekly usage**, **one-click usage-limit reset**, and **current model** chips for **Auto / Fast / Expert / Build / Heavy**. SuperGrok Lite / SuperGrok / SuperGrok Plus / SuperGrok Heavy.

[![Version](https://img.shields.io/badge/version-3.1.0-blue)](.)
[![Language](https://img.shields.io/badge/language-zh--CN%20%7C%20zh--TW%20%7C%20en-brightgreen)](.)
[![License](https://img.shields.io/badge/license-GPL--3.0-orange)](https://www.gnu.org/licenses/gpl-3.0.html)

**Repository**: https://github.com/BExhei/Grok-Quota-Display-Pro  
**Greasy Fork**: https://greasyfork.org/zh-CN/scripts/578827-grok-quota-display-pro  
**Feedback**: https://greasyfork.org/zh-CN/scripts/578827-grok-quota-display-pro/feedback

[简体中文](#中文) · [English](#english)

---

## 中文

### 3.1.0 更新

- **当前模型**增加 **构建 (Build)**，芯片顺序：自动 · 快速 · 专家 · **构建** · 重度
- 浮窗挂在 `<html>` 的 Shadow DOM 上，避免 grok.com React 二次渲染把面板冲掉
- 拖拽移动外层固定宿主，位置会记住；点击、拖拽、刷新不再让窗口消失
- 脚本名称 / 简介支持简体、繁体、英文（`zh` / `zh-CN` / `zh-HK` / `zh-SG` / `zh-TW` / `en`）

### 套餐

| 套餐 | 每周用量条 | 重度芯片 |
|------|------------|----------|
| **免费 / 游客** | 说明没有每周共享额度 | 锁定 |
| **SuperGrok Lite** | 完整剩余 % + 分类段 | 锁定 |
| **SuperGrok** | 完整剩余 % + 分类段 | 锁定 |
| **SuperGrok Plus** | 完整剩余 % + 分类段 | 锁定 |
| **SuperGrok Heavy** | 完整剩余 % + 分类段 | 解锁 |

### 每周用量

- 有每周池的套餐通过 `GetGrokCreditsConfig`（grpc-web / protobuf）拉取数据
- 大号 **剩余 %** + 已用 %
- 进度条对齐官方样式：`flex` + `gap-px`，电光蓝（`#1a5eff` / 透明度 `1 → 0.7 → 0.45…`），未用段 `flex-1`
- 分类明细（聊天 / Imagine / API / Grok Build / 语音 / 插件 / …）
- 重置时间 + 相对倒计时

### 用量限额重置

- 官方发放一次性周重置时，显示 **重置可用** 卡片
- **兑换**走与设置 → 用量相同的接口（`GetRemainingResets` / `RedeemReset`）
- 兑换前浏览器确认（重置不可叠加，兑换即消耗）
- 兑换成功后自动刷新每周用量

### 当前模型

- 横向胶囊：**自动 · 快速 · 专家 · 构建 · 重度**
- 选中态轻量高亮（不反色）
- 重度仅 SuperGrok Heavy 解锁

### 最小化

- 收起展开卡片和套餐徽章
- 左侧紧凑 **已用 %** 胶囊（与官方用量条同义）
- 数字和半透明填充都表示已用（例如已用 63% → 显示 `63%` 且填充 63%）
- 悬停仍显示已用 + 剩余
- 按用量阶段变色（正常 / 警告 / 危险）

### 稳定性与交互

- **静默刷新**：首次渲染后不再闪「加载中…」，⟳ 只转圈
- **启动重试**：等待页面 / 登录态，多次重试，避免第一次打开失败
- 拦截页面自己的 `GetGrokCreditsConfig` / `GetRemainingResets`
- 每周网络轮询 **5 分钟**；模型芯片本地更新
- 发送消息约 4 秒后安静强制刷新
- 明暗主题；浮窗可拖、位置会保存

### 已移除 / 不再作为主数据源

- 短期按模型限流行（`POST /rest/rate-limits` 不再是主界面）
- 旧版 SuperGrok「免费积分」页面刮字
- 芯片下方多余的模型名行（胶囊已表示当前分类）

### 功能一览

| 区块 | 内容 |
|------|------|
| **每周用量** | 剩余 / 已用 %、分段条、分类、重置时间 |
| **用量限额重置** | 重置可用卡片 + 兑换（先确认） |
| **当前模型** | 自动 / 快速 / 专家 / 构建 / 重度 |
| **套餐徽章** | SuperGrok Lite / SuperGrok / SuperGrok Plus / SuperGrok Heavy 等 |
| **面板** | 拖标题栏 · ⟳ 刷新 · ☀️/🌙 主题 · −/+ 最小化 |

### 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)。
2. 从 [Greasy Fork](https://greasyfork.org/zh-CN/scripts/578827-grok-quota-display-pro) 安装，或把 `grok-quota-display-pro.js` 粘进新脚本。
3. 登录后打开 https://grok.com ，面板出现在右下角。

**说明**：每周池数字出现在 **SuperGrok Lite / SuperGrok / SuperGrok Plus / SuperGrok Heavy**。免费账户仍有面板和模型芯片，并有明确的免费套餐提示。付费数据为空时，点 ⟳ 或打开 **设置 → 用量**。

### 使用

1. 打开 [grok.com](https://grok.com)。
2. 面板显示套餐徽章、每周用量、重置（如有）和当前模型。
3. 在 Grok 选择器里换模型，芯片会本地更新，不闪网络加载。
4. 有重置时点 **兑换** 并确认，即可清空本周用量。
5. 拖标题栏移动；可切换主题 / 最小化。最小化是紧凑的 **已用 %** 胶囊。

### 技术说明

#### 每周用量 API

```
POST /grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig
content-type: application/grpc-web+proto
x-grpc-web: 1
```

解析 `usagePercent`、`productUsage[]`、`currentPeriod.start/end`。

#### 用量限额重置 API

```
POST /prod_mc_billing.ConsumerUiSvc/GetRemainingResets
POST /prod_mc_billing.ConsumerUiSvc/RedeemReset
content-type: application/grpc-web+proto
x-grpc-web: 1
```

读取剩余重置 token（`tokenId`、`validityEnd`），确认后兑换。

#### 刷新策略

| 触发 | 行为 |
|------|------|
| 首次打开 | 启动：等待加载 + 多次重试 |
| 每 5 分钟 | 静默刷新每周用量 + 重置 token（标签页可见时） |
| 切换模型 | 仅本地更新芯片 |
| 发送后 | 约 4 秒后静默强制刷新 |
| 手动 ⟳ | 强制拉取每周用量 + 重置 |
| 兑换 | 确认 → RedeemReset → 刷新每周用量 |
| 标签页隐藏 | 暂停轮询 |

#### 语言

界面按 `navigator.language` 自动中 / 英。脚本头名称和简介另有 zh-CN / zh-TW 等本地化。

#### 隐私

只在你的浏览器里跑。不连第三方服务器。使用 grok.com 当前登录 cookie。

### 开发

源文件：`grok-quota-display-pro.js`

### 许可

GPL-3.0 — [BExhei/Grok-Quota-Display-Pro](https://github.com/BExhei/Grok-Quota-Display-Pro)

---

## English

### What's New (v3.1.0)

- **Current model** chips now include **Build**, in order: Auto · Fast · Expert · **Build** · Heavy
- Panel lives in a Shadow DOM host on `<html>`, so React remounts on grok.com no longer wipe the floating window
- Drag moves the fixed host (position is saved); click / drag / refresh no longer make the panel vanish
- Script name / description localized for Simplified Chinese, Traditional Chinese, and English (`zh` / `zh-CN` / `zh-HK` / `zh-SG` / `zh-TW` / `en`)

### Tiers

| Tier | Weekly pool bar | Heavy chip |
|------|-----------------|------------|
| **Free / Guest** | Explains no weekly shared pool | Locked |
| **SuperGrok Lite** | Full weekly % + product segments | Locked |
| **SuperGrok** | Full weekly % + product segments | Locked |
| **SuperGrok Plus** | Full weekly % + product segments | Locked |
| **SuperGrok Heavy** | Full weekly % + product segments | Unlocked |

### Weekly usage

- Fetches data via `GetGrokCreditsConfig` (grpc-web / protobuf) when the plan has a weekly pool
- Large **remaining %** + used %
- Progress bar matches official markup: `flex` + `gap-px`, **electric blue** (`#1a5eff` / opacity steps `1 → 0.7 → 0.45…`), unused track `flex-1`
- Product breakdown (Chat / Imagine / API / Grok Build / Voice / Plugins / …)
- Reset time + relative countdown

### Usage-limit reset

- Shows the official **Reset Available** card when Grok grants a one-time weekly reset
- **Redeem** uses the same APIs as Settings → Usage (`GetRemainingResets` / `RedeemReset`)
- Browser confirm before redeeming (resets do not stack; the token is consumed)
- After a successful redeem, weekly usage refreshes automatically

### Current model

- Horizontal pills: **Auto · Fast · Expert · Build · Heavy**
- Subtle selected state (no harsh invert)
- Heavy only for SuperGrok Heavy accounts

### Minimized mode

- Hides the expanded card and tier badge
- Compact **used-%** capsule on the left (same meaning as the official usage bar)
- Number and translucent fill both show **used** (e.g. 63% used → `63%` and a 63% fill)
- Hover tooltip still lists used + remaining
- Fill and text change color by usage stage (ok / warn / danger)

### Reliability & UX

- **Silent refresh** — no “Loading…” flash after first paint; ⟳ only spins
- **Startup bootstrap** — wait for page/session, multi-retry (avoids first-open failure)
- Intercepts page `GetGrokCreditsConfig` / `GetRemainingResets` when Grok loads them
- Weekly network poll every **5 minutes**; model chips update locally
- After send: quiet force-refresh ~4s later
- **Theme-aware** light / dark; panel can be dragged and the position is remembered

### Removed / deprecated

- Short-term per-model rate-limit rows (`POST /rest/rate-limits` no longer the main UI)
- Old SuperGrok “free points” text scraping as primary source
- Extra model-name line under the chips (the pills already show the active category)

### Features

| Section | Content |
|--------|---------|
| **Weekly usage** | Remaining / used %, segmented bar, categories, reset time |
| **Usage-limit reset** | Reset Available card + Redeem (confirm first) |
| **Current model** | Auto / Fast / Expert / Build / Heavy chips |
| **Tier badge** | SuperGrok Lite / SuperGrok / SuperGrok Plus / SuperGrok Heavy, etc. |
| **Panel** | Drag header · ⟳ refresh · ☀️/🌙 theme · −/+ minimize |

### Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Install from [Greasy Fork](https://greasyfork.org/zh-CN/scripts/578827-grok-quota-display-pro), or copy `grok-quota-display-pro.js` into a new userscript.
3. Open https://grok.com while logged in — the panel appears bottom-right.

**Tip**: Weekly pool numbers appear on **SuperGrok Lite / SuperGrok / SuperGrok Plus / SuperGrok Heavy**. Free accounts still get the panel and model chips, with a clear free-tier message. If paid data is empty, click ⟳ or open **Settings → Usage**.

### Usage

1. Open [grok.com](https://grok.com).
2. Panel shows tier badge, weekly usage, reset (if available), and current model.
3. Switch model in Grok’s selector — chips update without a network flash.
4. If a reset is available, click **Redeem** and confirm to clear this week’s pool.
5. Drag the header to move; use theme / minimize as needed. Minimized view is a compact **used-%** capsule aligned with the official usage bar.

### Technical Notes

#### Weekly usage API

```
POST /grok_api_v2.GrokBuildBilling/GetGrokCreditsConfig
content-type: application/grpc-web+proto
x-grpc-web: 1
```

Parses `usagePercent`, `productUsage[]`, `currentPeriod.start/end`.

#### Usage-limit reset API

```
POST /prod_mc_billing.ConsumerUiSvc/GetRemainingResets
POST /prod_mc_billing.ConsumerUiSvc/RedeemReset
content-type: application/grpc-web+proto
x-grpc-web: 1
```

Reads remaining reset tokens (`tokenId`, `validityEnd`) and redeems with confirmation.

#### Refresh strategy

| Trigger | Behavior |
|--------|----------|
| First open | Bootstrap: load wait + multi-retry |
| Every 5 min | Silent weekly + reset-token refresh (tab visible) |
| Model change | Local chip update only |
| After send | Silent force refresh ~4s |
| Manual ⟳ | Force weekly + reset fetch |
| Redeem | Confirm → RedeemReset → refresh weekly usage |
| Tab hidden | Polling paused |

#### Language

UI auto **Chinese / English** from `navigator.language`. Script metadata also ships zh-CN / zh-TW (and related) names and descriptions.

#### Privacy

Runs only in your browser. No third-party servers. Uses your grok.com session cookies.

### Development

Single source file: `grok-quota-display-pro.js`

### License

GPL-3.0 — [BExhei/Grok-Quota-Display-Pro](https://github.com/BExhei/Grok-Quota-Display-Pro)
