防御研究用途·私有自用 / Defensive research, private self-use

[PRIVATE]

# VPS Guard / VPS Guard

VPS 入侵防御系统：实时监控 auth.log 与 nginx 日志，自动封禁攻击 IP，Telegram 战报播报，PIN 门禁作战面板。
VPS intrusion-defense system: tails auth.log and nginx logs in real time, auto-bans attacking IPs, sends Telegram threat reports, and gates a live ops dashboard behind a PIN.

## 技术栈 / Stack

- 前端 / Frontend：React 19 + TypeScript + Vite，Tailwind CSS v4
- 后端 / Backend：Node.js + Express + WebSocket（`ws`）
- 通知 / Notifications：Telegram Bot API（`node-telegram-bot-api`）
- 地理位置 / GeoIP：`geoip-lite`（离线库，不上传任何 IP 数据）
- 数据 / Data：文件持久化威胁数据库（JSON），无需额外部署数据库
- No external DB — threat data persists to local JSON files.

## 功能 / Features

- **实时日志监控 + 自动响应**：同时 tail `auth.log`（SSH 爆破）和 nginx `access.log`/`error.log`（Web 扫描、敏感路径探测、扫描器 UA 识别、限速违规），命中阈值自动调用 UFW 封禁。
  Real-time log tailing + auto-response: watches SSH auth.log and nginx access/error logs for brute-force, scanning, and rate-limit violations, and auto-bans via UFW once a threshold is hit.
- **按地区可配置的封禁策略**：`STRICT_REGIONS` 环境变量指定需要更严格对待的地区（命中即封，其余地区默认多次容忍），地区判定用 `geoip-lite` 离线查询，仓库不存任何国家相关数据。
  Region-configurable ban policy: `STRICT_REGIONS` marks regions for a stricter (single-strike) threshold; region lookup is fully offline via `geoip-lite`.
- **蜜罐诱饵（`x-scripts/setup_honeypot.py`）**：故意部署的欺骗机制——创建诱饵用户、伪装服务 banner、在 nginx 挂假端点，用来监控/拖延攻击者，属于设计内的防御功能，不是漏洞。
  Honeypot bait (`x-scripts/setup_honeypot.py`): an intentional deception layer — decoy user, fake service banners, bait nginx endpoints — used to observe/stall attackers. By design, not a vulnerability.
- **PIN 门禁的实时作战面板**：`src/components/` 下 15 个前端组件，覆盖设备列表、队友在线状态、任务面板、AI 情报分析、终端窗口、DigitalOcean 防护面板等；后端 `server/` 下 15 个模块分工（威胁检测 `defender` / 日志监听 `watcher`+`monitor` / 加密保险库 `vault` / Telegram 机器人 `bot` / AI 分析 `ai`+`experts` 等），战报批量合并推送。
  PIN-gated live dashboard: 15 frontend components (device list, teammate presence, task panel, AI intel, terminal, DigitalOcean shield panel, etc.) backed by 15 server modules (threat detection, log watching, an encrypted vault, the Telegram bot, AI analysis) — alerts are batched before push, not spammed.

## 本地运行 / Getting started

```bash
npm install
cp .env.example .env   # 填入 Telegram Bot Token 等配置 / fill in Telegram Bot Token etc.
npm run dev
```

前端默认 `http://localhost:5173`，后端 API/WebSocket 见 `server/index.js`。
Frontend defaults to `http://localhost:5173`; backend API/WebSocket entry is `server/index.js`.

## 环境变量 / Env

键名见 `.env.example`，值全部占位，由 Doppler 注入。
Key names below are from `.env.example`; all values are placeholders, injected via Doppler at runtime.

```
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
XAI_API_KEY=
TEAMMATE_IP=
DO_API_TOKEN=
PIN_CODE=
BOT_TOKEN_CHOU=
BOT_TOKEN_ONION=
BOT_TOKEN_XIAOAI=
STRICT_REGIONS=
```

## 完成度 / Status

能跑，自用中；面板全部15个前端组件+15个后端模块均已实现。
Runnable, in active self-use; all 15 frontend components and 15 backend modules are implemented.
