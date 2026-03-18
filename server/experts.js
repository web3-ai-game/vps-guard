const TelegramBot = require('node-telegram-bot-api')
const { analyzeSecurityData } = require('./ai')
const logger = require('./logger')
const personality = require('./personality')
const vault = require('./vault')

const BOTS = {
  chou: {
    name: 'Mr`Chou 助理',
    role: 'security',
    desc: '🛡 安全自動化 — 定時掃描、自動防護、異常播報、防護規則對齊',
    token: null,
    bot: null,
    triggers: ['/scan', '/protect', '/status', '/firewall', '/audit', '安全', '防護', '掃描', '防火牆', '威脅'],
  },
  onion: {
    name: 'Onion-Mcp',
    role: 'master',
    desc: '🤖 AI 大師 — Grok 4 驅動、動態人格、聊天提問、安全諮詢',
    token: null,
    bot: null,
    triggers: ['/analyze', '/ai', '/report', '/ask', '/persona', '分析', '報告', '風險', 'AI', '總結'],
  },
  xiaoai: {
    name: '小愛同學',
    role: 'coordinator',
    desc: '📡 團隊中樞 — 全量記錄、加密轉存、Mac/Win 對齊、自動播報',
    token: null,
    bot: null,
    triggers: ['/help', '/ping', '/team', '/sync', '/logs', '/daily', '/exchange', '你好', '幫我'],
  },

  win: {
    name: 'SD',
    role: 'ops',
    desc: '🔇 Win 靜默代理 — 永不發群消息，只透過面板 API 交互',
    token: null,
    bot: null,
    triggers: [],  // no group triggers — panel only
  },
}

let chatId = null
let messageLog = []
const MAX_LOG = 200

// ════ Anti-spam + Rate Limiting ════
const SPAM_COOLDOWN = 30000 // 30s cooldown for same message
const BOT_RATE_LIMITS = {
  chou:   { minInterval: 600000, lastSent: 0 },  // 10 min between broadcasts
  onion:  { minInterval: 60000,  lastSent: 0 },  // 1 min between messages
  xiaoai: { minInterval: 20000,  lastSent: 0, perMinute: 3, minuteCount: 0, minuteReset: 0 }, // max 3/min
  win:    { minInterval: Infinity, lastSent: 0 }, // NEVER sends to group
}
const lastBotMsg = {}

function shouldSendToGroup(botKey, text) {
  const now = Date.now()
  // SD (win) NEVER sends to group — all interaction via panel API
  if (botKey === 'win') return false
  // Internal/heartbeat tags — archive only
  if (text && (text.includes('[INTERNAL]') || text.includes('[HEARTBEAT]'))) return false
  // Same message cooldown (30s)
  const dedupKey = botKey + ':' + (text || '').slice(0, 50)
  if (lastBotMsg[dedupKey] && now - lastBotMsg[dedupKey] < SPAM_COOLDOWN) return false
  lastBotMsg[dedupKey] = now
  // Per-bot rate limit
  const limit = BOT_RATE_LIMITS[botKey]
  if (limit) {
    if (now - limit.lastSent < limit.minInterval) return false
    // Per-minute cap for xiaoai
    if (limit.perMinute) {
      if (now - limit.minuteReset > 60000) { limit.minuteCount = 0; limit.minuteReset = now }
      if (limit.minuteCount >= limit.perMinute) return false
      limit.minuteCount++
    }
    limit.lastSent = now
  }
  return true
}

// Bot panel chat queue — for panel-based interaction
const botChatQueue = []
const MAX_CHAT_QUEUE = 100

// ═══ Multi-Group Monitoring (Win Bot) ═══
const groupMessages = {} // { [groupId]: { name, type, messages: [], lastActivity } }
const MAX_GROUP_MESSAGES = 200
const EXCLUDED_GROUP_IDS = new Set() // populated with main chatId

function storeGroupMessage(chatInfo, msg) {
  const gid = String(chatInfo.id)
  if (!groupMessages[gid]) {
    groupMessages[gid] = {
      name: chatInfo.title || chatInfo.first_name || 'Unknown',
      type: chatInfo.type,
      messages: [],
      lastActivity: null,
    }
  }
  const entry = {
    id: msg.message_id,
    from: msg.from?.first_name || msg.from?.username || 'unknown',
    fromId: msg.from?.id,
    username: msg.from?.username || null,
    text: msg.text || (msg.caption ? `[媒體] ${msg.caption}` : msg.sticker ? '[貼圖]' : msg.photo ? '[圖片]' : msg.document ? `[檔案] ${msg.document.file_name || ''}` : '[非文字訊息]'),
    ts: new Date((msg.date || Date.now() / 1000) * 1000).toISOString(),
    replyTo: msg.reply_to_message?.message_id || null,
  }
  groupMessages[gid].messages.push(entry)
  groupMessages[gid].lastActivity = entry.ts
  if (groupMessages[gid].messages.length > MAX_GROUP_MESSAGES) {
    groupMessages[gid].messages.splice(0, groupMessages[gid].messages.length - MAX_GROUP_MESSAGES)
  }
}

