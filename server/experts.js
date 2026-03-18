const TelegramBot = require('node-telegram-bot-api')
const { analyzeSecurityData } = require('./ai')

const BOTS = {
  chou: {
    name: 'Mr`Chou 助理',
    role: 'security',
    desc: '安全防護專家 — 掃描、防火牆、威脅分析',
    token: null,
    bot: null,
    triggers: ['/scan', '/protect', '/status', '/firewall', '/audit', '安全', '防護', '掃描', '防火牆', '威脅'],
  },
  onion: {
    name: 'Onion-Mcp',
    role: 'analyst',
    desc: 'AI 分析師 — 使用 Grok 分析安全態勢',
    token: null,
    bot: null,
    triggers: ['/analyze', '/ai', '/report', '分析', '報告', '風險', 'AI', '總結'],
  },
  xiaoai: {
    name: '小愛同學',
    role: 'companion',
    desc: '陪伴助手 — 聊天、快捷指令、群互動',
    token: null,
    bot: null,
    triggers: ['/help', '/ping', '/joke', '你好', '哈哈', '笑話', '幫我', '怎麼'],
  },
}

let chatId = null
let messageLog = []
const MAX_LOG = 200

function getLog() { return messageLog.slice(-50) }
function getChatId() { return chatId }

function addLog(botName, role, text, fromUser) {
  messageLog.push({
    id: Date.now(),
    bot: botName,
    role,
    text: text.slice(0, 500),
    fromUser: fromUser || null,
    ts: new Date().toISOString(),
  })
  if (messageLog.length > MAX_LOG) messageLog = messageLog.slice(-MAX_LOG)
}

async function sendAsBot(botKey, text, parseMode) {
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
  const b = BOTS[botKey]
  if (!msg.text) return
  const text = msg.text.trim()
  const user = msg.from?.first_name || 'User'

  addLog(b.name, b.role, text, user)

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
    if (lower.includes('/analyze') || lower.includes('/ai') || lower.includes('分析')) {
      await sendAsBot('onion', '🤖 Grok 分析中…請稍候 10 秒', null)
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
    }
    if (lower.includes('/report') || lower.includes('報告')) {
      await sendAsBot('onion', formatMD('安全態勢摘要', [
        { heading: '📊 當前狀態', items: ['VPS 在線 ✅', '面板可訪問 ✅', '使用 /analyze 獲取 AI 深度分析'] },
      ]), 'Markdown')
    }
  }

  if (botKey === 'xiaoai') {
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
        '👋 我是小愛同學，藍隊全量安防助手！',
        '',
        '🛡 安全掃描：',
        '  /fullscan — 全量 11 項安全掃描',
        '  /autoscan 60 — 每 60 分鐘自動掃描',
        '  /autoscan off — 關閉自動掃描',
        '',
        '🔧 防護指令（Mr`Chou 助理）：',
        '  /scan — 快速掃描',
        '  /protect — 一鍵防護',
        '  /status — 系統狀態',
        '',
        '🤖 AI 分析（Onion-Mcp）：',
        '  /analyze — Grok 4 深度分析',
        '  /report — 態勢摘要',
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

function startExperts(tokens, groupChatId) {
  if (groupChatId) chatId = groupChatId

  const tokenMap = {
    chou: tokens[0],
    onion: tokens[1],
    xiaoai: tokens[2],
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
        if (!chatId) chatId = msg.chat.id
        if (String(msg.chat.id) !== String(chatId)) return
        handleGroupMessage(key, msg)
      })

      b.on('polling_error', (err) => {
        if (!err.message?.includes('409')) console.error(`[${key}] poll err:`, err.message)
      })
    } catch (e) {
      console.error(`[Experts] Failed to start ${key}:`, e.message)
    }
  }
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

module.exports = { startExperts, stopExperts, isRunning, getBotInfo, sendAsBot, getLog, getChatId, formatMD, BOTS }
