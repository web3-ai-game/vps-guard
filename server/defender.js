/**
 * BLUE TEAM Auto-Defender — 自動防禦 + 小愛播報戰績
 *
 * Features:
 * - Real-time log monitoring (auth.log + nginx)
 * - 3-strike auto-ban via UFW
 * - Threat intelligence tracking (IP → attacks → ban)
 * - 小愛 TG broadcast of battle reports
 * - Honeypot/tarpit detection
 * - Whitelist zero-trust enforcement
 */

const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

// ════════════════════════════════════════
// Threat Database (in-memory + file-backed)
// ════════════════════════════════════════
const THREAT_DB_PATH = path.join(__dirname, '..', 'data', 'threats.json')
const WHITELIST_PATH = path.join(__dirname, '..', 'data', 'whitelist.json')
const BAN_THRESHOLD = 3
const REPORT_INTERVAL = 30 * 60 * 1000 // 30min battle report

let threats = {}        // { ip: { count, firstSeen, lastSeen, types: [], usernames: [], banned, banTime } }
let battleStats = { totalBlocked: 0, totalScans: 0, totalBrute: 0, bannedToday: 0, sessionStart: new Date().toISOString() }
let sendTgMessage = null // injected from experts.js

// Whitelist — zero trust
const DEFAULT_WHITELIST = [
  '127.0.0.1',
  '::1',
  // DigitalOcean internal monitoring
  '10.0.0.0/8',
  '169.254.169.254',
]

let whitelist = [...DEFAULT_WHITELIST]