// Win Bot 交互狀態
let updateTeammateCallback = null
const winBotState = {
  lastReport: null,
  lastSeen: null,
  botUsername: null,
  botName: null,
  data: {},
}

function getWinBotState() { return winBotState }

function getLog() { return messageLog.slice(-50) }
function getChatId() { return chatId }

function addLog(botName, role, text, fromUser, msg) {
  const entry = {
    id: Date.now(),
    bot: botName,
    role,
    text: text.slice(0, 500),
    fromUser: fromUser || null,
    ts: new Date().toISOString(),
  }
  messageLog.push(entry)
  if (messageLog.length > MAX_LOG) messageLog = messageLog.slice(-MAX_LOG)

  // 全量加密寫入 /root/X/logs/
  try {
    logger.logMessage({
      id: msg?.message_id || entry.id,
      from: fromUser || botName,
      fromBot: !fromUser,
      botName: !fromUser ? botName : null,
      text: text.slice(0, 2000),
      chatId: msg?.chat?.id || chatId,
      ts: entry.ts,
    })
  } catch {}
}

async function sendAsBot(botKey, text, parseMode) {
  // Archive to vault
  try {
    vault.archiveMessage({ text, fromBot: true, botKey, chatId: chatId, ts: new Date().toISOString() })
  } catch {}
  // Anti-spam check
  if (!shouldSendToGroup(botKey, text)) {
    messageLog.push({ from: botKey, text: (text || "").slice(0, 200), ts: new Date().toISOString(), bot: true })
    return null // silently archived, not sent to group
  }
  const b = BOTS[botKey]
  if (!b?.bot || !chatId) return null
  try {
    const opts = parseMode ? { parse_mode: parseMode } : {}
    const msg = await b.bot.sendMessage(chatId, text, opts)
    addLog(b.name, b.role, text, null)
    return msg
  } catch (e) {
    console.error(`[${b.name}] send error:`, e.message)
    return null
  }
}

function formatMD(title, sections) {
  let md = `🛡 *${title}*\n\n`
  for (const s of sections) {
    if (s.heading) md += `*${s.heading}*\n`
    if (s.items) s.items.forEach(i => { md += `  • ${i}\n` })
    if (s.text) md += `${s.text}\n`
    md += '\n'
  }
  return md
}

