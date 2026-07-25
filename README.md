# VPS Guard

> VPS 入侵防御系统 —— 实时监控 auth.log/nginx 日志，自动封禁攻击 IP，Telegram 战报播报，PIN 门禁作战面板

[源码](https://github.com/web3-ai-game/vps-guard)

![演示](docs/demo.gif)

## 技术栈

- **前端**：React 19 + TypeScript + Vite，Tailwind CSS v4
- **后端**：Node.js + Express + WebSocket（`ws`）
- **通知**：Telegram Bot API（`node-telegram-bot-api`）
- **数据**：文件持久化威胁数据库（JSON），无需额外部署数据库

## 核心技术点

1. **实时日志监控 + 自动响应**：同时 tail `auth.log`（SSH 爆破）和 nginx `access.log`/`error.log`（Web 扫描、敏感路径探测、扫描器 UA 识别、限速违规），命中阈值自动调用 UFW 封禁，全程无需人工介入。
2. **按地区可配置的封禁策略**：通过 `STRICT_REGIONS` 环境变量指定需要更严格对待的地区（1 次命中即封，其余地区默认 3 次），地区判定用 `geoip-lite` 离线查询 IP 归属国——仓库里不存任何国家相关的数据，配置本身也只存在于不入库的 `.env`。
3. **PIN 门禁的实时作战面板**：15 个前端组件覆盖设备列表、队友在线状态、任务面板、AI 情报分析、终端窗口、DigitalOcean 防护面板等；后端 15 个模块分工清晰（威胁检测 `defender` / 日志监听 `watcher`+`monitor` / 加密保险库 `vault` / Telegram 机器人 `bot` / AI 分析 `ai`+`experts`），批量战报每 90 秒合并推送，不刷屏。

## 本地运行

```bash
npm install
cp .env.example .env   # 填入 Telegram Bot Token 等配置
npm run dev
```

前端默认 `http://localhost:5173`，后端 API/WebSocket 见 `server/index.js`。

## License

MIT
