require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const express = require('express')
const { WebSocketServer } = require('ws')
const { spawn, execFile } = require('child_process')
const cors = require('cors')
const http = require('http')
const crypto = require('crypto')
const { readEnv, writeEnv, maskKey } = require('./settings')
const bot = require('./bot')
const { analyzeSecurityData } = require('./ai')
const doApi = require('./do')
const experts = require('./experts')
const tasks = require('./tasks')
const dashboard = require('./dashboard')
const loggerModule = require('./logger')
const ops = require('./ops')
const vault = require('./vault')
const watcher = require('./watcher')
const monitor = require('./monitor')

const PIN = process.env.PIN_CODE || '684861'
const pinTokens = new Set()

const teammates = {
  mac: { online: false, lastSeen: null, data: {} },
  win: { online: false, lastSeen: null, data: {} },
}
function checkTeammateTimeout() {
  const now = Date.now()
  for (const t of Object.values(teammates)) {
    if (t.lastSeen && now - t.lastSeen > 60000) t.online = false
  }
}
setInterval(checkTeammateTimeout, 15000)

function startAllBots() {
  const tokens = [
    process.env.BOT_TOKEN_CHOU,
    process.env.BOT_TOKEN_ONION,
    process.env.BOT_TOKEN_XIAOAI,
    process.env.BOT_TOKEN_WIN,
  ].filter(Boolean)
  const groupId = process.env.TELEGRAM_CHAT_ID
  const updateTeammate = (os, data) => {
    const key = os === 'win' ? 'win' : 'mac'
    teammates[key].online = true
    teammates[key].lastSeen = Date.now()
    teammates[key].data = { ...teammates[key].data, ...data, ts: new Date().toISOString() }
  }
  if (tokens.length > 0) {
    experts.startExperts(tokens, groupId, updateTeammate)
  }
  if (process.env.TELEGRAM_BOT_TOKEN) {
    bot.startBot(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID)
  }
}
startAllBots()
setTimeout(() => dashboard.startDashboard(), 8000)
setTimeout(() => {
  monitor.startMonitor(async (text) => {
    if (experts.isRunning()) {
      await experts.sendAsBot('xiaoai', text, null)
    }
  })
}, 12000)

const path = require('path')
const app = express()
app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, '..', 'dist')))

const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

const TOOL_COMMANDS = {
  fw_status: {
    label: '防火牆狀態',
    cmd: 'ufw',
    args: ['status', 'verbose'],
  },
  fw_rules: {
    label: '防火牆規則',
    cmd: 'ufw',
    args: ['status', 'numbered'],
  },
  stealth_mode: {
    label: '開啟隱身模式',
    cmd: 'bash',
    args: ['-c', 'iptables -C INPUT -p icmp --icmp-type echo-request -j DROP 2>/dev/null && echo "✅ 隱身模式已啟用 — ICMP DROP 規則存在" || (iptables -A INPUT -p icmp --icmp-type echo-request -j DROP && echo "✅ 隱身模式已啟用 — 已新增 ICMP DROP 規則")'],
  },
  open_ports: {
    label: '開放端口探測',
    cmd: 'ss',
    args: ['-tlnp'],
  },
  self_scan: {
    label: '自我端口掃描',
    cmd: 'nmap',
    args: ['-Pn', '--top-ports', '30', '127.0.0.1'],
  },
  connections: {
    label: '活躍連線',
    cmd: 'ss',
    args: ['-tnp'],
  },
  net_info: {
    label: '網路配置',
    cmd: 'ip',
    args: ['addr', 'show'],
  },
  route_table: {
    label: '路由表',
    cmd: 'ip',
    args: ['route', 'show'],
  },
  neighbors: {
    label: '網路鄰居',
    cmd: 'ip',
    args: ['neigh', 'show'],
  },
  fail2ban: {
    label: 'Fail2Ban 狀態',
    cmd: 'fail2ban-client',
    args: ['status'],
  },
  sys_resources: {
    label: '系統資源',
    cmd: 'bash',
    args: ['-c', 'echo "=== CPU ==="; top -bn1 | head -5; echo ""; echo "=== 記憶體 ==="; free -h; echo ""; echo "=== 磁磟 ==="; df -h /; echo ""; echo "=== 運行時間 ==="; uptime'],
  },
  recent_logins: {
    label: '最近登入',
    cmd: 'last',
    args: ['-n', '20', '-a'],
  },
}

