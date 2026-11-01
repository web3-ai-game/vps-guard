// ============================================================
// vault.js — 機密運算容器：TG 聊天記錄加密分析 + 用戶終端歸檔
// ============================================================
const { encrypt, decrypt, saveEncrypted, loadEncrypted, appendEncryptedLog, readEncryptedLog, listEncryptedLogs, X_DIR } = require('./crypto-store')
const { analyzeSecurityData } = require('./ai')
const axios = require('axios')
const path = require('path')
const fs = require('fs')

const VAULT_DIR = 'vault'
const CHAT_DIR = 'vault/chats'
const ANALYSIS_DIR = 'vault/analysis'

// ── 歸檔 TG 訊息到加密容器 ──
function archiveMessage(msg) {
  const record = {
    id: msg.message_id || msg.id || Date.now(),
    from: msg.from?.username || msg.from?.first_name || msg.fromUser || 'unknown',
    fromBot: msg.fromBot || false,
    botKey: msg.botKey || null,
    text: (msg.text || '').slice(0, 4000),
    chatId: msg.chatId || msg.chat?.id || null,
    chatType: msg.chat?.type || 'group',
    ts: msg.ts || new Date(msg.date ? msg.date * 1000 : Date.now()).toISOString(),
    platform: msg.platform || 'telegram',
    user: msg.userTag || null, // mac / win / unknown
  }

  const dateKey = record.ts.slice(0, 10)
  try {
    appendEncryptedLog(`${CHAT_DIR}/${dateKey}.enc`, record)
  } catch (e) {
    console.error('[Vault] archive error:', e.message)
  }
  return record
}

// ── 按用戶分類歸檔 ──
function getUserChatHistory(userTag, dateStr) {
  const date = dateStr || new Date().toISOString().slice(0, 10)
  const all = readEncryptedLog(`${CHAT_DIR}/${date}.enc`)
  if (!userTag) return all
  return all.filter(m => m.user === userTag || m.from === userTag)
}

// ── 取得聊天摘要統計 ──
function getChatStats(dateStr) {
  const date = dateStr || new Date().toISOString().slice(0, 10)
  const msgs = readEncryptedLog(`${CHAT_DIR}/${date}.enc`)
  if (!msgs.length) return { date, total: 0, users: {}, bots: {}, empty: true }

  const users = {}
  const bots = {}
  let commands = 0
  let alerts = 0

  for (const m of msgs) {
    if (m.fromBot) {
      bots[m.botKey || 'unknown'] = (bots[m.botKey || 'unknown'] || 0) + 1
    } else {
      users[m.from] = (users[m.from] || 0) + 1
    }
    if (m.text?.startsWith('/')) commands++
    if (m.text?.includes('CRITICAL') || m.text?.includes('ALERT') || m.text?.includes('❌')) alerts++
  }

  return {
    date,
    total: msgs.length,
    userMessages: msgs.filter(m => !m.fromBot).length,
    botMessages: msgs.filter(m => m.fromBot).length,
    users,
    bots,
    commands,
    alerts,
    timeRange: { first: msgs[0]?.ts, last: msgs[msgs.length - 1]?.ts },
  }
}

// ── 機密 AI 分析 (走加密容器) ──
async function analyzeChats(dateStr, prompt) {
  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) throw new Error('XAI_API_KEY not configured')

  const date = dateStr || new Date().toISOString().slice(0, 10)
  const msgs = readEncryptedLog(`${CHAT_DIR}/${date}.enc`)
  if (!msgs.length) throw new Error(`No messages for ${date}`)

  // 只取用戶訊息 + 關鍵 bot 回覆 (防過長)
  const filtered = msgs.filter(m => {
    if (!m.fromBot) return true
    if (m.text?.includes('CRITICAL') || m.text?.includes('掃描') || m.text?.includes('[WIN')) return true
    return false
  }).slice(-100) // 最多 100 條

  const chatText = filtered.map(m => {
    const who = m.fromBot ? `[BOT:${m.botKey}]` : `[${m.from}]`
    return `${m.ts?.slice(11, 19)} ${who} ${m.text?.slice(0, 200)}`
  }).join('\n')

  const systemPrompt = prompt || `你是藍隊機密分析師。分析以下 Telegram 群組聊天記錄，提取：
1. 安全事件摘要（有哪些掃描、告警、狀態變更）
2. 隊員活動（Mac/Win 各做了什麼）
3. 需要關注的異常（可疑行為、未處理的告警）
4. 行動建議（下一步應該做什麼）

簡潔回答，不超過 500 字。`

  const resp = await axios.post(
    'https://api.x.ai/v1/chat/completions',
    {
      model: 'grok-4-0709',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `聊天記錄 (${date}, ${filtered.length} 條):\n\n${chatText}` },
      ],
      max_tokens: 1000,
      temperature: 0.3,
    },
    {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 30000,
    }
  )

  const analysis = resp.data.choices[0].message.content

  // 加密保存分析結果
  const result = {
    date,
    messagesAnalyzed: filtered.length,
    analysis,
    generatedAt: new Date().toISOString(),
  }
  saveEncrypted(`${ANALYSIS_DIR}/${date}-analysis.enc`, result)

  return result
}

// ── 列出可用日期 ──
function listAvailableDates() {
  const chatDates = listEncryptedLogs(CHAT_DIR).map(f => f.replace('.enc', ''))
  const analysisDates = listEncryptedLogs(ANALYSIS_DIR).map(f => f.replace('-analysis.enc', ''))
  return { chatDates, analysisDates }
}

// ── 載入已保存的分析 ──
function loadAnalysis(dateStr) {
  return loadEncrypted(`${ANALYSIS_DIR}/${dateStr}-analysis.enc`)
}

// ── Vault 狀態概覽 ──
function getVaultStatus() {
  const dates = listAvailableDates()
  const todayStats = getChatStats()
  const vaultPath = path.join(X_DIR, VAULT_DIR)

  let totalSize = 0
  try {
    const walkDir = (dir) => {
      if (!fs.existsSync(dir)) return
      for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f)
        const s = fs.statSync(p)
        if (s.isDirectory()) walkDir(p)
        else totalSize += s.size
      }
    }
    walkDir(vaultPath)
  } catch {}

  return {
    encrypted: true,
    algorithm: 'AES-256-GCM',
    vaultPath: VAULT_DIR,
    totalSizeKB: Math.round(totalSize / 1024),
    chatDays: dates.chatDates.length,
    analysisDays: dates.analysisDates.length,
    today: todayStats,
    dates,
  }
}

module.exports = {
  archiveMessage,
  getUserChatHistory,
  getChatStats,
  analyzeChats,
  listAvailableDates,
  loadAnalysis,
  getVaultStatus,
}
