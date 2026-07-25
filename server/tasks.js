const { execFile, exec } = require('child_process')
const { sendAsBot, formatMD } = require('./experts')

const TASKS = {
  lynis_audit: {
    name: 'Lynis 系統稽查',
    icon: '🔍',
    cmd: 'lynis',
    args: ['audit', 'system', '--no-colors', '--quick'],
    parse: parseLynis,
    interval: 3600000,
  },
  clamav_scan: {
    name: 'ClamAV 病毒掃描',
    icon: '🦠',
    cmd: 'clamscan',
    args: ['-r', '--max-filesize=5M', '--max-scansize=50M', '--infected', '--suppress-ok-results', '--exclude-dir=node_modules', '--exclude-dir=.npm', '--exclude-dir=.cache', '/tmp', '/var/tmp', '/etc', '/usr/local/bin'],
    parse: parseClamAV,
    interval: 7200000,
    timeout: 180000,
  },
  chkrootkit: {
    name: 'Rootkit 檢測',
    icon: '🕵',
    cmd: 'chkrootkit',
    args: ['-q'],
    parse: parseChkrootkit,
    interval: 3600000,
  },
  nmap_self: {
    name: 'Nmap 自掃描',
    icon: '📡',
    cmd: 'nmap',
    args: ['-Pn', '--top-ports', '100', '-sV', '127.0.0.1'],
    parse: parseNmap,
    interval: 1800000,
  },
  net_connections: {
    name: '異常連線檢測',
    icon: '🌐',
    cmd: 'ss',
    args: ['-tunap'],
    parse: parseConnections,
    interval: 900000,
  },
  ufw_status: {
    name: 'UFW 防火牆狀態',
    icon: '🛡',
    cmd: 'ufw',
    args: ['status', 'verbose'],
    parse: parseUFW,
    interval: 600000,
  },
  fail2ban_status: {
    name: 'Fail2ban 封禁狀態',
    icon: '🚫',
    cmd: 'fail2ban-client',
    args: ['status'],
    parse: parseFail2ban,
    interval: 600000,
  },
  tcpdump_capture: {
    name: '流量取證快照',
    icon: '📦',
    cmd: 'timeout',
    args: ['10', 'tcpdump', '-i', 'any', '-c', '200', '-nn', '-q'],
    parse: parseTcpdump,
    interval: 1800000,
  },
  suricata_check: {
    name: 'Suricata IDS 狀態',
    icon: '🔔',
    cmd: 'bash',
    args: ['-c', 'suricata --build-info 2>/dev/null | head -5; echo "---"; ls -la /var/log/suricata/ 2>/dev/null || echo "no logs"'],
    parse: parseSuricata,
    interval: 3600000,
  },
  audit_log: {
    name: '系統審計日誌',
    icon: '📜',
    cmd: 'bash',
    args: ['-c', 'ausearch -ts recent --raw 2>/dev/null | tail -50 || journalctl --since "1 hour ago" --no-pager -q 2>/dev/null | tail -30 || echo "no audit data"'],
    parse: parseAuditLog,
    interval: 1800000,
  },
  rkhunter_scan: {
    name: 'RKHunter 深度掃描',
    icon: '🔬',
    cmd: 'rkhunter',
    args: ['--check', '--skip-keypress', '--no-colors', '--report-warnings-only'],
    parse: parseRkhunter,
    interval: 7200000,
    timeout: 300000,
  },
}

let taskResults = {}
let taskTimers = {}
let running = {}
let autoMode = false

function parseLynis(stdout) {
  const lines = stdout.split('\n')
  const warnings = lines.filter(l => /warning/i.test(l)).length
  const suggestions = lines.filter(l => /suggestion/i.test(l)).length
  const scoreMatch = stdout.match(/Hardening index\s*:\s*(\d+)/i) || stdout.match(/(\d+)(?=\s*$)/m)
  const score = scoreMatch ? parseInt(scoreMatch[1]) : null
  const level = warnings > 5 ? 'HIGH' : warnings > 0 ? 'MEDIUM' : 'LOW'
  return {
    summary: `評分: ${score || '?'}/100 · 警告: ${warnings} · 建議: ${suggestions}`,
    level,
    details: { score, warnings, suggestions },
  }
}