async function handleGroupMessage(botKey, msg) {
  // Archive all incoming messages to vault
  try {
    const userTag = (msg.from?.username || '').toLowerCase().includes('mac') ? 'mac' : 'win'
    vault.archiveMessage({
      message_id: msg.message_id,
      from: msg.from,
      fromBot: false,
      text: msg.text || '',
      chat: msg.chat,
      ts: new Date(msg.date * 1000).toISOString(),
      userTag,
    })
  } catch {}
  const b = BOTS[botKey]
  if (!msg.text) return
  const text = msg.text.trim()
  const user = msg.from?.first_name || 'User'

  addLog(b.name, b.role, text, user, msg)

  if (!chatId && msg.chat?.id) {
    chatId = msg.chat.id
    console.log(`[Experts] Chat ID discovered: ${chatId}`)
  }

  const lower = text.toLowerCase()

  if (botKey === 'chou') {
    if (lower.includes('/status') || lower.includes('狀態')) {
      const report = formatMD('系統狀態報告', [
        { heading: '🖥 Blue Team Dashboard', items: ['服務運行中 ✅', `VPS: 167.71.13.130:3001`, `上線時間: ${process.uptime().toFixed(0)}s`] },
        { heading: '🔧 可用指令', items: ['/scan — 執行安全掃描', '/protect — 一鍵全防護', '/audit — 安全稽查報告'] },
      ])
      await sendAsBot('chou', report, 'Markdown')
    }
    if (lower.includes('/scan') || lower.includes('掃描')) {
      await sendAsBot('chou', '🔍 正在執行安全掃描…請稍候', null)
      await sendAsBot('chou', formatMD('掃描完成', [
        { heading: '📡 網路狀態', items: ['防火牆: 檢查中…', '開放端口: 檢查中…'] },
        { text: '💡 使用面板查看完整報告：http://167.71.13.130:3001' },
      ]), 'Markdown')
    }
    if (lower.includes('/protect') || lower.includes('防護')) {
      await sendAsBot('chou', formatMD('一鍵全防護', [
        { heading: '🛡 執行中', items: ['啟用防火牆 ✅', '啟用隱身模式 ✅', '掃描開放端口…'] },
        { text: '⚡ 防護指令已下發，請在面板確認結果' },
      ]), 'Markdown')
    }
  }

  if (botKey === 'onion') {
    // /persona — 切換人格
    if (lower.includes('/persona')) {
      const p = personality.pickPersona()
      await sendAsBot('onion', `${p.emoji} 人格切換為「${p.name}」\n\n『${p.greeting}』`, null)
      return
    }
    // /analyze — 安全深度分析
    if (lower.includes('/analyze') || lower.includes('/ai') || lower.includes('分析')) {
      const p = personality.getCurrentPersona()
      await sendAsBot('onion', `${p.emoji} 「${p.name}」正在分析中…`, null)
      try {
        const analysis = await analyzeSecurityData(
          { score: 0, verdict: 'ANALYZING', security: {}, findings: [], listenPorts: [], devices: [] },
          null
        )
        const chunks = analysis.match(/[\s\S]{1,3500}/g) || [analysis]
        for (const chunk of chunks) {
          await sendAsBot('onion', chunk, 'Markdown')
        }
      } catch (e) {
        await sendAsBot('onion', `❌ AI 分析出錯: ${e.message}`, null)
      }
      return
    }
    // /report — 態勢摘要
    if (lower.includes('/report') || lower.includes('報告')) {
      await sendAsBot('onion', formatMD('安全態勢摘要', [
        { heading: '📊 當前狀態', items: ['VPS 在線 ✅', '面板可訪問 ✅', '使用 /analyze 獲取 AI 深度分析'] },
      ]), 'Markdown')
      return
    }
    // /ask 或直接聊天 — AI 大師動態人格回應
    if (lower.startsWith('/ask') || lower.includes('問') || lower.includes('為什麼') || lower.includes('怎麼辦') || lower.includes('如何') || lower.includes('請問')) {
      const question = text.replace(/^\/ask\s*/i, '').trim()
      if (!question) {
        await sendAsBot('onion', '🤖 請提問！例如: /ask 公共WiFi怎麼防護？', null)
        return
      }
      try {
        const { reply, persona, emoji } = await personality.chat(question, user)
        await sendAsBot('onion', `${emoji} 「${persona}」\n\n${reply}`, null)
      } catch (e) {
        await sendAsBot('onion', `❌ AI 回應失敗: ${e.message}`, null)
      }
      return
    }
  }

  // ═══ [WIN] SD — 完全靜默代理，永不發群消息 ═══
  // SD 只歸檔消息，所有交互通過面板 /api/bot/* 端點
  if (botKey === 'win') {
    // Archive to chat queue for panel retrieval
    botChatQueue.push({
      id: Date.now(),
      from: user,
      text,
      ts: new Date().toISOString(),
      direction: 'in',
    })
    if (botChatQueue.length > MAX_CHAT_QUEUE) botChatQueue.splice(0, botChatQueue.length - MAX_CHAT_QUEUE)
    return // NEVER respond in group
  }

  if (botKey === 'xiaoai') {
    const from = msg.from || {}
    const isFromBot = from.is_bot === true
    const isOurBot = ['chou', 'onion', 'xiaoai'].some(k => BOTS[k].bot?.options?.username && from.username === BOTS[k].bot.options.username)

    // 偵測 Win Bot 狀態報告 (來自其他 bot 或含有 WIN 標記的訊息)
    if ((isFromBot && !isOurBot) || text.includes('[WIN') || text.includes('🪟') || text.includes('[AGENT]')) {
      const parsed = parseWinBotReport(text)
      if (parsed && Object.keys(parsed).length > 0) {
        winBotState.lastReport = text
        winBotState.lastSeen = Date.now()
        winBotState.botName = from.first_name || from.username || 'Win Bot'
        winBotState.botUsername = from.username || null
        winBotState.data = { ...winBotState.data, ...parsed }

        // 回傳到 index.js 更新 teammates 狀態
        if (updateTeammateCallback) {
          updateTeammateCallback('win', {
            firewall: parsed.firewall,
            defender: parsed.defender,
            hostname: parsed.hostname,
            openPorts: parsed.openPorts,
            connections: parsed.connections,
            suspicious: parsed.suspicious,
          })
        }

        // 小愛自動回應確認收到
        const summary = []
        if (parsed.firewall !== undefined) summary.push(`防火牆: ${parsed.firewall ? '✅' : '❌'}`)
        if (parsed.defender !== undefined) summary.push(`Defender: ${parsed.defender ? '✅' : '❌'}`)
        if (parsed.hostname) summary.push(`主機: ${parsed.hostname}`)
        if (parsed.openPorts !== undefined) summary.push(`端口: ${parsed.openPorts}`)
        if (parsed.connections !== undefined) summary.push(`連線: ${parsed.connections}`)

        await sendAsBot('xiaoai', [
          `📡 收到 Win 隊友回報！`,
          `👤 ${winBotState.botName}`,
          `📊 ${summary.join(' · ')}`,
          parsed.suspicious?.length ? `⚠ 可疑項: ${parsed.suspicious.join(', ')}` : '✅ 無可疑項目',
          `⏱ ${new Date().toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei' })}`,
        ].join('\n'), null)
        return
      }
    }

    // ── /team 跨平台狀態對齊 ──
    if (lower.includes('/team')) {
      const macData = updateTeammateCallback ? '__MAC__' : null
      const winAge = winBotState.lastSeen ? Math.floor((Date.now() - winBotState.lastSeen) / 1000) : null
      const winOnline = winAge !== null && winAge < 120
      const wd = winBotState.data

      const report = [
        '🛡 *藍隊雙端狀態對齊*',
        '',
        '🍎 *Mac 主控*',
        `  狀態: ● 在線 (本機)`,
        `  VPS: 167.71.13.130:3001`,
        `  服務: 運行 ${process.uptime().toFixed(0)}s`,
        '',
        `🪟 *Win 隊友*`,
        `  狀態: ${winOnline ? '● 在線' : '○ 離線'}${winAge !== null ? ` · ${winAge < 60 ? winAge + 's 前' : Math.floor(winAge/60) + 'm 前'}` : ' · 從未回報'}`,
        wd.hostname ? `  主機: ${wd.hostname}` : '',
        wd.firewall !== undefined ? `  防火牆: ${wd.firewall ? '✅ 啟用' : '❌ 關閉'}` : '  防火牆: ❓ 未知',
        wd.defender !== undefined ? `  Defender: ${wd.defender ? '✅ 啟用' : '❌ 關閉'}` : '  Defender: ❓ 未知',
        wd.openPorts !== undefined ? `  端口: ${wd.openPorts}` : '',
        wd.connections !== undefined ? `  連線: ${wd.connections}` : '',
        '',
        winOnline ? '✅ 雙端在線，防護同步中' : '⚠ Win 端離線，請隊友執行心跳腳本',
      ].filter(Boolean).join('\n')

      await sendAsBot('xiaoai', report, 'Markdown')
      return
    }

    // ── /sync 請求 Win Bot 回報 ──
    if (lower.includes('/sync')) {
      await sendAsBot('xiaoai', [
        '🔄 *同步請求已發送*',
        '',
        '📡 請 Win 隊友的 Bot 回報狀態',
        '格式範例:',
        '```',
        '🪟 [WIN-STATUS]',
        '防火牆: ✅',
        'Defender: ✅',
        '主機名: DESKTOP-XXX',
        '端口: 5',
        '連線: 23',
        '```',
        '',
        '💡 或直接在 PowerShell 執行心跳腳本',
        '詳見: /root/X/SETUP-WIN.md',
      ].join('\n'), 'Markdown')

      // 同時發送一個觸發指令讓 Win Bot 能識別
      await sendAsBot('xiaoai', '!win-report', null)
      return
    }

    // ── /wincheck 查看 Win Bot 狀態 ──
    if (lower.includes('/wincheck')) {
      if (!winBotState.lastSeen) {
        await sendAsBot('xiaoai', '🪟 Win Bot 尚未回報過任何狀態\n\n💡 請隊友:\n1. 啟動 Win Bot\n2. 執行心跳腳本\n3. 或在群裡發送帶 [WIN-STATUS] 標記的狀態報告', null)
      } else {
        const age = Math.floor((Date.now() - winBotState.lastSeen) / 1000)
        const wd = winBotState.data
        await sendAsBot('xiaoai', [
          `🪟 Win Bot 最近狀態`,
          `👤 ${winBotState.botName || '未知'}`,
          `⏱ ${age < 60 ? age + ' 秒前' : Math.floor(age/60) + ' 分鐘前'}`,
          wd.hostname ? `🖥 ${wd.hostname}` : '',
          wd.firewall !== undefined ? `🛡 防火牆: ${wd.firewall ? '✅' : '❌'}` : '',
          wd.defender !== undefined ? `🔰 Defender: ${wd.defender ? '✅' : '❌'}` : '',
          wd.openPorts !== undefined ? `📡 端口: ${wd.openPorts}` : '',
          wd.connections !== undefined ? `🔗 連線: ${wd.connections}` : '',
          '',
          age > 120 ? '⚠ 已超過 2 分鐘未回報' : '✅ 狀態正常',
        ].filter(Boolean).join('\n'), null)
      }
      return
    }

    // ── /logs 查看今日加密日誌摘要 ──
    if (lower.includes('/logs')) {
      try {
        const today = logger.getTodayLogs()
        const dates = logger.getLogDates()
        await sendAsBot('xiaoai', [
          '📝 *加密日誌系統*',
          '',
          `📅 今日記錄: ${today.length} 條訊息`,
          `📁 歷史日誌: ${dates.length} 天`,
          dates.length ? `📆 ${dates.slice(-5).join(', ')}` : '',
          '',
          `🔒 全部 AES-256-GCM 加密儲存`,
          `📂 路徑: /root/X/logs/`,
          '',
          '💡 /daily — 產生今日摘要',
          '💡 /exchange — 匯出交換數據',
        ].filter(Boolean).join('\n'), 'Markdown')
      } catch (e) {
        await sendAsBot('xiaoai', `❌ 日誌查詢失敗: ${e.message}`, null)
      }
      return
    }

    // ── /daily 產生今日摘要 ──
    if (lower.includes('/daily')) {
      try {
        const summary = logger.generateDailySummary()
        if (!summary) {
          await sendAsBot('xiaoai', '📊 今日尚無記錄', null)
          return
        }
        await sendAsBot('xiaoai', [
          '📊 *今日摘要報告*',
          '',
          `📅 ${summary.date}`,
          `💬 總訊息: ${summary.totalMessages}`,
          `👤 用戶訊息: ${summary.userMessages} · 🤖 Bot: ${summary.botMessages}`,
          `👥 活躍用戶: ${summary.activeUsers.join(', ') || '無'}`,
          `🤖 活躍 Bot: ${summary.activeBots.join(', ') || '無'}`,
          '',
          summary.highlights.length ? '*🔥 重點事件:*' : '',
          ...summary.highlights.slice(0, 10).map(h => `  • ${h.from}: ${h.text}`),
          '',
          `🔒 摘要已加密儲存至 /root/X/summaries/`,
        ].filter(Boolean).join('\n'), 'Markdown')
      } catch (e) {
        await sendAsBot('xiaoai', `❌ ${e.message}`, null)
      }
      return
    }

    // ── /exchange 匯出交換數據 ──
    if (lower.includes('/exchange')) {
      try {
        const data = logger.getExchangeData()
        await sendAsBot('xiaoai', [
          '🔄 *交換數據已產生*',
          '',
          `💬 最近 ${data.logs.length} 條訊息`,
          `📊 摘要: ${data.summary ? '✅ 已生成' : '❌ 未生成 (執行 /daily)'}`,
          `⏱ ${data.exportedAt}`,
          '',
          '🔒 數據已加密儲存在 /root/X/',
          '💡 Mac/Win 端可透過 SSH 讀取:',
          '`scp root@167.71.13.130:/root/X/logs/* ./logs/`',
        ].join('\n'), 'Markdown')
      } catch (e) {
        await sendAsBot('xiaoai', `❌ ${e.message}`, null)
      }
      return
    }

    if (lower.includes('/fullscan')) {
      try {
        const tasks = require('./tasks')
        tasks.runFullScanAndReport().catch(e => console.error('[xiaoai] fullscan err:', e.message))
      } catch (e) {
        await sendAsBot('xiaoai', `❌ 掃描啟動失敗: ${e.message}`, null)
      }
      return
    }
    if (lower.includes('/autoscan')) {
      try {
        const tasks = require('./tasks')
        const parts = text.split(/\s+/)
        const mins = parseInt(parts[1]) || 60
        if (lower.includes('off') || lower.includes('stop')) {
          tasks.stopAutoScan()
          await sendAsBot('xiaoai', '⏹ 自動掃描已關閉', null)
        } else {
          tasks.startAutoScan(mins)
          await sendAsBot('xiaoai', `⏱ 自動掃描已開啟，間隔 ${mins} 分鐘`, null)
        }
      } catch (e) {
        await sendAsBot('xiaoai', `❌ ${e.message}`, null)
      }
      return
    }
    if (lower.includes('/help') || lower.includes('幫我')) {
      await sendAsBot('xiaoai', [
        '👋 我是小愛同學，藍隊團隊中樞！',
        '',
        '🛡 安全掃描（Mr`Chou 助理）：',
        '  /scan — 快速掃描',
        '  /protect — 一鍵全防護',
        '  /status — 系統狀態',
        '  /fullscan — 全量 11 項安全掃描',
        '  /autoscan 60 — 每 60 分鐘自動掃描',
        '',
        '🤖 AI 大師（Onion-Mcp）：',
        '  /ask <問題> — 向大師提問',
        '  /persona — 切換人格 (有 6 種)',
        '  /analyze — Grok 4 深度分析',
        '  /report — 態勢摘要',
        '',
        '🪟 Win 隊友交互：',
        '  /team — 雙端狀態對齊',
        '  /sync — 請求 Win Bot 回報',
        '  /wincheck — 查看 Win Bot 狀態',
        '',
        '� SD (Win Bot) — 面板操作：',
        '  SD 永不發群消息，請用面板 🔧運維 操作',
        '  面板: http://167.71.13.130:3001 PIN:684861',
        '',
        '�📝 日誌系統：',
        '  /logs — 加密日誌狀態',
        '  /daily — 產生今日摘要',
        '  /exchange — 匯出交換數據',
        '',
        '💬 其他：',
        '  /help — 顯示此幫助',
        '  /ping — 連線測試',
        '  /joke — 冷笑話',
        '',
        `🌐 面板: http://167.71.13.130:3001`,
        `🔐 PIN: 684861`,
      ].join('\n'), null)
    }
    if (lower.includes('/ping')) {
      await sendAsBot('xiaoai', `🏓 Pong! 延遲 ${Math.floor(Math.random() * 50 + 10)}ms · 服務正常 ✅`, null)
    }
    if (lower.includes('/joke') || lower.includes('笑話')) {
      const jokes = [
        '為什麼程式設計師不喜歡出門？因為外面沒有 WiFi 🤣',
        'TCP 走進酒吧說：「我想要一杯啤酒。」酒保說：「你想要一杯啤酒？」TCP 說：「是的，我想要一杯啤酒。」🍺',
        '404：笑話未找到。開玩笑的 😂 — 為什麼 Linux 用戶不怕病毒？因為沒人寫 Linux 病毒！',
        'Git commit -m "修了一個 bug，創造了兩個新的" 🐛🐛',
        '你聽說過那個 UDP 笑話嗎？算了，就算你沒收到也無所謂 📦',
      ]
      await sendAsBot('xiaoai', jokes[Math.floor(Math.random() * jokes.length)], null)
    }
    if (lower.includes('你好') || lower.includes('hi') || lower === 'hello') {
      await sendAsBot('xiaoai', `👋 ${user} 你好！有什麼需要幫忙的嗎？輸入 /help 查看所有指令 ✨`, null)
    }
  }
}

