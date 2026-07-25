const { appendEncryptedLog, readEncryptedLog, listEncryptedLogs, saveEncrypted, loadEncrypted, X_DIR } = require('./crypto-store')
const path = require('path')
const fs = require('fs')

const LOG_DIR = 'logs'
const SUMMARY_DIR = 'summaries'

function todayFile() {
  return `${LOG_DIR}/${new Date().toISOString().slice(0, 10)}.enc`
}

function logMessage(entry) {
  const record = {
    id: entry.id || Date.now(),
    from: entry.from || 'unknown',
    fromBot: entry.fromBot || false,
    botName: entry.botName || null,
    text: (entry.text || '').slice(0, 2000),
    chatId: entry.chatId || null,
    ts: entry.ts || new Date().toISOString(),
    platform: entry.platform || 'telegram',
  }
  try {
    appendEncryptedLog(todayFile(), record)
  } catch (e) {
    console.error('[Logger] write error:', e.message)
  }
  return record
}

function getTodayLogs() {
  return readEncryptedLog(todayFile())
}

function getLogsByDate(dateStr) {
  return readEncryptedLog(`${LOG_DIR}/${dateStr}.enc`)
}

function getLogDates() {
  return listEncryptedLogs(LOG_DIR).map(f => f.replace('.enc', ''))
}

function generateDailySummary(dateStr) {
  const logs = dateStr ? getLogsByDate(dateStr) : getTodayLogs()
  if (!logs.length) return null

  const botMessages = logs.filter(l => l.fromBot)
  const userMessages = logs.filter(l => !l.fromBot)
  const users = [...new Set(userMessages.map(l => l.from))]
  const bots = [...new Set(botMessages.map(l => l.botName).filter(Boolean))]

  const summary = {
    date: dateStr || new Date().toISOString().slice(0, 10),
    totalMessages: logs.length,
    userMessages: userMessages.length,
    botMessages: botMessages.length,
    activeUsers: users,
    activeBots: bots,
    timeRange: {
      first: logs[0]?.ts,
      last: logs[logs.length - 1]?.ts,
    },
    highlights: logs.filter(l =>
      l.text.includes('/fullscan') || l.text.includes('/analyze') ||
      l.text.includes('❌') || l.text.includes('CRITICAL') ||
      l.text.includes('[WIN') || l.text.includes('掃描完成')
    ).map(l => ({ ts: l.ts, from: l.from, text: l.text.slice(0, 100) })).slice(0, 20),
    generatedAt: new Date().toISOString(),
  }

  const d = dateStr || new Date().toISOString().slice(0, 10)
  saveEncrypted(`${SUMMARY_DIR}/${d}-summary.enc`, summary)
  return summary
}

function getExchangeData() {
  const today = getTodayLogs()
  const summary = loadEncrypted(`${SUMMARY_DIR}/${new Date().toISOString().slice(0, 10)}-summary.enc`)
  return {
    logs: today.slice(-50),
    summary,
    exportedAt: new Date().toISOString(),
  }
}

function exportPlaintext(dateStr) {
  const logs = dateStr ? getLogsByDate(dateStr) : getTodayLogs()
  return logs.map(l => {
    const who = l.fromBot ? `[BOT:${l.botName}]` : `[${l.from}]`
    return `${l.ts} ${who} ${l.text}`
  }).join('\n')
}

module.exports = { logMessage, getTodayLogs, getLogsByDate, getLogDates, generateDailySummary, getExchangeData, exportPlaintext }