function parseClamAV(stdout) {
  const infected = (stdout.match(/Infected files:\s*(\d+)/i) || [])[1] || '0'
  const scanned = (stdout.match(/Scanned files:\s*(\d+)/i) || [])[1] || '0'
  const level = parseInt(infected) > 0 ? 'CRITICAL' : 'LOW'
  return {
    summary: `掃描 ${scanned} 檔案 · 感染: ${infected}`,
    level,
    details: { infected: parseInt(infected), scanned: parseInt(scanned) },
  }
}

function parseChkrootkit(stdout) {
  const suspects = stdout.split('\n').filter(l => l.trim() && !/not found|not infected|nothing found|not tested/i.test(l))
  const level = suspects.length > 0 ? 'HIGH' : 'LOW'
  return {
    summary: suspects.length > 0 ? `發現 ${suspects.length} 個可疑項目` : '未發現 rootkit ✅',
    level,
    details: { suspects: suspects.slice(0, 10) },
  }
}

function parseNmap(stdout) {
  const openPorts = stdout.split('\n').filter(l => /^\d+\/tcp\s+open/i.test(l.trim()))
  const level = openPorts.length > 10 ? 'HIGH' : openPorts.length > 3 ? 'MEDIUM' : 'LOW'
  return {
    summary: `開放端口: ${openPorts.length}`,
    level,
    details: { ports: openPorts.map(l => l.trim()).slice(0, 20) },
  }
}

function parseConnections(stdout) {
  const lines = stdout.split('\n').filter(l => /ESTAB/i.test(l))
  const foreign = lines.filter(l => {
    const parts = l.split(/\s+/)
    const peer = parts[5] || ''
    return peer && !peer.startsWith('127.') && !peer.startsWith('::1') && !peer.startsWith('0.0.0.0')
  })
  const level = foreign.length > 20 ? 'HIGH' : foreign.length > 5 ? 'MEDIUM' : 'LOW'
  return {
    summary: `已建立連線: ${lines.length} · 外部: ${foreign.length}`,
    level,
    details: { total: lines.length, foreign: foreign.length, top: foreign.slice(0, 10).map(l => l.trim()) },
  }
}

function parseUFW(stdout) {
  const active = /Status:\s*active/i.test(stdout)
  const rules = stdout.split('\n').filter(l => /ALLOW|DENY|REJECT|LIMIT/i.test(l))
  const level = active ? 'LOW' : 'CRITICAL'
  return {
    summary: active ? `防火牆啟用 ✅ · ${rules.length} 條規則` : '防火牆未啟用 ❌',
    level,
    details: { active, ruleCount: rules.length, rules: rules.slice(0, 10).map(l => l.trim()) },
  }
}

function parseFail2ban(stdout) {
  const jails = (stdout.match(/Number of jail:\s*(\d+)/i) || [])[1] || '0'
  const jailList = (stdout.match(/Jail list:\s*(.*)/i) || [])[1] || ''
  return {
    summary: `監獄數: ${jails} · ${jailList || '無'}`,
    level: 'LOW',
    details: { jails: parseInt(jails), list: jailList },
  }
}

function parseTcpdump(stdout) {
  const lines = stdout.split('\n').filter(l => l.trim())
  const packets = lines.length
  const ips = new Set()
  lines.forEach(l => { const m = l.match(/\b(\d+\.\d+\.\d+\.\d+)\b/); if (m) ips.add(m[1]) })
  return {
    summary: `捕獲 ${packets} 封包 · ${ips.size} 個 IP`,
    level: ips.size > 30 ? 'MEDIUM' : 'LOW',
    details: { packets, uniqueIPs: ips.size, sample: lines.slice(0, 10) },
  }
}

function parseSuricata(stdout) {
  const hasLogs = !stdout.includes('no logs')
  return {
    summary: hasLogs ? 'Suricata IDS 運行中 ✅' : 'Suricata 未配置日誌',
    level: 'LOW',
    details: { raw: stdout.slice(0, 500) },
  }
}

function parseAuditLog(stdout) {
  const lines = stdout.split('\n').filter(l => l.trim())
  const suspicious = lines.filter(l => /EXECVE|SYSCALL|failed|denied|error/i.test(l))
  const level = suspicious.length > 20 ? 'HIGH' : suspicious.length > 5 ? 'MEDIUM' : 'LOW'
  return {
    summary: `日誌 ${lines.length} 條 · 可疑 ${suspicious.length} 條`,
    level,
    details: { total: lines.length, suspicious: suspicious.length, sample: suspicious.slice(0, 10) },
  }
}