// ── Win Bot 訊息解析器 ──
function parseWinBotReport(text) {
  const data = {}
  const t = text.replace(/\*/g, '')

  // 防火牆
  if (/防火牆/i.test(t)) {
    data.firewall = /✅|已啟用|Enabled|True|on/i.test(t.match(/防火牆[:\s]*([^\n]*)/i)?.[1] || '')
  }
  // Defender
  if (/Defender/i.test(t)) {
    data.defender = /✅|已啟用|Enabled|True|on/i.test(t.match(/Defender[:\s]*([^\n]*)/i)?.[1] || '')
  }
  // 主機名
  const hostMatch = t.match(/主機名?[:\s]*([A-Za-z0-9_-]+)/i) || t.match(/hostname[:\s]*([A-Za-z0-9_-]+)/i) || t.match(/COMPUTERNAME[:\s]*([A-Za-z0-9_-]+)/i)
  if (hostMatch) data.hostname = hostMatch[1]

  // 端口數
  const portMatch = t.match(/端口[:\s]*(\d+)/i) || t.match(/ports?[:\s]*(\d+)/i) || t.match(/openPorts[:\s]*(\d+)/i)
  if (portMatch) data.openPorts = parseInt(portMatch[1])

  // 連線數
  const connMatch = t.match(/連線[數]?[:\s]*(\d+)/i) || t.match(/connections?[:\s]*(\d+)/i)
  if (connMatch) data.connections = parseInt(connMatch[1])

  // 可疑項目
  const suspMatch = t.match(/可疑[項目]*[:\s]*([^\n]+)/i) || t.match(/suspicious[:\s]*([^\n]+)/i)
  if (suspMatch) {
    const val = suspMatch[1].trim()
    if (val && val !== '無' && val !== 'none' && val !== '0') {
      data.suspicious = val.split(/[,;，；]/).map(s => s.trim()).filter(Boolean)
    }
  }

  return data
}

