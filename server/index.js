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

const path = require('path')
const app = express()
app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, '..', 'dist')))

const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

const TOOL_COMMANDS = {
  arp_scan: {
    label: 'ARP Scan',
    cmd: 'sudo',
    args: ['-n', 'arp-scan', '--localnet', '--interface=en0'],
    requiresSudo: true,
  },
  firewall_status: {
    label: 'Firewall Status',
    cmd: '/usr/libexec/ApplicationFirewall/socketfilterfw',
    args: ['--getglobalstate'],
  },
  open_ports: {
    label: 'Open Ports (LAN exposed)',
    cmd: 'lsof',
    args: ['-iTCP', '-sTCP:LISTEN', '-nP'],
  },
  self_scan: {
    label: 'Self Port Scan',
    cmd: 'nmap',
    args: ['-Pn', '--top-ports', '30', '127.0.0.1'],
  },
  stealth_mode: {
    label: 'Toggle Stealth Mode ON',
    cmd: 'sudo',
    args: [
      '-n',
      '/usr/libexec/ApplicationFirewall/socketfilterfw',
      '--setstealthmode',
      'on',
    ],
  },
  fw_enable: {
    label: 'Enable Firewall',
    cmd: 'sudo',
    args: [
      '-n',
      '/usr/libexec/ApplicationFirewall/socketfilterfw',
      '--setglobalstate',
      'on',
    ],
  },
  net_info: {
    label: 'Network Info',
    cmd: 'ifconfig',
    args: ['en0'],
  },
  route_table: {
    label: 'Routing Table',
    cmd: 'netstat',
    args: ['-rn'],
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
      const allowed = ['nmap', 'arp-scan', 'netstat', 'ifconfig', 'lsof', 'ping', 'arp']
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
  const FW = '/usr/libexec/ApplicationFirewall/socketfilterfw'

  const [
    hostnameR, swversR, ifconfigR, netInfoR, spWifiR, dnsR, netstatRoutesR,
    fwR, stealthR, lsofR, netstatR, arpR, arpScanR,
  ] = await Promise.all([
    runCmd('hostname', []),
    runCmd('sw_vers', []),
    runCmd('ifconfig', ['en0']),
    runCmd('networksetup', ['-getinfo', 'Wi-Fi']),
    runCmd('system_profiler', ['SPAirPortDataType'], 10000),
    runCmd('scutil', ['--dns']),
    runCmd('netstat', ['-rn']),
    runCmd(FW, ['--getglobalstate']),
    runCmd(FW, ['--getstealthmode']),
    runCmd('lsof', ['-iTCP', '-sTCP:LISTEN', '-nP']),
    runCmd('netstat', ['-anp', 'tcp']),
    runCmd('arp', ['-a']),
    runCmd('sudo', ['-n', 'arp-scan', '--localnet', '--interface=en0'], 12000),
  ])

  const parseKV = (text) => {
    const out = {}
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([^:]+):\s*(.+)$/)
      if (m) out[m[1].trim()] = m[2].trim()
    }
    return out
  }

  const netInfo = parseKV(netInfoR.stdout)

  const ip4 = netInfo['IP address'] || (ifconfigR.stdout.match(/inet (\d+\.\d+\.\d+\.\d+)/) || [])[1] || 'unknown'
  const mask = netInfo['Subnet mask'] || (ifconfigR.stdout.match(/netmask (\S+)/) || [])[1] || ''
  const macAddr = (ifconfigR.stdout.match(/ether ([0-9a-f:]{17})/) || [])[1] || 'unknown'

  const gatewayFromNetInfo = netInfo['Router'] || ''
  const gatewayFromRoute = (netstatRoutesR.stdout.split('\n').find(l => /^default\s+\d/.test(l.trim()) && l.includes('en0')) || '').trim().split(/\s+/)[1] || ''
  const gateway = gatewayFromNetInfo || gatewayFromRoute || 'unknown'

  const dnsServers = [...new Set(
    [...dnsR.stdout.matchAll(/nameserver\[.*?\] : (\S+)/g)].map(m => m[1])
  )]

  const spWifi = spWifiR.stdout
  const security = (spWifi.match(/Security:\s*(.+)/) || [])[1]?.trim() || 'unknown'
  const channel = (spWifi.match(/Channel:\s*(.+)/) || [])[1]?.trim() || 'N/A'
  const signal = (spWifi.match(/Signal \/ Noise:\s*(-\d+)/) || [])[1] || 'N/A'
  const phyMode = (spWifi.match(/PHY Mode:\s*(\S+)/) || [])[1] || 'N/A'
  const countryCode = (spWifi.match(/Country Code:\s*(\S+)/) || [])[1] || ''
  const ssid = '<redacted by macOS>'
  const bssid = '<redacted by macOS>'
  const authMode = security

  const listenPorts = []
  for (const line of lsofR.stdout.split('\n').slice(1)) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 9) continue
    const addr = parts[8] || ''
    const port = (addr.match(/:(\d+)$/) || [])[1]
    const proc = parts[0]
    if (port && !listenPorts.find(p => p.port === port))
      listenPorts.push({ port, process: proc, addr })
  }

  const established = netstatR.stdout.split('\n')
    .filter(l => l.includes('ESTABLISHED'))
    .map(l => l.trim().split(/\s+/))
    .filter(p => p.length >= 5)
    .map(p => ({ local: p[3], remote: p[4] }))
    .slice(0, 25)

  const arpDevices = []
  const arpRe = /\((\d+\.\d+\.\d+\.\d+)\) at ([0-9a-f:]+|\(incomplete\))/gi
  let m
  while ((m = arpRe.exec(arpR.stdout)) !== null)
    arpDevices.push({ ip: m[1], mac: m[2] })

  const arpScanDevices = []
  if (arpScanR.ok) {
    const re = /^(\d+\.\d+\.\d+\.\d+)\s+([0-9a-f:]{17})\s+(.*)/gim
    let sm
    while ((sm = re.exec(arpScanR.stdout)) !== null)
      arpScanDevices.push({ ip: sm[1], mac: sm[2], vendor: sm[3].trim() })
  }

  const devices = arpScanDevices.length > 0 ? arpScanDevices
    : arpDevices.map(d => ({ ...d, vendor: '' }))

  const osInfo = parseKV(swversR.stdout)

  const firewallEnabled = fwR.stdout.toLowerCase().includes('enabled')
  const stealthEnabled = stealthR.stdout.toLowerCase().includes('enabled')

  const findings = []

  if (!firewallEnabled) findings.push({ level: 'CRITICAL', code: 'FW_DISABLED', title: '防火牆未啟用', detail: '主機防火牆處於關閉狀態，局域網其他設備可直接嘗試連入本機所有端口。', fix: '執行 Enable Firewall 工具或系統偏好設定 → 安全性 → 防火牆' })
  if (!stealthEnabled) findings.push({ level: 'HIGH', code: 'STEALTH_OFF', title: '隱身模式未啟用', detail: 'ICMP ping 和 closed port 探測有回應，使本機在 LAN 上可被主動偵測到。', fix: '執行 Toggle Stealth Mode ON 工具' })
  if (listenPorts.length > 0) findings.push({ level: 'HIGH', code: 'OPEN_PORTS', title: `本機有 ${listenPorts.length} 個 TCP 監聽端口`, detail: `監聽端口暴露於局域網：${listenPorts.map(p => p.port + '/' + p.process).join(', ')}`, fix: '停用不需要的服務，或以防火牆規則封鎖對外暴露' })
  if (devices.length > 5) findings.push({ level: 'HIGH', code: 'MANY_PEERS', title: `LAN 存在 ${devices.length} 台設備`, detail: '公共 WiFi 環境中大量陌生設備共享同一廣播域，MITM / ARP 欺騙風險顯著上升。', fix: '啟用防火牆隱身模式，考慮使用 VPN 隧道所有流量' })
  if (['open', 'none', ''].includes(authMode.toLowerCase())) findings.push({ level: 'CRITICAL', code: 'OPEN_WIFI', title: 'WiFi 無加密 (Open Network)', detail: '該 AP 未使用任何加密，所有封包以明文傳輸，任何人可嗅探。', fix: '立即斷線，只使用 WPA2/WPA3 網路，並強制全程走 VPN' })
  else if (authMode.toLowerCase().includes('wpa2')) findings.push({ level: 'MEDIUM', code: 'WPA2_PUBLIC', title: 'WPA2 公共網路 — 預設不可信', detail: 'WPA2-PSK 中共享密鑰對所有用戶相同，任何知道密碼的人皆可解密同網段流量。', fix: '使用 VPN（WireGuard/Tailscale）封裝所有出站流量' })
  if (dnsServers.some(d => !d.startsWith('192.168') && !d.startsWith('10.') && !d.startsWith('172.'))) findings.push({ level: 'MEDIUM', code: 'DNS_EXTERNAL', title: 'DNS 解析走公共或未知服務器', detail: `檢測到 DNS: ${dnsServers.join(', ')}。公共 WiFi 下 DNS 可能被劫持或污染。`, fix: '使用 DoH/DoT（1.1.1.1#cloudflare-dns.com）或 VPN 自帶 DNS' })
  if (established.length > 15) findings.push({ level: 'MEDIUM', code: 'MANY_CONNECTIONS', title: `${established.length} 條出站 TCP 連線`, detail: '活躍連線數量較多，建議確認每條連線的目標 IP 是否合法。', fix: '使用 lsof -i 按進程審查每條連線' })

  findings.push({ level: 'INFO', code: 'ZERO_TRUST_BASELINE', title: '零信任基線：公共 WiFi 預設不可信', detail: '不論加密強度如何，共享網路環境下任何 LAN 對等方均應視為潛在威脅。所有敏感流量必須端對端加密。', fix: '部署 VPN（Tailscale 推薦）確保即使 LAN 被監聽，流量仍安全' })

  const critCount = findings.filter(f => f.level === 'CRITICAL').length
  const highCount = findings.filter(f => f.level === 'HIGH').length
  const score = Math.max(0, 100 - critCount * 30 - highCount * 15 - findings.filter(f => f.level === 'MEDIUM').length * 5)
  const verdict = score < 40 ? 'CRITICAL' : score < 60 ? 'HIGH RISK' : score < 80 ? 'MODERATE' : 'ACCEPTABLE'

  res.json({
    generatedAt: new Date().toISOString(),
    hostname: hostnameR.stdout.trim(),
    os: `${osInfo['ProductName'] || ''} ${osInfo['ProductVersion'] || ''}`.trim(),
    network: { ip: ip4, mask, mac: macAddr, gateway, dns: dnsServers },
    wifi: { ssid, bssid, signal, channel, authMode, phyMode },
    security: { firewallEnabled, stealthEnabled },
    listenPorts,
    established,
    devices,
    arpScanAvailable: arpScanR.ok,
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