function parseRkhunter(stdout) {
  const warnings = stdout.split('\n').filter(l => /warning/i.test(l))
  const level = warnings.length > 5 ? 'HIGH' : warnings.length > 0 ? 'MEDIUM' : 'LOW'
  return {
    summary: warnings.length > 0 ? `${warnings.length} 個警告` : '未發現威脅 ✅',
    level,
    details: { warnings: warnings.slice(0, 15).map(l => l.trim()) },
  }
}

function runTask(taskId) {
  const task = TASKS[taskId]
  if (!task || running[taskId]) return Promise.resolve(null)

  running[taskId] = true
  const startTime = Date.now()

  return new Promise((resolve) => {
    const proc = execFile(task.cmd, task.args, { timeout: task.timeout || 120000, maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
      running[taskId] = false
      const duration = ((Date.now() - startTime) / 1000).toFixed(1)
      let result

      if (err && !stdout) {
        result = { taskId, name: task.name, icon: task.icon, status: 'error', error: err.message, ts: new Date().toISOString(), duration }
      } else {
        const parsed = task.parse(stdout || '')
        result = {
          taskId, name: task.name, icon: task.icon,
          status: 'done', ...parsed,
          ts: new Date().toISOString(), duration,
          rawLength: (stdout || '').length,
        }
      }

      taskResults[taskId] = result
      resolve(result)
    })
  })
}

async function runAllTasks() {
  const ids = Object.keys(TASKS)
  const results = []
  for (const id of ids) {
    const r = await runTask(id)
    if (r) results.push(r)
  }
  return results
}

async function runAndReport(taskId) {
  const result = await runTask(taskId)
  if (!result) return null

  const levelEmoji = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🟢' }
  const emoji = levelEmoji[result.level] || '⚪'

  const msg = formatMD(`${result.icon} ${result.name}`, [
    { text: `${emoji} ${result.summary}` },
    { text: `⏱ ${result.duration}s · ${new Date(result.ts).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei' })}` },
  ])
  await sendAsBot('xiaoai', msg, 'Markdown')
  return result
}

async function runFullScanAndReport() {
  await sendAsBot('xiaoai', '🛡 *藍隊全量掃描啟動*\n\n正在執行 11 項安全檢測…請稍候', 'Markdown')

  const results = await runAllTasks()
  const levelEmoji = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🟢' }

  const sections = results.map(r => {
    const emoji = levelEmoji[r.level] || '⚪'
    return { text: `${r.icon} *${r.name}*\n  ${emoji} ${r.summary || r.error || 'N/A'} · ⏱${r.duration}s` }
  })

  const criticals = results.filter(r => r.level === 'CRITICAL' || r.level === 'HIGH')
  if (criticals.length > 0) {
    sections.push({ heading: '⚠️ 需要關注', items: criticals.map(c => `${c.icon} ${c.name}: ${c.summary}`) })
  }

  const report = formatMD('藍隊全量掃描報告', sections)
  const chunks = report.match(/[\s\S]{1,3800}/g) || [report]
  for (const chunk of chunks) {
    await sendAsBot('xiaoai', chunk, 'Markdown')
  }

  return results
}

function startAutoScan(intervalMinutes) {
  stopAutoScan()
  autoMode = true
  const ms = (intervalMinutes || 60) * 60000

  runFullScanAndReport().catch(e => console.error('[Tasks] initial scan error:', e.message))

  taskTimers._auto = setInterval(() => {
    runFullScanAndReport().catch(e => console.error('[Tasks] auto scan error:', e.message))
  }, ms)

  console.log(`[Tasks] Auto scan started, interval: ${intervalMinutes || 60} min`)
}

function stopAutoScan() {
  autoMode = false
  if (taskTimers._auto) { clearInterval(taskTimers._auto); delete taskTimers._auto }
}

function getStatus() {
  return {
    autoMode,
    running: { ...running },
    results: { ...taskResults },
    tasks: Object.entries(TASKS).map(([id, t]) => ({
      id, name: t.name, icon: t.icon,
      lastResult: taskResults[id] || null,
      isRunning: !!running[id],
    })),
  }
}

module.exports = { runTask, runAllTasks, runAndReport, runFullScanAndReport, startAutoScan, stopAutoScan, getStatus, TASKS }