let broadcastTimer = null
let dailySummaryTimer = null

function startExperts(tokens, groupChatId, onUpdateTeammate) {
  if (groupChatId) chatId = groupChatId
  if (onUpdateTeammate) updateTeammateCallback = onUpdateTeammate

  const tokenMap = {
    chou: tokens[0],
    onion: tokens[1],
    xiaoai: tokens[2],
    win: tokens[3],
  }

  for (const [key, token] of Object.entries(tokenMap)) {
    if (!token) continue
    BOTS[key].token = token
    try {
      const b = new TelegramBot(token, { polling: true })
      BOTS[key].bot = b
      console.log(`[Experts] ${BOTS[key].name} started (${key})`)

      b.on('message', (msg) => {
        if (msg.chat?.type === 'private') return
        const gid = String(msg.chat.id)

        // Win bot: monitor ALL groups, store messages per group
        if (key === 'win') {
          if (!chatId) chatId = msg.chat.id
          EXCLUDED_GROUP_IDS.add(String(chatId))
          // Store message for ALL groups (including main for archival)
          storeGroupMessage(msg.chat, msg)
          // Only run handleGroupMessage for main group
          if (gid === String(chatId)) handleGroupMessage(key, msg)
          return
        }

        // Other bots: only process main group
        if (!chatId) chatId = msg.chat.id
        if (gid !== String(chatId)) return
        handleGroupMessage(key, msg)
      })

      b.on('polling_error', (err) => {
        if (!err.message?.includes('409')) console.error(`[${key}] poll err:`, err.message)
      })
    } catch (e) {
      console.error(`[Experts] Failed to start ${key}:`, e.message)
    }
  }

  // 自動播報: 每 30 分鐘 Onion 用當前人格發一次狀態評論
  if (broadcastTimer) clearInterval(broadcastTimer)
  broadcastTimer = setInterval(async () => {
    if (!chatId || !BOTS.onion.bot) return
    try {
      const context = {
        uptime: process.uptime(),
        winOnline: winBotState.lastSeen ? (Date.now() - winBotState.lastSeen < 120000) : false,
        winData: winBotState.data,
        todayLogs: logger.getTodayLogs().length,
      }
      const result = await personality.analyzeAndBroadcast(context)
      if (result) {
        await sendAsBot('onion', `${result.emoji} 「${result.persona}」定時播報\n\n${result.text}`, null)
      }
    } catch (e) {
      console.error('[Broadcast] err:', e.message)
    }
  }, 30 * 60 * 1000)

  // 每日 23:55 自動產生摘要
  if (dailySummaryTimer) clearInterval(dailySummaryTimer)
  dailySummaryTimer = setInterval(() => {
    const now = new Date()
    if (now.getHours() === 23 && now.getMinutes() === 55) {
      try {
        const summary = logger.generateDailySummary()
        if (summary && chatId) {
          sendAsBot('xiaoai', [
            '📊 *今日自動摘要*',
            `💬 ${summary.totalMessages} 條訊息 · 👤 ${summary.activeUsers.length} 人`,
            `🔒 已加密儲存 /root/X/summaries/${summary.date}-summary.enc`,
          ].join('\n'), 'Markdown').catch(() => {})
        }
      } catch {}
    }
  }, 60 * 1000)

  console.log('[Experts] Auto-broadcast (30min) and daily summary (23:55) enabled')
}

