# [WIN] 改動記錄 — 便於回滾

> Win 端所有改動記錄在此，Mac 端閱讀後可決定保留或回滾。
> 格式：✅ 已完成 | 📋 計劃中 | ⏪ 已回滾

---

## 2026-03-18 v2.0 — 全量重構

### ✅ 已完成改動

#### 1. VPS 後端新增 (Win 負責文件，按 DEV-RULES)
| 文件 | 改動 | 回滾方式 |
|------|------|---------|
| `server/ops.js` | 新建 — 15 條運維命令 + 一鍵同步 + 資源監控 + DO 橫向擴展 | 刪除文件 |
| `server/vault.js` | 新建 — AES-256-GCM 加密容器 + TG 歸檔 + AI 機密分析 | 刪除文件 |
| `src/components/CommandPanel.tsx` | 新建 — 命令/Vault/擴展 3-tab UI | 刪除文件 |

#### 2. VPS 後端修改 (共同維護文件，標記 [WIN])
| 文件 | 改動 | 回滾方式 |
|------|------|---------|
| `server/index.js` | +imports (ops/vault), +12 API 端點 (均在 `app.get('*')` 前) | 刪除 `// ═══ OPS` 和 `// ═══ VAULT` 區塊 |
| `server/experts.js` | Win-Guard → SD 重命名, handler 精簡為靜默模式, +vault 歸檔, +anti-spam | 從 Git main 恢復此文件 |
| `src/App.tsx` | +CommandPanel import, +ops Page type, +ops NAV item, +orange color | 刪除含 'ops' 的 4 行 |

#### 3. Win 本地 (WindSurf)
| 文件 | 改動 | 回滾方式 |
|------|------|---------|
| `windsurf-watchdog.ps1` | 移除 Send-WinStatus TG 群刷屏 (改為只走 API heartbeat) | 恢復 6b 區塊 |
| `config.json` | 移除 .aaa/.abc/.xyz/.zzz 誤報擴展名 | 加回 4 個擴展名 |
| 可疑進程檢測 | 改為精確匹配 (不再用 wildcard) | 恢復 `-like "*$_*"` 模式 |

#### 4. VPS 系統
| 項目 | 改動 | 回滾方式 |
|------|------|---------|
| `/root/X/UPDATE-V2.md` | 新建 — Mac 端增量部署指南 | 刪除文件 |
| Bot 策略 | SD 靜默模式 — 只回應 /sd /winstatus /winops | 恢復 experts.js |

---

### 📋 Bot 策略對齊

| Bot | 歸屬 | 行為 |
|-----|------|------|
| Mr Chou | Mac | 播報: 掃描結果、防護告警 |
| Onion-Mcp | Mac | 播報: AI 定時播報、/ask 回覆 |
| 小愛同學 | Mac | 播報: 團隊中樞、/team /sync /help |
| **SD** | **Win** | **靜默: 只回應 /sd /winstatus /winops，不主動播報** |

### Anti-Spam 規則
- SD 收到非指令訊息 → 直接 return，不回覆
- 同一 Bot 相同訊息 3 秒冷卻
- `[INTERNAL]` / `[HEARTBEAT]` → 只歸檔不發群
- Win watchdog 不再發 TG 群消息，只走 API heartbeat

---

### 📋 計劃中改動

- [ ] Win 端 .env 加密同步到 GitHub (走 crypto-store)
- [ ] Win 端 GPG 簽名 commit
- [ ] SD bot 新增 /ops 指令 (遠程執行 ops.js 命令)
- [ ] Win 端自動 git pull 定時同步

---

*Maintained by: Win-SD (choulv@win.blue-team)*
*Last updated: 2026-03-18 15:57 UTC+8*
