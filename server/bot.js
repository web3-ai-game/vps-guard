const TelegramBot = require('node-telegram-bot-api')

let bot = null
const messageHistory = []
let teammateStatus = null

const ALLOWED_CMDS = ['!status', '!protect', '!netstat', '!ipconfig', '!dnsflush', '!ping']

function parseTeammateReport(text) {
  if (!text || !text.startsWith('[AGENT]')) return null
  const lines = text.split('\n')
  const data = { raw: text, ts: new Date().toISOString() }
  for (const line of lines) {
    const m = line.match(/^([A-Z_]+):\s*(.+)$/)
    if (m) data[m[1].toLowerCase()] = m[2].trim()
  }
  return data
}

function startBot(token, chatId) {
  if (bot) { try { bot.stopPolling() } catch {} }
  if (!token) return false

  try {
    bot = new TelegramBot(token, { polling: { interval: 2000, params: { timeout: 10 } } })

    bot.on('message', (msg) => {
      const text = msg.text || ''
      const entry = {
        id: msg.message_id,
        from: msg.from?.username || msg.from?.first_name || 'unknown',
        text,
        ts: new Date(msg.date * 1000).toISOString(),
        chatId: msg.chat.id,
      }
      messageHistory.unshift(entry)
      if (messageHistory.length > 50) messageHistory.pop()

      const parsed = parseTeammateReport(text)
      if (parsed) teammateStatus = parsed
    })

    bot.on('polling_error', () => {})
    return true
  } catch {
    return false
  }
}

function sendMessage(chatId, text) {
  if (!bot || !chatId) return Promise.reject(new Error('Bot not configured'))
  return bot.sendMessage(chatId, text)
}

function sendProtectCommand(chatId) {
  const cmd = `!protect`
  return sendMessage(chatId, cmd)
}

function sendStatusRequest(chatId) {
  return sendMessage(chatId, `!status`)
}

function getMessages() {
  return messageHistory.slice(0, 20)
}

function getTeammateStatus() {
  return teammateStatus
}

function isRunning() {
  return bot !== null
}

module.exports = {
  startBot,
  sendMessage,
  sendProtectCommand,
  sendStatusRequest,
  getMessages,
  getTeammateStatus,
  isRunning,
}