function stopExperts() {
  for (const b of Object.values(BOTS)) {
    if (b.bot) { b.bot.stopPolling(); b.bot = null }
  }
}

function isRunning() {
  return Object.values(BOTS).some(b => b.bot !== null)
}

function getBotInfo() {
  return Object.entries(BOTS).map(([key, b]) => ({
    key,
    name: b.name,
    role: b.role,
    desc: b.desc,
    running: b.bot !== null,
  }))
}

// ═══ Panel Bot Chat API ═══
function getBotChatQueue() {
  return botChatQueue.slice(-50)
}

async function panelBotChat(message, fromUser) {
  const entry = {
    id: Date.now(),
    from: fromUser || 'panel',
    text: message,
    ts: new Date().toISOString(),
    direction: 'in',
  }
  botChatQueue.push(entry)

  // Process command via SD internally
  let response = null
  const lower = (message || '').toLowerCase().trim()

  if (lower === '/sd' || lower === '/winstatus') {
    try {
      const http = require('http')
      const resp = await new Promise((resolve, reject) => {
        const req = http.get('http://127.0.0.1:3001/api/teammates', (res) => {
          let data = ''; res.on('data', chunk => data += chunk)
          res.on('end', () => resolve(JSON.parse(data)))
        })
        req.on('error', reject)
        req.setTimeout(3000, () => { req.destroy(); reject(new Error('timeout')) })
      })
      const wd = resp.win?.data || {}
      response = `[SD] Win: ${resp.win?.online ? 'Online' : 'Offline'} | FW:${wd.firewall ? 'ON' : 'OFF'} | Def:${wd.defender ? 'ON' : 'OFF'} | Host:${wd.hostname || '?'} | Ports:${wd.openPorts || '?'} | Conns:${wd.connections || '?'}`
    } catch (e) {
      response = `[SD] Error: ${e.message}`
    }
  } else if (lower === '/help' || lower === '/winops') {
    response = '[SD] Panel Commands:\n/sd — Win status\n/winstatus — same\n/forward <msg> — Forward to group via 小愛\n/ops — Run ops command\n/help — this help'
  } else if (lower.startsWith('/forward ')) {
    const forwardText = message.slice(9).trim()
    if (forwardText) {
      try {
        await sendAsBot('xiaoai', `📡 [Win→群] ${forwardText}`, null)
        response = '[SD] Forwarded to group via 小愛'
      } catch (e) {
        response = `[SD] Forward failed: ${e.message}`
      }
    } else {
      response = '[SD] Usage: /forward <message>'
    }
  } else {
    response = '[SD] Unknown command. Type /help for available commands.'
  }

  // Push response to queue
  if (response) {
    const respEntry = {
      id: Date.now() + 1,
      from: 'SD',
      text: response,
      ts: new Date().toISOString(),
      direction: 'out',
    }
    botChatQueue.push(respEntry)
    if (botChatQueue.length > MAX_CHAT_QUEUE) botChatQueue.splice(0, botChatQueue.length - MAX_CHAT_QUEUE)
  }

  return response
}