// ════════════════════════════════════════
// Persistence
// ════════════════════════════════════════
function ensureDataDir() {
  const dir = path.join(__dirname, '..', 'data')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function loadThreats() {
  try {
    ensureDataDir()
    if (fs.existsSync(THREAT_DB_PATH)) {
      threats = JSON.parse(fs.readFileSync(THREAT_DB_PATH, 'utf-8'))
      console.log(`[Defender] Loaded ${Object.keys(threats).length} threat records`)
    }
  } catch (e) { console.error('[Defender] Load threats error:', e.message) }
}

function saveThreats() {
  try {
    ensureDataDir()
    fs.writeFileSync(THREAT_DB_PATH, JSON.stringify(threats, null, 2))
  } catch (e) { console.error('[Defender] Save threats error:', e.message) }
}

function loadWhitelist() {
  try {
    ensureDataDir()
    if (fs.existsSync(WHITELIST_PATH)) {
      const data = JSON.parse(fs.readFileSync(WHITELIST_PATH, 'utf-8'))
      whitelist = [...DEFAULT_WHITELIST, ...(data.ips || [])]
      console.log(`[Defender] Loaded ${whitelist.length} whitelist entries`)
    }
  } catch (e) { console.error('[Defender] Load whitelist error:', e.message) }
}

function saveWhitelist() {
  try {
    ensureDataDir()
    const custom = whitelist.filter(ip => !DEFAULT_WHITELIST.includes(ip))
    fs.writeFileSync(WHITELIST_PATH, JSON.stringify({ ips: custom, updated: new Date().toISOString() }, null, 2))
  } catch (e) {}
}

// ════════════════════════════════════════
// IP Classification
// ════════════════════════════════════════
function isWhitelisted(ip) {
  return whitelist.some(w => {
    if (w.includes('/')) {
      // CIDR check (simplified for /8 /16 /24)
      const [net, bits] = w.split('/')
      const mask = parseInt(bits)
      if (mask === 8) return ip.startsWith(net.split('.')[0] + '.')
      if (mask === 16) return ip.startsWith(net.split('.').slice(0, 2).join('.') + '.')
      if (mask === 24) return ip.startsWith(net.split('.').slice(0, 3).join('.') + '.')
    }
    return ip === w
  })
}

function recordThreat(ip, type, detail) {
  if (isWhitelisted(ip)) return null
  if (!threats[ip]) {
    threats[ip] = { count: 0, firstSeen: new Date().toISOString(), lastSeen: null, types: [], usernames: [], banned: false, banTime: null, details: [] }
  }
  const t = threats[ip]
  t.count++
  t.lastSeen = new Date().toISOString()
  if (!t.types.includes(type)) t.types.push(type)
  if (detail && !t.details.includes(detail)) {
    t.details.push(detail)
    if (t.details.length > 20) t.details.splice(0, t.details.length - 20)
  }

  // Track usernames for SSH brute force
  if (type === 'ssh_brute' && detail) {
    const username = detail.match(/user (\S+)/)?.[1]
    if (username && !t.usernames.includes(username)) {
      t.usernames.push(username)
      if (t.usernames.length > 10) t.usernames.splice(0, t.usernames.length - 10)
    }
  }

  battleStats.totalScans++
  if (type === 'ssh_brute') battleStats.totalBrute++

  // Auto-ban at threshold
  if (t.count >= BAN_THRESHOLD && !t.banned) {
    banIP(ip, `Auto-ban: ${t.count} strikes [${t.types.join(',')}]`)
    return { action: 'BANNED', ip, count: t.count, types: t.types }
  }

  return { action: 'TRACKED', ip, count: t.count, types: t.types }
}

// ════════════════════════════════════════
// Ban / Unban
// ════════════════════════════════════════
function banIP(ip, reason) {
  if (isWhitelisted(ip)) return false
  const t = threats[ip] || {}

  // UFW ban
  const ufw = spawn('ufw', ['insert', '1', 'deny', 'from', ip, 'to', 'any', 'comment', `defender:${reason.slice(0, 40)}`])
  ufw.on('close', (code) => {
    if (code === 0) {
      console.log(`[Defender] BANNED ${ip} — ${reason}`)
      if (threats[ip]) {
        threats[ip].banned = true
        threats[ip].banTime = new Date().toISOString()
      }
      battleStats.totalBlocked++
      battleStats.bannedToday++
      saveThreats()

      // 小愛播報
      broadcastBan(ip, reason)
    }
  })
  return true
}

function broadcastBan(ip, reason) {
  if (!sendTgMessage) return
  const t = threats[ip] || {}
  const emoji = t.types?.includes('ssh_brute') ? '🔒' : t.types?.includes('web_scan') ? '🛡' : '⚔️'
  const msg = [
    `${emoji} [自動防禦] 敵方已殲滅`,
    `━━━━━━━━━━━━━━━━`,
    `🎯 IP: \`${ip}\``,
    `💀 攻擊次數: ${t.count || '?'}`,
    `🔍 攻擊類型: ${(t.types || []).join(', ')}`,
    t.usernames?.length ? `👤 嘗試用戶: ${t.usernames.slice(-5).join(', ')}` : null,
    `📋 原因: ${reason}`,
    `⏰ 首次發現: ${t.firstSeen || 'N/A'}`,
    `🚫 狀態: 永久封禁 (UFW DROP)`,
    `━━━━━━━━━━━━━━━━`,
    `📊 今日戰績: ${battleStats.bannedToday} 殲滅 | ${battleStats.totalScans} 偵測`,
  ].filter(Boolean).join('\n')

  sendTgMessage(msg)
}

// ════════════════════════════════════════
// Log Watchers — Real-time monitoring
// ════════════════════════════════════════
let watchers = []

function startAuthLogWatcher() {
  // Watch auth.log for SSH attacks
  const tail = spawn('tail', ['-F', '-n', '0', '/var/log/auth.log'])
  watchers.push(tail)

  tail.stdout.on('data', (data) => {
    const lines = data.toString().split('\n')
    for (const line of lines) {
      if (!line.trim()) continue

      // Invalid user (brute force)
      const invalidMatch = line.match(/Invalid user (\S+) from ([\d.]+)/)
      if (invalidMatch) {
        const [, user, ip] = invalidMatch
        const result = recordThreat(ip, 'ssh_brute', `Invalid user ${user}`)
        if (result?.action === 'BANNED') {
          console.log(`[Defender] SSH brute force auto-ban: ${ip} (tried: ${user})`)
        }
        continue
      }

      // Failed password
      const failedMatch = line.match(/Failed password for(?: invalid user)? (\S+) from ([\d.]+)/)
      if (failedMatch) {
        const [, user, ip] = failedMatch
        recordThreat(ip, 'ssh_brute', `Failed password for ${user}`)
        continue
      }

      // Connection closed by authenticating user (password spray)
      const sprayMatch = line.match(/Disconnected from authenticating user (\S+) ([\d.]+)/)
      if (sprayMatch) {
        const [, user, ip] = sprayMatch
        recordThreat(ip, 'ssh_spray', `Spray disconnect ${user}`)
        continue
      }
    }
  })

  tail.on('error', (e) => console.error('[Defender] auth.log watcher error:', e.message))
  console.log('[Defender] auth.log watcher started')
}

function startNginxLogWatcher() {
  const logPath = '/var/log/nginx/access.log'
  if (!fs.existsSync(logPath)) { console.log('[Defender] nginx access.log not found, skipping'); return }

  const tail = spawn('tail', ['-F', '-n', '0', logPath])
  watchers.push(tail)

  // Sensitive path patterns
  const SCAN_PATTERNS = /\.(env|git|php|sql|bak|backup|config|yml|yaml|ini|log|old|save|swp|db|sqlite)(\s|\/|\?|$)/i
  const EXPLOIT_PATTERNS = /wp-(admin|login|content|includes)|phpmyadmin|xmlrpc|eval\(|exec\(|shell|admin-ajax|setup\.php|install\.php|phpinfo|\.well-known\/security/i
  const TOOL_UA_PATTERNS = /sqlmap|nikto|nmap|masscan|zgrab|dirbuster|gobuster|nuclei|wpscan|burpsuite|acunetix|nessus|openvas|hydra|medusa|metasploit|curl\/|wget\/|python-requests|Go-http-client/i

  tail.stdout.on('data', (data) => {
    const lines = data.toString().split('\n')
    for (const line of lines) {
      if (!line.trim()) continue
      const ipMatch = line.match(/^([\d.]+)/)
      if (!ipMatch) continue
      const ip = ipMatch[1]

      // Check for scan patterns in URL
      const urlMatch = line.match(/"(GET|POST|HEAD|PUT|DELETE|OPTIONS) ([^"]+)"/)
      const statusMatch = line.match(/" (\d{3}) /)
      const uaMatch = line.match(/"([^"]*)"$/)

      if (!urlMatch) continue
      const [, method, url] = urlMatch
      const status = statusMatch ? statusMatch[1] : '0'
      const ua = uaMatch ? uaMatch[1] : ''

      // Sensitive path probe
      if (SCAN_PATTERNS.test(url) || EXPLOIT_PATTERNS.test(url)) {
        recordThreat(ip, 'web_scan', `${method} ${url.slice(0, 60)} → ${status}`)
        continue
      }

      // Scanner tool user-agent
      if (TOOL_UA_PATTERNS.test(ua)) {
        recordThreat(ip, 'auto_tool', `Tool: ${ua.slice(0, 40)} → ${method} ${url.slice(0, 40)}`)
        continue
      }

      // Mass 404 (directory brute force)
      if (status === '404' || status === '444') {
        recordThreat(ip, 'dir_brute', `404 ${url.slice(0, 50)}`)
        continue
      }
    }
  })

  tail.on('error', (e) => console.error('[Defender] nginx watcher error:', e.message))
  console.log('[Defender] nginx access.log watcher started')
}

function startNginxErrorWatcher() {
  const logPath = '/var/log/nginx/error.log'
  if (!fs.existsSync(logPath)) return

  const tail = spawn('tail', ['-F', '-n', '0', logPath])
  watchers.push(tail)

  tail.stdout.on('data', (data) => {
    const lines = data.toString().split('\n')
    for (const line of lines) {
      // Rate limit violations
      const limitMatch = line.match(/limiting requests.*client: ([\d.]+)/)
      if (limitMatch) {
        recordThreat(limitMatch[1], 'rate_limit', 'Nginx rate limit exceeded')
      }
    }
  })
  console.log('[Defender] nginx error.log watcher started')
}

// ════════════════════════════════════════
// Battle Report — 定時戰績播報
// ════════════════════════════════════════
let reportTimer = null

function generateBattleReport() {
  const now = new Date()
  const activeThreats = Object.entries(threats).filter(([, t]) => {
    const lastSeen = new Date(t.lastSeen)
    return (now - lastSeen) < 24 * 60 * 60 * 1000 // last 24h
  })
  const banned = activeThreats.filter(([, t]) => t.banned)
  const topAttackers = activeThreats.sort((a, b) => b[1].count - a[1].count).slice(0, 5)

  const lines = [
    `📊 [BLUE TEAM 戰報] ${now.toLocaleString('zh-TW')}`,
    `═══════════════════════════`,
    `🛡 防禦狀態: 全自動 · 零信任`,
    `⚔️ 本輪偵測: ${battleStats.totalScans} 次威脅`,
    `💀 已殲滅: ${battleStats.totalBlocked} 個敵方 IP`,
    `🔒 SSH 爆破攔截: ${battleStats.totalBrute} 次`,
    `📋 24h 活躍威脅: ${activeThreats.length} 個`,
    `🚫 已封禁: ${banned.length} 個`,
    ``,
    `🎯 Top 5 攻擊者:`,
  ]

  for (const [ip, t] of topAttackers) {
    const status = t.banned ? '🚫已封禁' : '⚠️追蹤中'
    lines.push(`  ${status} ${ip} — ${t.count}次 [${t.types.join(',')}]`)
  }

  lines.push(``)
  lines.push(`🤖 自動防禦引擎運行中...`)
  lines.push(`━━━━ BLUE TEAM · 零信任 · 全自動 ━━━━`)

  return lines.join('\n')
}

function startBattleReportTimer() {
  // Report every 30 minutes
  reportTimer = setInterval(() => {
    if (sendTgMessage && battleStats.totalScans > 0) {
      sendTgMessage(generateBattleReport())
    }
  }, REPORT_INTERVAL)

  // Initial report after 2 minutes
  setTimeout(() => {
    if (sendTgMessage) {
      sendTgMessage(generateBattleReport())
    }
  }, 2 * 60 * 1000)
}

// ════════════════════════════════════════
// Historical scan — process existing logs
// ════════════════════════════════════════
async function scanExistingLogs() {
  console.log('[Defender] Scanning existing logs for threats...')

  // Scan auth.log
  try {
    const { execSync } = require('child_process')

    // SSH invalid users
    const sshData = execSync("grep 'Invalid user' /var/log/auth.log 2>/dev/null | grep -oP 'from \\K[0-9.]+' | sort | uniq -c | sort -rn", { encoding: 'utf-8', timeout: 10000 })
    for (const line of sshData.trim().split('\n')) {
      const match = line.trim().match(/^(\d+)\s+([\d.]+)/)
      if (match) {
        const [, countStr, ip] = match
        const count = parseInt(countStr)
        if (count >= BAN_THRESHOLD && !isWhitelisted(ip)) {
          if (!threats[ip]) {
            threats[ip] = { count, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(), types: ['ssh_brute'], usernames: [], banned: false, banTime: null, details: [`${count} invalid user attempts`] }
          } else {
            threats[ip].count = Math.max(threats[ip].count, count)
          }
        }
      }
    }

    // Nginx scanners
    const nginxData = execSync("grep -iE '\\.(env|git|php|sql)|wp-(admin|login)|phpmyadmin|xmlrpc' /var/log/nginx/access.log 2>/dev/null | grep -oP '^[0-9.]+' | sort | uniq -c | sort -rn", { encoding: 'utf-8', timeout: 10000 })
    for (const line of nginxData.trim().split('\n')) {
      const match = line.trim().match(/^(\d+)\s+([\d.]+)/)
      if (match) {
        const [, countStr, ip] = match
        const count = parseInt(countStr)
        if (count >= BAN_THRESHOLD && !isWhitelisted(ip)) {
          if (!threats[ip]) {
            threats[ip] = { count, firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(), types: ['web_scan'], usernames: [], banned: false, banTime: null, details: [`${count} nginx scan probes`] }
          } else {
            threats[ip].count = Math.max(threats[ip].count, count)
            if (!threats[ip].types.includes('web_scan')) threats[ip].types.push('web_scan')
          }
        }
      }
    }

    console.log(`[Defender] Historical scan: ${Object.keys(threats).length} threats identified`)
    saveThreats()

    // Auto-ban all threats over threshold that aren't already banned
    let newBans = 0
    for (const [ip, t] of Object.entries(threats)) {
      if (t.count >= BAN_THRESHOLD && !t.banned && !isWhitelisted(ip)) {
        banIP(ip, `Historical: ${t.count} strikes [${t.types.join(',')}]`)
        newBans++
        // Stagger bans to avoid overwhelming UFW
        await new Promise(r => setTimeout(r, 200))
      }
    }
    if (newBans > 0) console.log(`[Defender] Auto-banned ${newBans} historical threats`)

  } catch (e) {
    console.error('[Defender] Historical scan error:', e.message)
  }
}

// ════════════════════════════════════════
// API data for panel
// ════════════════════════════════════════
function getDefenderStatus() {
  const now = new Date()
  const active24h = Object.entries(threats).filter(([, t]) => {
    return (now - new Date(t.lastSeen)) < 24 * 60 * 60 * 1000
  })
  const banned = Object.entries(threats).filter(([, t]) => t.banned)
  const topAttackers = Object.entries(threats)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([ip, t]) => ({ ip, ...t }))

  return {
    running: true,
    stats: battleStats,
    totalThreats: Object.keys(threats).length,
    activeThreats24h: active24h.length,
    totalBanned: banned.length,
    topAttackers,
    whitelist: whitelist.length,
  }
}

function getThreatList(limit = 50) {
  return Object.entries(threats)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([ip, t]) => ({ ip, ...t }))
}

