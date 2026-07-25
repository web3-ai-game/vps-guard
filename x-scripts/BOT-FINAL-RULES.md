# BLUE TEAM — Bot 最終分工定案

> **此文件定案後不再變動。**
> 放置於 VPS `/root/X/BOT-FINAL-RULES.md`
> Mac 和 Win 端 Windsurf 讀取後必須嚴格遵守。

---

## 🔒 4 Bot Token 固定分配

| # | Bot 名稱 | Key | Token ENV | 角色 | 歸屬 |
|---|----------|-----|-----------|------|------|
| 1 | Mr'Chou 助理 | `chou` | `BOT_TOKEN_CHOU` | 🛡 Mac 安全衛士 | Mac 主控 |
| 2 | Onion-Mcp | `onion` | `BOT_TOKEN_ONION` | 🧠 AI 大師 | 共用 (Mac 主控) |
| 3 | 小愛同學 | `xiaoai` | `BOT_TOKEN_XIAOAI` | 📡 團隊中樞 | 共用 Mac+Win |
| 4 | SD | `win` | `BOT_TOKEN_WIN` | 🔇 Win 靜默代理 | Win 專用 |

---

## 📋 各 Bot 詳細職責

### 1. Mr'Chou 助理 (`chou`) — 🛡 Mac 安全衛士

**群內行為：被動播報，只在有事時說話**

| 指令 | 功能 |
|------|------|
| `/scan` | 執行安全掃描 |
| `/protect` | 一鍵全防護 |
| `/status` | 系統狀態報告 |

**限制：**
- 每次播報間隔 ≥ **10 分鐘**
- 不回應非指令消息
- 不主動打招呼

---

### 2. Onion-Mcp (`onion`) — 🧠 AI 大師

**群內行為：被動回應 + 定時播報**

| 指令 | 功能 |
|------|------|
| `/ask <問題>` | 向大師提問 (Grok 4) |
| `/persona` | 切換動態人格 (6 種) |
| `/analyze` | 深度安全分析 |
| `/report` | 態勢摘要 |

**6 種人格：**
1. 暗影學者 — 深沉神秘
2. 鋼鐵教官 — 嚴厲直接
3. 賽博禪師 — 哲學冷靜
4. 街頭駭客 — 叛逆幽默
5. 學院派教授 — 嚴謹學術
6. 深海水母 — 飄逸隨性

**限制：**
- 定時播報每 **30 分鐘** 一次
- 其他回應間隔 ≥ **1 分鐘**
- 只回應 `/ask` `/persona` `/analyze` `/report` 和 @ 提及
- 不回應普通聊天

---

### 3. 小愛同學 (`xiaoai`) — 📡 團隊中樞（共用）

**群內行為：中樞調度，Mac+Win 共用**

| 指令 | 功能 |
|------|------|
| `/help` | 全指令清單 |
| `/team` | 雙端狀態對齊 |
| `/sync` | 請求 Win 回報 |
| `/wincheck` | 查看 Win 狀態 |
| `/logs` | 加密日誌狀態 |
| `/daily` | 今日摘要 |
| `/exchange` | 匯出交換數據 |
| `/fullscan` | 全量 11 項掃描 |
| `/autoscan N` | 自動掃描 |
| `/ping` | 連線測試 |
| `/joke` | 冷笑話 |

**特殊職責：**
- 全量記錄所有群消息（AES-256-GCM 加密歸檔）
- 轉發 SD (Win) 的操作結果到群（`📡 [Win→群]` 前綴）
- 每日 23:55 自動產生加密摘要
- 偵測 Win Bot 狀態報告並解析

**限制：**
- 每分鐘最多 **3 條** 消息
- 每條間隔 ≥ **20 秒**

---

### 4. SD (`win`) — 🔇 Win 靜默代理

**群內行為：永不發消息**

SD 是唯一一個 **永遠不在群裡說話** 的 bot。所有 SD 的交互都通過面板 API 進行。

**面板交互 (PIN 後)：**

| 面板指令 | 功能 |
|----------|------|
| `/sd` | Win 狀態查詢 |
| `/winstatus` | 同上 |
| `/forward <msg>` | 通過小愛轉發消息到群 |
| `/ops` | 運維命令 |
| `/help` | 面板指令清單 |

**API 端點：**

| 端點 | 方法 | 說明 |
|------|------|------|
| `/api/bot/chat` | GET | 讀取 SD 聊天記錄 |
| `/api/bot/chat` | POST | 發送消息給 SD `{message, user}` |
| `/api/bot/forward` | POST | SD 通過小愛轉發到群 `{text}` |

**工作流：**
```
Win 用戶 → 面板 PIN → 🔧運維 tab → Bot 聊天
  → POST /api/bot/chat {message: "/sd"}
  → SD 處理 → 結果返回面板
  → 如需發群 → /forward → 小愛轉發
```

---

## 🚫 防刷屏規則（寫死，不可更改）

| 規則 | 值 |
|------|-----|
| 同一消息去重冷卻 | **30 秒** |
| SD 群消息 | **永不發送** |
| Chou 播報間隔 | ≥ **10 分鐘** |
| Onion 回應間隔 | ≥ **1 分鐘** |
| Onion 定時播報 | 每 **30 分鐘** |
| 小愛每分鐘上限 | **3 條** |
| 小愛消息間隔 | ≥ **20 秒** |
| `[INTERNAL]` 標記 | 只歸檔不發群 |
| `[HEARTBEAT]` 標記 | 只歸檔不發群 |

---

## 🔄 交互流程圖

```
TG 群聊
├── 用戶 /ask 問題 → Onion 回覆 (≥1min 間隔)
├── 用戶 /scan → Chou 掃描 (≥10min 間隔)
├── 用戶 /team → 小愛 雙端對齊 (≤3條/min)
├── Win Bot 狀態 → 小愛 解析存檔
├── 定時 30min → Onion 人格播報
└── 23:55 → 小愛 自動摘要

面板 (PIN 後)
├── 🔧運維 → ops.js 命令 → 結果顯示
├── 💬Bot → SD 聊天 → /forward → 小愛→群
├── 🔒Vault → 加密容器查詢
└── ☁擴展 → DO 橫向擴展

Win 端工作流
├── watchdog 5min → heartbeat API (不走群)
├── 面板操作 → /api/bot/chat → SD 處理
├── 需要通知群 → /forward → 小愛轉發
└── FIM 15min → 文件完整性 (本地)
```

---

## 📌 下次開發計劃（僅供參考，本文件不會再改）

- [ ] Win 在 3001 面板上控制 thcgo/bog 項目
- [ ] 所有操作流水用荷蘭文寫到 X
- [ ] 面板增加「💬 Bot」聊天 tab UI
- [ ] SD bot 新增 /ops 指令（遠程執行 ops.js 命令）
- [ ] Bot 創建管理群功能
- [ ] 移動所有內容全量到 X

---

*Finalized: 2026-03-18*
*This document is LOCKED — no further changes.*
*Both Mac and Win Windsurf must comply strictly.*