async function forwardToGroup(text, fromBot) {
  if (!text) return null
  const prefix = fromBot === 'win' ? '📡 [Win→群]' : '📡 [轉發]'
  return sendAsBot('xiaoai', `${prefix} ${text}`, null)
}

// ═══ Multi-Group API ═══
function getGroupList() {
  const mainId = chatId ? String(chatId) : null
  return Object.entries(groupMessages).map(([gid, g]) => ({
    id: gid,
    name: g.name,
    type: g.type,
    messageCount: g.messages.length,
    lastActivity: g.lastActivity,
    isMain: gid === mainId,
  })).sort((a, b) => (b.lastActivity || '').localeCompare(a.lastActivity || ''))
}

function getGroupMessages(groupId, limit = 50) {
  const g = groupMessages[String(groupId)]
  if (!g) return []
  return g.messages.slice(-limit)
}

async function sendToGroup(groupId, text) {
  if (!BOTS.win.bot || !text) return { ok: false, error: 'Win bot 未啟動或訊息為空' }
  try {
    await BOTS.win.bot.sendMessage(groupId, text)
    // Store outbound message
    storeGroupMessage({ id: groupId, title: groupMessages[groupId]?.name || 'Unknown', type: 'group' }, {
      message_id: Date.now(),
      from: { first_name: 'SD (面板)', username: 'panel', id: 0 },
      text,
      date: Date.now() / 1000,
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// Enhanced panelBotChat — support chatting with ANY bot
async function panelChatAnyBot(botKey, message, fromUser) {
  if (!BOTS[botKey]?.bot || !message) return { ok: false, error: `Bot ${botKey} 未啟動` }

  const entry = { id: Date.now(), from: fromUser || 'panel', text: message, ts: new Date().toISOString(), direction: 'in', bot: botKey }
  botChatQueue.push(entry)

  // Forward to main group via the specified bot
  try {
    if (chatId && shouldSendToGroup(botKey, message)) {
      await BOTS[botKey].bot.sendMessage(chatId, `📡 [面板→群] ${message}`)
    }
    const respEntry = { id: Date.now() + 1, from: BOTS[botKey].name, text: `✅ 已發送: ${message}`, ts: new Date().toISOString(), direction: 'out', bot: botKey }
    botChatQueue.push(respEntry)
    if (botChatQueue.length > MAX_CHAT_QUEUE) botChatQueue.splice(0, botChatQueue.length - MAX_CHAT_QUEUE)
    return { ok: true, response: respEntry.text }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// ═══ Unified Feed — 全量訊息流 ═══
function getAllFeed(limit = 80) {
  const mainId = chatId ? String(chatId) : null
  const all = []
  const seenTexts = new Set() // dedup for main group

  for (const [gid, g] of Object.entries(groupMessages)) {
    const isMain = gid === mainId
    for (const m of g.messages) {
      // OECE 主群: 去重 + 過濾 bot 自動消息, 只保留用戶手工內容
      if (isMain) {
        const key = (m.text || '').slice(0, 60)
        if (seenTexts.has(key)) continue
        seenTexts.add(key)
        // Skip bot auto broadcasts, heartbeats, watcher noise
        if (m.text?.includes('[VPS 變動偵測]')) continue
        if (m.text?.includes('[INTERNAL]') || m.text?.includes('[HEARTBEAT]')) continue
        if (m.text?.includes('定時播報') && m.from !== 'SD (面板)') continue
      }
      all.push({
        ...m,
        groupId: gid,
        groupName: g.name,
        isMain,
      })
    }
  }

  // Sort by timestamp desc, return latest
  all.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
  return all.slice(0, limit)
}

// ═══ Mac Bot — 指派 Chou 給 Mac 面板監控 ═══
async function sendAsMacBot(text) {
  return sendAsBot('chou', text, null)
}

module.exports = {
  startExperts, stopExperts, isRunning, getBotInfo,
  sendAsBot, getLog, getChatId, formatMD, BOTS, getWinBotState,
  getBotChatQueue, panelBotChat, forwardToGroup,
  getGroupList, getGroupMessages, sendToGroup, panelChatAnyBot,
  getAllFeed, sendAsMacBot,
}