function addWhitelistIP(ip) {
  if (!whitelist.includes(ip)) {
    whitelist.push(ip)
    saveWhitelist()
    return true
  }
  return false
}

function removeWhitelistIP(ip) {
  const idx = whitelist.indexOf(ip)
  if (idx > -1 && !DEFAULT_WHITELIST.includes(ip)) {
    whitelist.splice(idx, 1)
    saveWhitelist()
    return true
  }
  return false
}

function manualBan(ip, reason) {
  if (isWhitelisted(ip)) return { ok: false, error: 'IP is whitelisted' }
  recordThreat(ip, 'manual', reason || 'Manual ban')
  banIP(ip, reason || 'Manual ban from panel')
  return { ok: true, ip }
}

// ════════════════════════════════════════
// Start / Stop
// ════════════════════════════════════════
function startDefender(tgSendFn) {
  sendTgMessage = tgSendFn
  loadThreats()
  loadWhitelist()

  // Start log watchers
  startAuthLogWatcher()
  startNginxLogWatcher()
  startNginxErrorWatcher()

  // Scan existing logs and auto-ban
  scanExistingLogs()

  // Start battle report timer
  startBattleReportTimer()

  // Save threats periodically
  setInterval(saveThreats, 5 * 60 * 1000)

  console.log('[Defender] Auto-defense system ONLINE — zero trust mode')
}

function stopDefender() {
  for (const w of watchers) { try { w.kill() } catch {} }
  watchers = []
  if (reportTimer) clearInterval(reportTimer)
  saveThreats()
  console.log('[Defender] Defender stopped')
}

module.exports = {
  startDefender,
  stopDefender,
  getDefenderStatus,
  getThreatList,
  addWhitelistIP,
  removeWhitelistIP,
  manualBan,
  recordThreat,
  generateBattleReport,
}