app.post('/api/pin/verify', (req, res) => {
  const { pin } = req.body
  if (pin === PIN) {
    const token = crypto.randomBytes(32).toString('hex')
    pinTokens.add(token)
    res.json({ ok: true, token })
  } else {
    res.json({ ok: false })
  }
})

app.get('/api/tools', (_req, res) => {
  const tools = Object.entries(TOOL_COMMANDS).map(([id, t]) => ({
    id,
    label: t.label,
  }))
  res.json(tools)
})

app.get('/api/status', (_req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    botRunning: bot.isRunning(),
    expertsRunning: experts.isRunning(),
    chatId: experts.getChatId(),
  })
})

app.get('/api/experts', (_req, res) => {
  res.json({ bots: experts.getBotInfo(), chatId: experts.getChatId() })
})

app.get('/api/experts/log', (_req, res) => {
  res.json({ messages: experts.getLog() })
})

app.post('/api/experts/send', async (req, res) => {
  const { bot: botKey, text, parseMode } = req.body
  try {
    const msg = await experts.sendAsBot(botKey || 'chou', text, parseMode || null)
    res.json({ ok: !!msg })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/tasks', (_req, res) => {
  res.json(tasks.getStatus())
})

app.post('/api/tasks/run', async (req, res) => {
  const { taskId } = req.body
  try {
    const result = await tasks.runAndReport(taskId)
    res.json({ ok: true, result })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/tasks/fullscan', async (_req, res) => {
  res.json({ ok: true, message: 'Full scan started' })
  tasks.runFullScanAndReport().catch(e => console.error('[Tasks] fullscan error:', e.message))
})

app.post('/api/tasks/auto', (req, res) => {
  const { enabled, intervalMinutes } = req.body
  if (enabled) {
    tasks.startAutoScan(intervalMinutes || 60)
    res.json({ ok: true, message: `Auto scan enabled, interval: ${intervalMinutes || 60} min` })
  } else {
    tasks.stopAutoScan()
    res.json({ ok: true, message: 'Auto scan disabled' })
  }
})

app.get('/api/dashboard', (_req, res) => {
  res.json(dashboard.getDashStatus())
})

app.get('/api/logs', (_req, res) => {
  const dates = loggerModule.getLogDates()
  const today = loggerModule.getTodayLogs()
  res.json({ dates, todayCount: today.length, recentMessages: today.slice(-30) })
})

app.get('/api/logs/:date', (req, res) => {
  const logs = loggerModule.getLogsByDate(req.params.date)
  res.json({ date: req.params.date, count: logs.length, messages: logs })
})

app.post('/api/logs/summary', (_req, res) => {
  try {
    const summary = loggerModule.generateDailySummary()
    res.json({ ok: true, summary })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/logs/exchange/data', (_req, res) => {
  try {
    const data = loggerModule.getExchangeData()
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/dashboard/update', async (_req, res) => {
  try {
    await dashboard.updateDashboard()
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/dashboard/toggle', (req, res) => {
  const { enabled } = req.body
  if (enabled) { dashboard.startDashboard() } else { dashboard.stopDashboard() }
  res.json({ ok: true, running: enabled })
})

app.get('/api/teammates', (_req, res) => {
  checkTeammateTimeout()
  res.json(teammates)
})

app.post('/api/heartbeat', (req, res) => {
  const { os, firewall, defender, stealth, openPorts, connections, suspicious, hostname } = req.body
  const key = (os || '').toLowerCase() === 'win' ? 'win' : 'mac'
  teammates[key].online = true
  teammates[key].lastSeen = Date.now()
  teammates[key].data = { firewall, defender, stealth, openPorts, connections, suspicious, hostname, ts: new Date().toISOString() }
  res.json({ ok: true })
})

app.get('/api/settings', (_req, res) => {
  const env = readEnv()
  res.json({
    TELEGRAM_BOT_TOKEN: maskKey(env.TELEGRAM_BOT_TOKEN),
    TELEGRAM_CHAT_ID: env.TELEGRAM_CHAT_ID || '',
    XAI_API_KEY: maskKey(env.XAI_API_KEY),
    TEAMMATE_IP: env.TEAMMATE_IP || '',
    botRunning: bot.isRunning(),
  })
})

app.post('/api/settings', (req, res) => {
  const allowed = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'XAI_API_KEY', 'TEAMMATE_IP']
  const updates = {}
  for (const key of allowed) {
    if (req.body[key] !== undefined && req.body[key] !== '') {
      updates[key] = req.body[key]
    }
  }
  writeEnv(updates)
  if (updates.TELEGRAM_BOT_TOKEN) {
    bot.startBot(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID)
  }
  res.json({ ok: true })
})

app.get('/api/bot/messages', (_req, res) => {
  res.json({ messages: bot.getMessages(), teammate: bot.getTeammateStatus() })
})

app.post('/api/bot/send', (req, res) => {
  const { text } = req.body
  if (!text) return res.status(400).json({ error: 'text required' })
  const chatId = process.env.TELEGRAM_CHAT_ID
  bot.sendMessage(chatId, text)
    .then(() => res.json({ ok: true }))
    .catch(e => res.status(500).json({ error: e.message }))
})

app.post('/api/bot/protect-teammate', (_req, res) => {
  const chatId = process.env.TELEGRAM_CHAT_ID
  bot.sendProtectCommand(chatId)
    .then(() => res.json({ ok: true }))
    .catch(e => res.status(500).json({ error: e.message }))
})

app.post('/api/bot/status-teammate', (_req, res) => {
  const chatId = process.env.TELEGRAM_CHAT_ID
  bot.sendStatusRequest(chatId)
    .then(() => res.json({ ok: true }))
    .catch(e => res.status(500).json({ error: e.message }))
})

app.post('/api/ai/analyze', async (req, res) => {
  const { auditData, teammateData } = req.body
  try {
    const analysis = await analyzeSecurityData(auditData, teammateData)
    res.json({ analysis })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/do/account', async (_req, res) => {
  try { res.json(await doApi.getAccount()) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/do/droplets', async (_req, res) => {
  try { res.json({ droplets: await doApi.listDroplets() }) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/do/droplets/:id', async (req, res) => {
  try { res.json(await doApi.getDroplet(req.params.id)) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/do/droplets', async (req, res) => {
  try {
    const droplet = await doApi.createShieldDroplet(req.body)
    res.json({ droplet })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/do/droplets/:id', async (req, res) => {
  try { res.json(await doApi.destroyDroplet(req.params.id)) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/do/regions', async (_req, res) => {
  try { res.json({ regions: await doApi.listRegions() }) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/do/sizes', async (_req, res) => {
  try { res.json({ sizes: await doApi.listSizes() }) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/do/ssh-keys', async (_req, res) => {
  try { res.json({ keys: await doApi.listSSHKeys() }) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }

    if (msg.type === 'run' && msg.tool) {
      const tool = TOOL_COMMANDS[msg.tool]
      if (!tool) {
        ws.send(JSON.stringify({ type: 'error', text: 'Unknown tool' }))
        return
      }

      ws.send(JSON.stringify({ type: 'start', tool: msg.tool, label: tool.label }))

      const proc = spawn(tool.cmd, tool.args, { shell: false })

      proc.stdout.on('data', (data) => {
        ws.send(JSON.stringify({ type: 'stdout', text: data.toString() }))
      })

      proc.stderr.on('data', (data) => {
        ws.send(JSON.stringify({ type: 'stderr', text: data.toString() }))
      })

      proc.on('close', (code) => {
        ws.send(JSON.stringify({ type: 'done', code }))
      })

      proc.on('error', (err) => {
        ws.send(JSON.stringify({ type: 'error', text: err.message }))
      })
    }

    if (msg.type === 'run_custom' && msg.cmd) {
      const allowed = ['nmap', 'ss', 'ip', 'lsof', 'ping', 'ufw', 'iptables', 'netstat', 'free', 'df', 'top', 'uptime', 'last', 'fail2ban-client', 'systemctl', 'journalctl', 'arp', 'cat', 'grep', 'wc', 'head', 'tail']
      const parts = msg.cmd.trim().split(/\s+/)
      const bin = parts[0].replace(/.*\//, '')
      if (!allowed.includes(bin)) {
        ws.send(JSON.stringify({ type: 'error', text: `Command not allowed: ${bin}` }))
        return
      }

      ws.send(JSON.stringify({ type: 'start', tool: 'custom', label: msg.cmd }))

      const proc = spawn(parts[0], parts.slice(1), { shell: false })

      proc.stdout.on('data', (d) => ws.send(JSON.stringify({ type: 'stdout', text: d.toString() })))
      proc.stderr.on('data', (d) => ws.send(JSON.stringify({ type: 'stderr', text: d.toString() })))
      proc.on('close', (code) => ws.send(JSON.stringify({ type: 'done', code })))
      proc.on('error', (e) => ws.send(JSON.stringify({ type: 'error', text: e.message })))
    }
  })
})

function runCmd(cmd, args, timeoutMs = 8000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: stdout || '', stderr: stderr || '', err: err?.message || null })
    })
  })
}

app.get('/api/audit', async (_req, res) => {
  const [
    hostnameR, osReleaseR, ipAddrR, ipRouteR, dnsR,
    ufwR, iptablesIcmpR, ssListenR, ssEstabR, arpR,
    fail2banR, uptimeR, freeR,
  ] = await Promise.all([
    runCmd('hostname', []),
    runCmd('cat', ['/etc/os-release']),
    runCmd('ip', ['-4', 'addr', 'show']),
    runCmd('ip', ['route', 'show']),
    runCmd('cat', ['/etc/resolv.conf']),
    runCmd('ufw', ['status', 'verbose']),
    runCmd('iptables', ['-C', 'INPUT', '-p', 'icmp', '--icmp-type', 'echo-request', '-j', 'DROP']),
    runCmd('ss', ['-tlnp']),
    runCmd('ss', ['-tnp']),
    runCmd('ip', ['neigh', 'show']),
    runCmd('fail2ban-client', ['status']),
    runCmd('uptime', ['-p']),
    runCmd('free', ['-h']),
  ])

  // Parse OS
  const osKV = {}
  for (const line of osReleaseR.stdout.split('\n')) {
    const m = line.match(/^(\w+)=["']?([^"'\n]+)/)
    if (m) osKV[m[1]] = m[2]
  }

  // Parse network interfaces
  const interfaces = []
  const ifBlocks = ipAddrR.stdout.split(/^\d+: /m).filter(Boolean)
  let primaryIp = 'unknown', primaryMac = 'unknown', primaryIface = 'eth0'
  for (const block of ifBlocks) {
    const name = (block.match(/^(\S+):/) || [])[1] || ''
    if (name === 'lo') continue
    const ip = (block.match(/inet (\d+\.\d+\.\d+\.\d+)\/(\d+)/) || [])
    const mac = (block.match(/link\/ether ([0-9a-f:]{17})/) || [])[1] || ''
    if (ip[1] && primaryIp === 'unknown') { primaryIp = ip[1]; primaryMac = mac; primaryIface = name }
    if (ip[1]) interfaces.push({ name, ip: ip[1], prefix: ip[2], mac })
  }

  // Gateway
  const gateway = (ipRouteR.stdout.match(/default via (\S+)/) || [])[1] || 'unknown'

  // DNS
  const dnsServers = [...new Set(
    [...dnsR.stdout.matchAll(/^nameserver\s+(\S+)/gm)].map(m => m[1])
  )]

  // Firewall (UFW)
  const ufwOut = ufwR.stdout.toLowerCase()
  const firewallEnabled = ufwOut.includes('status: active')
  const ufwDefault = (ufwR.stdout.match(/Default:\s*(.+)/i) || [])[1]?.trim() || ''

  // Stealth (ICMP DROP)
  const stealthEnabled = iptablesIcmpR.ok

  // Listen ports
  const listenPorts = []
  for (const line of ssListenR.stdout.split('\n').slice(1)) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 5) continue
    const addr = parts[3] || ''
    const portMatch = addr.match(/:(\d+)$/)
    if (!portMatch) continue
    const port = portMatch[1]
    const procInfo = parts.slice(5).join(' ')
    const procName = (procInfo.match(/\("([^"]+)"/) || [])[1] || procInfo || 'unknown'
    const isPublic = addr.startsWith('0.0.0.0:') || addr.startsWith('*:') || addr.startsWith('[::]:')
    if (!listenPorts.find(p => p.port === port))
      listenPorts.push({ port, process: procName, addr, public: isPublic })
  }

  // Established connections
  const established = []
  for (const line of ssEstabR.stdout.split('\n').slice(1)) {
    if (!line.includes('ESTAB')) continue
    const parts = line.trim().split(/\s+/)
    if (parts.length < 5) continue
    established.push({ local: parts[3], remote: parts[4], process: (parts.slice(5).join(' ').match(/\("([^"]+)"/) || [])[1] || '' })
  }

  // ARP neighbors
  const devices = []
  for (const line of arpR.stdout.split('\n')) {
    const parts = line.trim().split(/\s+/)
    if (parts.length >= 4 && parts[0].match(/\d+\.\d+\.\d+\.\d+/)) {
      devices.push({ ip: parts[0], mac: parts[4] || '', state: parts[parts.length - 1] || '', vendor: '' })
    }
  }

  // Fail2Ban
  const fail2banActive = fail2banR.ok
  const jailCount = (fail2banR.stdout.match(/Number of jail:\s*(\d+)/) || [])[1] || '0'

  // Findings
  const findings = []

  if (!firewallEnabled) findings.push({ level: 'CRITICAL', code: 'FW_DISABLED', title: 'UFW 防火牆未啟用', detail: '伺服器防火牆未啟用，所有端口直接暴露於公網。', fix: '執行「防火牆狀態」工具查看，或 SSH 執行 ufw enable' })
  else findings.push({ level: 'INFO', code: 'FW_ACTIVE', title: 'UFW 防火牆已啟用', detail: `預設策略: ${ufwDefault}`, fix: '無需操作' })

  if (!stealthEnabled) findings.push({ level: 'HIGH', code: 'STEALTH_OFF', title: '隱身模式未啟用', detail: '伺服器回應 ICMP ping，可被外部探測發現。', fix: '執行「開啟隱身模式」工具新增 iptables ICMP DROP 規則' })
  else findings.push({ level: 'INFO', code: 'STEALTH_ON', title: '隱身模式已啟用', detail: 'ICMP echo-request 已被 DROP', fix: '無需操作' })

  const publicPorts = listenPorts.filter(p => p.public)
  if (publicPorts.length > 3) findings.push({ level: 'HIGH', code: 'MANY_PUBLIC_PORTS', title: `${publicPorts.length} 個端口對外開放`, detail: `公網監聽端口: ${publicPorts.map(p => p.port + '/' + p.process).join(', ')}`, fix: '使用 ufw deny 封鎖不需要的端口' })
  else if (publicPorts.length > 0) findings.push({ level: 'MEDIUM', code: 'PUBLIC_PORTS', title: `${publicPorts.length} 個端口對外開放`, detail: `公網端口: ${publicPorts.map(p => p.port + '/' + p.process).join(', ')}`, fix: '確認每個端口都是必要的' })

  if (!fail2banActive) findings.push({ level: 'HIGH', code: 'NO_FAIL2BAN', title: 'Fail2Ban 未運行', detail: '沒有暴力破解防護，SSH 等服務可被無限嘗試。', fix: '安裝並啟用 fail2ban: apt install fail2ban && systemctl enable fail2ban' })
  else findings.push({ level: 'INFO', code: 'FAIL2BAN_OK', title: `Fail2Ban 運行中 (${jailCount} 個監獄)`, detail: '暴力破解防護已啟用', fix: '無需操作' })

  if (established.length > 30) findings.push({ level: 'MEDIUM', code: 'MANY_CONNECTIONS', title: `${established.length} 條活躍連線`, detail: '連線數量較多，建議審查是否有異常連線。', fix: '使用「活躍連線」工具逐條檢查' })

  if (dnsServers.length === 0) findings.push({ level: 'MEDIUM', code: 'NO_DNS', title: 'DNS 未配置', detail: '未偵測到 DNS 伺服器配置', fix: '檢查 /etc/resolv.conf' })

  findings.push({ level: 'INFO', code: 'ZERO_TRUST', title: '零信任基線：VPS 預設公網暴露', detail: '雲端 VPS 直接暴露於公網，所有入站流量必須經過防火牆過濾，敏感服務只綁定 127.0.0.1。', fix: '確保 UFW 啟用、SSH 只允許金鑰登入、非必要服務綁定 localhost' })

  const critCount = findings.filter(f => f.level === 'CRITICAL').length
  const highCount = findings.filter(f => f.level === 'HIGH').length
  const medCount = findings.filter(f => f.level === 'MEDIUM').length
  const score = Math.max(0, 100 - critCount * 30 - highCount * 15 - medCount * 5)
  const verdict = score < 40 ? 'CRITICAL' : score < 60 ? 'HIGH RISK' : score < 80 ? 'MODERATE' : 'ACCEPTABLE'

  res.json({
    generatedAt: new Date().toISOString(),
    hostname: hostnameR.stdout.trim(),
    os: osKV['PRETTY_NAME'] || `${osKV['NAME'] || 'Linux'} ${osKV['VERSION_ID'] || ''}`,
    network: { ip: primaryIp, iface: primaryIface, mac: primaryMac, gateway, dns: dnsServers, interfaces },
    wifi: null,
    security: { firewallEnabled, stealthEnabled, ufwDefault, fail2banActive, fail2banJails: parseInt(jailCount) },
    listenPorts,
    established: established.slice(0, 50),
    devices,
    uptime: uptimeR.stdout.trim(),
    memory: freeR.stdout.trim(),
    findings,
    score,
    verdict,
  })
})


// ════════════════════════════════════════
// OPS — 運維操作中心 API
// ════════════════════════════════════════
app.get('/api/ops/resources', async (_req, res) => {
  try {
    const data = await ops.getSystemResources()
    res.json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/ops/commands', (_req, res) => {
  res.json({ commands: ops.getCommandList() })
})

app.post('/api/ops/run', async (req, res) => {
  const { cmdId } = req.body
  try {
    const result = await ops.runCommand(cmdId)
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/ops/sync', async (_req, res) => {
  try {
    const result = await ops.fullSync()
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/ops/autoscale', async (_req, res) => {
  try {
    const check = await ops.checkAutoScale()
    res.json(check)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/ops/autoscale', async (req, res) => {
  const { region } = req.body
  try {
    const result = await ops.autoScale(region)
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ════════════════════════════════════════
// VAULT — 機密運算容器 API
// ════════════════════════════════════════
app.get('/api/vault/status', (_req, res) => {
  try {
    res.json(vault.getVaultStatus())
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/vault/stats', (req, res) => {
  try {
    const stats = vault.getChatStats(req.query.date)
    res.json(stats)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/vault/chats', (req, res) => {
  try {
    const msgs = vault.getUserChatHistory(req.query.user, req.query.date)
    res.json({ messages: msgs.slice(-100), total: msgs.length })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/vault/analyze', async (req, res) => {
  try {
    const result = await vault.analyzeChats(req.body.date, req.body.prompt)
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/vault/dates', (_req, res) => {
  try {
    res.json(vault.listAvailableDates())
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/vault/analysis/:date', (req, res) => {
  try {
    const data = vault.loadAnalysis(req.params.date)
    if (!data) return res.status(404).json({ error: 'No analysis found' })
    res.json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ════════════════════════════════════════
// WATCHER — VPS 變動監控 + 緩存 API
// ════════════════════════════════════════
app.get('/api/watcher/status', (_req, res) => {
  try { res.json(watcher.getWatchStatus()) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/watcher/scan', (_req, res) => {
  try {
    const result = watcher.detectChanges()
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/watcher/changes', (_req, res) => {
  try { res.json({ changes: watcher.getCachedChanges() }) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/watcher/sync-status', (_req, res) => {
  try { res.json(watcher.getSyncStatus()) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/watcher/sync-report', (req, res) => {
  const { platform, commit, branch, files } = req.body
  try {
    const status = watcher.updateSyncStatus(platform || 'unknown', { commit, branch, files })
    res.json({ ok: true, status })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/watcher/cache', (req, res) => {
  const { key, content } = req.body
  if (!key) return res.status(400).json({ error: 'key required' })
  try {
    watcher.cacheContent(key, content)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/watcher/cache/:key', (req, res) => {
  try {
    const content = watcher.getCachedContent(req.params.key)
    if (content === null) return res.status(404).json({ error: 'not found' })
    res.json({ key: req.params.key, content })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ════════════════════════════════════════
// BOT CHAT — 面板 Bot 交互 API (SD 靜默代理)
// ════════════════════════════════════════
app.get('/api/bot/chat', (_req, res) => {
  try { res.json({ messages: experts.getBotChatQueue() }) }
  catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/bot/chat', async (req, res) => {
  const { message, user } = req.body
  if (!message) return res.status(400).json({ error: 'message required' })
  try {
    const response = await experts.panelBotChat(message, user || 'panel')
    res.json({ ok: true, response })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/bot/forward', async (req, res) => {
  const { text, from } = req.body
  if (!text) return res.status(400).json({ error: 'text required' })
  try {
    await experts.forwardToGroup(text, from || 'win')
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ════════════════════════════════════════
// 群組監控 API — Win Bot 全量群組訊息
// ════════════════════════════════════════
app.get('/api/bot/feed', (req, res) => {
  const limit = parseInt(req.query.limit) || 80
  const feed = experts.getAllFeed(limit)
  const groups = experts.getGroupList()
  const monStatus = monitor.getMonitorStatus()
  const recentAlerts = monitor.getAlerts(5)
  res.json({ feed, groups, monitor: monStatus, alerts: recentAlerts })
})

app.post('/api/bot/mac-send', async (req, res) => {
  const { text } = req.body
  if (!text) return res.status(400).json({ error: 'text required' })
  try {
    await experts.sendAsMacBot(text)
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/bot/groups', (_req, res) => {
  res.json({ groups: experts.getGroupList() })
})

app.get('/api/bot/messages', (req, res) => {
  const { groupId, limit } = req.query
  if (!groupId) return res.status(400).json({ error: 'groupId required' })
  res.json({ messages: experts.getGroupMessages(groupId, parseInt(limit) || 50) })
})

app.post('/api/bot/send', async (req, res) => {
  const { groupId, text } = req.body
  if (!groupId || !text) return res.status(400).json({ error: 'groupId and text required' })
  try {
    const result = await experts.sendToGroup(groupId, text)
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/bot/chat-any', async (req, res) => {
  const { bot, message, user } = req.body
  if (!bot || !message) return res.status(400).json({ error: 'bot and message required' })
  try {
    const result = await experts.panelChatAnyBot(bot, message, user || 'panel')
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ════════════════════════════════════════
// 安全監控 API — Security Monitor
// ════════════════════════════════════════
app.get('/api/monitor/status', (_req, res) => {
  res.json(monitor.getMonitorStatus())
})

app.get('/api/monitor/alerts', (req, res) => {
  const { limit, level } = req.query
  if (level) return res.json({ alerts: monitor.getAlertsByLevel(level) })
  res.json({ alerts: monitor.getAlerts(parseInt(limit) || 50) })
})

app.post('/api/monitor/ddos-shield', async (_req, res) => {
  try {
    // Auto-enable DO firewall when DDoS detected
    const doToken = process.env.DO_API_TOKEN
    if (!doToken) return res.json({ ok: false, error: 'DO API Token 未配置' })
    const result = await doApi.enableFirewall?.() || { ok: false, error: 'DO 防火牆 API 未實現' }
    if (result.ok) {
      monitor.addAlert('INFO', 'system', 'DO 雲盾已啟用', '已透過 API 啟用 DigitalOcean 防火牆')
      if (experts.isRunning()) {
        await experts.sendAsBot('xiaoai', '🛡 [自動防禦] DO 雲盾已啟用 — DDoS 防護生效', null)
      }
    }
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ════════════════════════════════════════
// 全景 VPS 狀態 — /api/vps/panorama
// ════════════════════════════════════════
app.get('/api/vps/panorama', async (_req, res) => {
  try {
    const [hostnameR, uptimeR, freeR, dfR, loadR, procR, servicesR, dockerR, ufwR, f2bR, ssR, connR, bogR] = await Promise.all([
      runCmd('hostname', []),
      runCmd('uptime', ['-p']),
      runCmd('free', ['-b']),
      runCmd('df', ['-B1', '/']),
      runCmd('cat', ['/proc/loadavg']),
      runCmd('ps', ['aux', '--sort=-%mem']),
      runCmd('systemctl', ['list-units', '--type=service', '--state=running', '--no-pager', '--plain']),
      runCmd('docker', ['ps', '--format', '{{.Names}}|{{.Status}}|{{.Ports}}']),
      runCmd('ufw', ['status', 'verbose']),
      runCmd('fail2ban-client', ['status']),
      runCmd('ss', ['-tlnp']),
      runCmd('ss', ['-tnp', 'state', 'established']),
      runCmd('ls', ['-la', '/root/BOG/dist/']),
    ])

    // Memory parse
    const memLines = freeR.stdout.split('\n')
    const memParts = memLines[1]?.split(/\s+/) || []
    const mem = { total: parseInt(memParts[1]) || 0, used: parseInt(memParts[2]) || 0, free: parseInt(memParts[3]) || 0, available: parseInt(memParts[6]) || 0 }

    // Disk parse
    const dfParts = dfR.stdout.split('\n')[1]?.split(/\s+/) || []
    const disk = { total: parseInt(dfParts[1]) || 0, used: parseInt(dfParts[2]) || 0, avail: parseInt(dfParts[3]) || 0, pct: dfParts[4] || '0%' }

    // Load avg
    const loadParts = loadR.stdout.trim().split(/\s+/)
    const load = { '1m': parseFloat(loadParts[0]) || 0, '5m': parseFloat(loadParts[1]) || 0, '15m': parseFloat(loadParts[2]) || 0 }

    // Top processes
    const procs = procR.stdout.split('\n').slice(1, 16).map(line => {
      const p = line.trim().split(/\s+/)
      return p.length >= 11 ? { user: p[0], pid: p[1], cpu: parseFloat(p[2]) || 0, mem: parseFloat(p[3]) || 0, cmd: p.slice(10).join(' ').slice(0, 60) } : null
    }).filter(Boolean)

    // Services
    const svcs = servicesR.stdout.split('\n').filter(l => l.includes('.service')).map(l => {
      const parts = l.trim().split(/\s+/)
      return { name: parts[0]?.replace('.service', '') || '', status: parts[2] || '', sub: parts[3] || '' }
    }).filter(s => s.name)

    // Docker
    const containers = dockerR.stdout.trim().split('\n').filter(Boolean).map(l => {
      const [name, status, ports] = l.split('|')
      return { name, status, ports }
    }).filter(c => c.name)

    // Firewall
    const ufwActive = ufwR.stdout.toLowerCase().includes('status: active')
    const ufwRules = ufwR.stdout.split('\n').filter(l => /^\d+|ALLOW|DENY|REJECT/.test(l.trim())).length

    // Fail2ban
    const f2bActive = f2bR.ok
    const f2bJails = parseInt((f2bR.stdout.match(/Number of jail:\s*(\d+)/) || [])[1]) || 0

    // Listen ports
    const ports = ssR.stdout.split('\n').slice(1).map(l => {
      const p = l.trim().split(/\s+/)
      if (p.length < 5) return null
      const addr = p[3] || ''
      const portMatch = addr.match(/:(\d+)$/)
      if (!portMatch) return null
      const proc = (p.slice(5).join(' ').match(/\("([^"]+)"/) || [])[1] || 'unknown'
      return { port: portMatch[1], addr, proc, public: addr.startsWith('0.0.0.0:') || addr.startsWith('*:') || addr.startsWith('[::]:') }
    }).filter(Boolean)

    // Established connections count
    const connCount = connR.stdout.split('\n').filter(l => l.includes('ESTAB') || l.match(/\d+\.\d+\.\d+\.\d+/)).length

    // BOG project
    const bogDeployed = bogR.ok && bogR.stdout.includes('index.html')

    // Monitor data
    const monStatus = monitor.getMonitorStatus()
    const recentAlerts = monitor.getAlerts(5)

    // Bot status
    const botInfo = experts.getBotInfo ? experts.getBotInfo() : []
    const groupList = experts.getGroupList()

    res.json({
      ts: new Date().toISOString(),
      hostname: hostnameR.stdout.trim(),
      uptime: uptimeR.stdout.trim(),
      system: { mem, disk, load, cpuCores: require('os').cpus().length },
      processes: procs,
      services: svcs,
      containers,
      security: { ufwActive, ufwRules, f2bActive, f2bJails },
      network: { ports, connCount },
      projects: { bog: { deployed: bogDeployed, path: '/root/BOG', nginx: true }, team: { deployed: true, path: '/root/TEAM', port: 3001 } },
      monitor: monStatus,
      alerts: recentAlerts,
      bots: botInfo,
      groups: groupList,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('*', (_req, res) => {
  const index = path.join(__dirname, '..', 'dist', 'index.html')
  if (require('fs').existsSync(index)) res.sendFile(index)
  else res.status(404).json({ error: 'Frontend not built. Run: npx vite build' })
})

const PORT = process.env.PORT || 3001
const HOST = process.env.HOST || '0.0.0.0'
server.listen(PORT, HOST, () => {
  console.log(`Blue Team backend running at http://${HOST}:${PORT}`)
})

// 啟動 VPS 變動監控 (每 60 秒掃描)
setTimeout(() => {
  try {
    watcher.startWatching(60000, (changes) => {
      const total = changes.added.length + changes.modified.length + changes.deleted.length
      console.log(`[Watcher] Detected ${total} changes`)
      // 自動通知到 TG 群
      if (total > 0 && experts.isRunning()) {
        const msg = [
          '🔍 [VPS 變動偵測]',
          changes.added.length ? `➕ 新增: ${changes.added.map(f => f.file.split('/').pop()).join(', ')}` : '',
          changes.modified.length ? `✏️ 修改: ${changes.modified.map(f => f.file.split('/').pop()).join(', ')}` : '',
          changes.deleted.length ? `🗑 刪除: ${changes.deleted.map(f => f.file.split('/').pop()).join(', ')}` : '',
          `⏱ ${new Date().toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei' })}`,
        ].filter(Boolean).join('\n')
        experts.sendAsBot('xiaoai', msg, null).catch(() => {})
      }
    })
  } catch (e) {
    console.error('[Watcher] start error:', e.message)
  }
}, 10000)
