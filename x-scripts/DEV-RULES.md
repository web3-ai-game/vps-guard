# BLUE TEAM — 雙端協作開發規則

> 放置於 VPS `/root/X/DEV-RULES.md`
> Mac 和 Win 端的 Windsurf Cascade 讀取後必須嚴格遵守

---

## 🚨 最重要的規則

### 1. 永遠不要在同一個目錄開發
```
Mac 本地路徑: ~/CascadeProjects/blue-team-ui/
Win 本地路徑: C:\Users\Administrator\CascadeProjects\BLUE_TEAM\
VPS 部署路徑: /root/TEAM/
```
**兩端代碼完全獨立**，只透過 Git 和 VPS `/root/X/` 交換。

### 2. Git 分支策略
```
main          ← 穩定版，只接受 PR 或確認後的直接推送
├── mac/dev   ← Mac 端日常開發分支
└── win/dev   ← Win 端日常開發分支
```

**推送流程：**
```
開發 → 本地測試 → commit → push 到自己的分支 → 通知對方 → merge 到 main
```

### 3. 避免衝突的文件分工

| 文件/目錄 | Mac 主要負責 | Win 主要負責 | 共同維護 |
|-----------|:---:|:---:|:---:|
| `server/index.js` | | | ✅ (謹慎) |
| `server/experts.js` | ✅ | | |
| `server/ops.js` | | ✅ | |
| `server/vault.js` | | ✅ | |
| `server/watcher.js` | ✅ | | |
| `server/crypto-store.js` | ✅ | | |
| `server/logger.js` | ✅ | | |
| `server/personality.js` | ✅ | | |
| `server/tasks.js` | ✅ | | |
| `server/ai.js` | ✅ | | |
| `src/App.tsx` | | | ✅ (謹慎) |
| `src/components/CommandPanel.tsx` | | ✅ | |
| `src/components/AuditReport.tsx` | ✅ | | |
| `src/components/TeamStatus.tsx` | ✅ | | |
| `src/components/TaskPanel.tsx` | ✅ | | |
| `src/components/DOShieldPanel.tsx` | ✅ | | |
| `src/components/AIIntelPanel.tsx` | ✅ | | |
| `x-scripts/WIN-AUTOCONFIG.ps1` | | ✅ | |
| `x-scripts/MAC-AUTOCONFIG.sh` | ✅ | | |

### 4. 共同維護文件的修改規則

對 `index.js` 和 `App.tsx` 等共同文件的修改：
1. **只追加，不重寫** — 新增 API 端點加到文件末尾（`app.get('*')` 之前）
2. **加註釋標記** — 每個區塊標明是誰加的：
   ```javascript
   // ═══ [MAC] Watcher API ═══
   app.get('/api/watcher/status', ...)

   // ═══ [WIN] OPS API ═══
   app.get('/api/ops/resources', ...)
   ```
3. **修改前先拉取** — `git pull origin main` 確認最新版
4. **衝突時** — 保留雙方的代碼，不要刪除對方的功能

---

## 🔄 同步流程

### Mac 端推送更新
```bash
cd ~/CascadeProjects/blue-team-ui
git checkout mac/dev           # 切到 Mac 開發分支
git add -A
git commit -m "feat(mac): 描述"
git push origin mac/dev

# 確認無衝突後合併到 main
git checkout main
git pull origin main
git merge mac/dev
git push origin main

# 部署 VPS
npx vite build
rsync -avz -e "ssh -i ~/.ssh/id_svs" \
  --exclude node_modules --exclude .env --exclude .git \
  ./ root@167.71.13.130:/root/TEAM/
ssh -i ~/.ssh/id_svs root@167.71.13.130 "cd /root/TEAM && pm2 restart blue-team"

# 回報到 X
curl -X POST http://167.71.13.130:3001/api/watcher/sync-report \
  -H "Content-Type: application/json" \
  -d '{"platform":"mac","commit":"'"$(git rev-parse --short HEAD)"'","branch":"main"}'
```

### Win 端推送更新
```powershell
cd C:\Users\Administrator\CascadeProjects\BLUE_TEAM
git checkout win/dev
git add -A
git commit -m "feat(win): 描述"
git push origin win/dev

# 確認無衝突後合併
git checkout main
git pull origin main
git merge win/dev
git push origin main

# 回報到 X
$commit = git rev-parse --short HEAD
Invoke-RestMethod -Uri "http://167.71.13.130:3001/api/watcher/sync-report" `
  -Method POST -ContentType "application/json" `
  -Body ('{"platform":"win","commit":"' + $commit + '","branch":"main"}')
```

