# BLUE TEAM — Windsurf Cascade 自動執行規則

> 此文件放在 VPS `/root/X/WINDSURF-RULES.md`，Mac 和 Win 端的 Windsurf IDE 讀取後應自動遵循。

---

## 🏗 項目架構

```
blue-team-ui/
├── src/                    # React 前端 (Vite + TailwindCSS)
│   ├── App.tsx             # 主應用
│   └── components/         # UI 組件
├── server/                 # Node.js 後端
│   ├── index.js            # Express + WebSocket 主入口
│   ├── experts.js          # 三 Bot 管理 (Chou/Onion/Xiaoai)
│   ├── crypto-store.js     # AES-256-GCM 加密儲存
│   ├── logger.js           # 全量訊息加密日誌
│   ├── personality.js      # Onion AI 大師動態人格引擎
│   ├── tasks.js            # 安全掃描任務
│   ├── ai.js               # Grok 4 AI 分析
│   ├── bot.js              # 基礎 Bot
│   ├── do.js               # DigitalOcean API
│   ├── dashboard.js        # 定時儀表板
│   └── settings.js         # 環境變量管理
├── x-scripts/              # X 文件夾腳本 (部署到 /root/X/)
│   ├── WIN-AUTOCONFIG.ps1  # Win 全自動配置
│   ├── MAC-AUTOCONFIG.sh   # Mac 全自動配置
│   └── WINDSURF-RULES.md   # 本文件
└── .env                    # 環境變量 (不入 Git)
```

## 🤖 三 Bot 分工

| Bot | 角色 | 職責 |
|-----|------|------|
| **Mr'Chou 助理** | 🛡 安全自動化 | 定時掃描、自動防護、異常播報、防護規則對齊 |
| **Onion-Mcp** | 🤖 AI 大師 | Grok 4 驅動、6種動態人格、聊天提問、安全諮詢 |
| **小愛同學** | 📡 團隊中樞 | 全量記錄、AES加密轉存、Mac/Win對齊、自動播報 |

## 🔐 加密系統

- **算法**: AES-256-GCM
- **密鑰**: 自動生成，存於 `.crypto-key` 或 `CRYPTO_KEY` 環境變量
- **日誌**: `/root/X/logs/YYYY-MM-DD.enc` (每行獨立加密)
- **摘要**: `/root/X/summaries/YYYY-MM-DD-summary.enc`
- **解密**: 只有持有密鑰的節點可讀

## 📋 Windsurf 自動執行指令

### Win 端 Cascade 讀取此文件後應：

1. **檢查項目是否存在**
   ```powershell
   $dir = "$env:USERPROFILE\Documents\BLUE_TEAM"
   if (-not (Test-Path $dir)) { git clone https://github.com/web3-ai-game/BLUE_TEAM.git $dir }
   ```

2. **從 VPS 拉取 .env**
   ```powershell
   scp root@167.71.13.130:/root/X/backup/.env.backup "$dir\.env"
   ```

3. **執行自動防護配置**
   ```powershell
   # 需要管理員權限
   powershell -ExecutionPolicy Bypass -File "$dir\x-scripts\WIN-AUTOCONFIG.ps1"
   ```

4. **安裝依賴並測試**
   ```powershell
   cd $dir; npm install
   ```

### Mac 端 Cascade 讀取此文件後應：

1. **拉取最新代碼**
   ```bash
   cd ~/CascadeProjects/blue-team-ui && git pull origin main
   ```

2. **執行自動防護配置**
   ```bash
   chmod +x x-scripts/MAC-AUTOCONFIG.sh
   sudo ./x-scripts/MAC-AUTOCONFIG.sh
   ```

3. **Build + 部署**
   ```bash
   npx vite build
   rsync -avz -e "ssh -i ~/.ssh/id_svs" --exclude node_modules --exclude .env --exclude .git ./ root@167.71.13.130:/root/TEAM/
   ssh -i ~/.ssh/id_svs root@167.71.13.130 "cd /root/TEAM && pm2 restart blue-team"
   ```

## 🌐 環境變量清單 (.env)

```
PIN_CODE=684861
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
BOT_TOKEN_CHOU=...
BOT_TOKEN_ONION=...
BOT_TOKEN_XIAOAI=...
XAI_API_KEY=...
DO_API_TOKEN=...
CRYPTO_KEY=...          # 可選，不設則自動生成
X_DIR=/root/X           # 加密儲存路徑
```

## 📡 API 端點

| 路徑 | 方法 | 說明 |
|------|------|------|
| `/api/logs` | GET | 今日加密日誌摘要 |
| `/api/logs/:date` | GET | 指定日期日誌 |
| `/api/logs/summary` | POST | 產生今日摘要 |
| `/api/logs/exchange/data` | GET | 匯出交換數據 |
| `/api/heartbeat` | POST | 心跳回報 |
| `/api/status` | GET | 系統狀態 |
| `/api/tasks` | GET | 任務列表 |

## 🔄 協作流程

```
Mac (主控)                    VPS (167.71.13.130)              Win (隊友)
    │                              │                              │
    ├── git push ─────────────────>│                              │
    ├── rsync deploy ─────────────>│                              │
    │                              │<── git pull ─────────────────┤
    │                              │<── heartbeat ────────────────┤
    │                              │                              │
    │    ┌─── Telegram 群 ───┐    │                              │
    │    │ Chou: 掃描/防護    │    │                              │
    │    │ Onion: AI聊天/分析  │    │                              │
    │    │ Xiaoai: 記錄/對齊   │    │                              │
    │    │ Win Bot: 狀態回報   │    │                              │
    │    └────────────────────┘    │                              │
    │                              │                              │
    ├── /root/X/logs/ ────────────>│<── scp 讀取 ─────────────────┤
    │                              │                              │
```

## ⚠ 安全規則

- **永遠不要** 在代碼中硬編碼 API Key
- **永遠不要** 將 `.env` 或 `.crypto-key` 提交到 Git
- 所有日誌必須加密後才寫入磁盤
- VPS SSH 只使用密鑰認證
- Telegram Bot Token 定期輪換