---

## 📦 緩存系統

### 緩存區域: `/root/X/cache/`

| 文件 | 用途 |
|------|------|
| `snapshot.enc` | VPS 文件快照 (SHA-256 hash) |
| `changes.enc` | 變動歷史記錄 (最近 100 條) |
| `sync-status.enc` | Mac/Win 同步狀態 |
| `diffs/` | 差異備份 |
| `{key}.enc` | 自定義緩存內容 |

### 緩存 API

| 端點 | 方法 | 說明 |
|------|------|------|
| `/api/watcher/status` | GET | 監控狀態總覽 |
| `/api/watcher/scan` | POST | 手動觸發掃描 |
| `/api/watcher/changes` | GET | 歷史變動記錄 |
| `/api/watcher/sync-status` | GET | Mac/Win 同步狀態 |
| `/api/watcher/sync-report` | POST | 回報同步 `{platform, commit, branch}` |
| `/api/watcher/cache` | POST | 寫入緩存 `{key, content}` |
| `/api/watcher/cache/:key` | GET | 讀取緩存 |

### 自動監控
- 每 **60 秒** 掃描 VPS 關鍵目錄
- 偵測到變動自動通知 TG 群
- 所有快照和變動記錄加密儲存

---

## 🔐 安全規則

1. **`.env` 和 `.crypto-key` 永遠不入 Git**
2. **不在代碼中硬編碼任何 Key/Token/Secret**
3. **所有日誌和緩存必須 AES-256-GCM 加密後才寫入磁盤**
4. **VPS SSH 只用密鑰認證**（Mac: `~/.ssh/id_svs`, Win: 配置 SSH key）
5. **Bot Token 定期輪換**
6. **修改 `.env` 後必須同步到 `/root/X/backup/.env.backup`**

---

## 📋 App 修改規則

### 新增 UI 組件
1. 在 `src/components/` 新增 `.tsx` 文件
2. 在 `App.tsx` 中 import 並加到 `pages` 陣列
3. **不要修改其他人的組件**，除非協商過

### 新增 API 端點
1. 新增模組在 `server/` 目錄
2. 在 `index.js` 中 require 並加到適當位置
3. **加 `[MAC]` 或 `[WIN]` 區塊標記**
4. 端點路徑規範：`/api/{模組名}/{操作}`

### Commit 規範
```
feat(mac): 新增 watcher 變動監控
feat(win): 新增 ops 命令面板
fix(mac): 修復 personality 空指針
fix(win): 修復 vault 加密錯誤
chore: 更新 X 規則文件
```

---

## 🤖 Bot 修改規則

### 新增 Bot 指令
1. 在 `experts.js` 的 `handleGroupMessage` 中對應 botKey 區塊新增
2. **更新 /help 選單**
3. **加到 WINDSURF-RULES.md**

### Anti-Spam 規則 (已實現)
- 同一 Bot 相同訊息 3 秒冷卻
- `[INTERNAL]` / `[HEARTBEAT]` 標記 → 只歸檔不發群
- 所有訊息自動加密歸檔到 vault

---

## 📊 當前系統架構

```
┌─────────────────────────────────────────────────┐
│                  VPS 167.71.13.130              │
│                                                 │
│  /root/TEAM/          /root/X/                  │
│  ├── server/          ├── cache/    (加密緩存)   │
│  │   ├── index.js     ├── logs/     (加密日誌)   │
│  │   ├── experts.js   ├── vault/    (機密容器)   │
│  │   ├── ops.js       ├── summaries/(每日摘要)   │
│  │   ├── vault.js     ├── DEV-RULES.md          │
│  │   ├── watcher.js   ├── WINDSURF-RULES.md     │
│  │   ├── crypto-store  ├── UPDATE-V2.md         │
│  │   ├── logger.js    ├── WIN-AUTOCONFIG.ps1    │
│  │   ├── personality  └── MAC-AUTOCONFIG.sh     │
│  │   └── ...                                    │
│  ├── src/components/                            │
│  └── dist/                                      │
│                                                 │
│  4 Bots: Chou + Onion + Xiaoai + Win-Guard      │
│  Watcher: 60s 掃描 → TG 通知 → 加密緩存        │
└──────────┬──────────────────────┬────────────────┘
           │                      │
    Mac (主控)               Win (隊友)
    mac/dev 分支             win/dev 分支
    ~/CascadeProjects/       C:\...\BLUE_TEAM\
    rsync 部署               git pull 同步
```

---

*Generated: 2026-03-18 by Mac Windsurf*
*適用版本: BLUE TEAM v2.1*
