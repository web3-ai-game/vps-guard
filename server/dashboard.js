const os = require('os')
const { execFile } = require('child_process')
const { sendAsBot, getChatId, BOTS } = require('./experts')
const tasks = require('./tasks')
const { analyzeSecurityData } = require('./ai')

let pinnedMsgId = null
let dashTimer = null
let expertTimer = null
const DASH_INTERVAL = 120000
const EXPERT_INTERVAL = 600000

function getUptime() {
  const s = process.uptime()
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}h${m}m`
}

function levelBar(level) {
  const map = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🟢' }
  return map[level] || '⚪'
}

async function getSystemMetrics() {
  return new Promise((resolve) => {
    execFile('bash', ['-c', [
      'echo "CPU:$(top -bn1 2>/dev/null | grep "Cpu(s)" | awk \'{print $2}\')"',
      'echo "MEM:$(free -m | awk \'/Mem/{printf "%d/%dMB %.0f%%", $3, $2, $3/$2*100}\')"',
      'echo "DISK:$(df -h / | awk \'NR==2{printf "%s/%s %s", $3, $2, $5}\')"',
      'echo "LOAD:$(cat /proc/loadavg | awk \'{print $1, $2, $3}\')"',
      'echo "CONN:$(ss -s | grep estab | awk \'{print $4}\' | tr -d \',\')"',
      'echo "PROCS:$(ps aux | wc -l)"',
    ].join('; ')], { timeout: 5000 }, (err, stdout) => {
      const metrics = {}
      if (stdout) {
        stdout.split('\n').forEach(l => {
          const [k, ...v] = l.split(':')
          if (k && v.length) metrics[k.trim()] = v.join(':').trim()
        })
      }
      resolve(metrics)
    })
  })
}

function buildDashboard(metrics, taskStatus) {
  const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })
  const results = taskStatus.results || {}
  const taskList = taskStatus.tasks || []

  let dash = `\`\`\`
╔══════════════════════════════╗
║  🛡 BLUE TEAM — 防禦控制台   ║
╠══════════════════════════════╣
║ ⏰ ${now.padEnd(24)}║
║ 🖥 VPS 167.71.13.130:3001   ║
║ ⏱ Uptime: ${getUptime().padEnd(18)}║
╠══════════════════════════════╣
║ 📊 系統資源                   ║
║  CPU:  ${(metrics.CPU || '?').padEnd(22)}║
║  MEM:  ${(metrics.MEM || '?').padEnd(22)}║
║  DISK: ${(metrics.DISK || '?').padEnd(22)}║
║  LOAD: ${(metrics.LOAD || '?').padEnd(22)}║
║  連線: ${(metrics.CONN || '?').padEnd(22)}║
╠══════════════════════════════╣
║ 🔍 安全掃描狀態               ║\n`

  for (const t of taskList) {
    const r = t.lastResult
    if (r) {
      const icon = levelBar(r.level)
      const info = (r.summary || r.error || '?').slice(0, 22)
      dash += `║ ${icon} ${t.icon} ${info.padEnd(22)}║\n`
    } else {
      dash += `║ ⚪ ${t.icon} ${t.name.slice(0, 20).padEnd(22)}║\n`
    }
  }

  dash += `╠══════════════════════════════╣
║ 🤖 Bot 狀態                  ║
║  Mr\`Chou:  ${BOTS.chou?.bot ? '🟢 在線' : '🔴 離線'}               ║
║  Onion:    ${BOTS.onion?.bot ? '🟢 在線' : '🔴 離線'}               ║
║  小愛同學:  ${BOTS.xiaoai?.bot ? '🟢 在線' : '🔴 離線'}               ║
╠══════════════════════════════╣
║  🛡 UFW: ${taskStatus.results?.ufw_status?.level === 'LOW' ? '✅ 啟用' : '❌ 關閉'}  F2B: ${taskStatus.results?.fail2ban_status?.level === 'LOW' ? '✅' : '❌'}         ║
║  🌐 面板: 167.71.13.130:3001 ║
║  🔐 /fullscan /help          ║
╚══════════════════════════════╝\`\`\``

  return dash
}

async function updateDashboard() {
  const chatId = getChatId()
  if (!chatId || !BOTS.chou?.bot) return

  try {
    const [metrics, taskStatus] = await Promise.all([
      getSystemMetrics(),
      Promise.resolve(tasks.getStatus()),
    ])

    const text = buildDashboard(metrics, taskStatus)

    if (pinnedMsgId) {
      try {
        await BOTS.chou.bot.editMessageText(text, {
          chat_id: chatId,
          message_id: pinnedMsgId,
          parse_mode: 'Markdown',
        })
        return
      } catch (e) {
        if (!e.message?.includes('message is not modified')) {
          pinnedMsgId = null
        } else {
          return
        }
      }
    }

    const msg = await BOTS.chou.bot.sendMessage(chatId, text, { parse_mode: 'Markdown' })
    pinnedMsgId = msg.message_id
    try {
      await BOTS.chou.bot.pinChatMessage(chatId, msg.message_id, { disable_notification: true })
    } catch {}
  } catch (e) {
    console.error('[Dashboard] update error:', e.message)
  }
}

async function runExpertAnalysis() {
  const taskStatus = tasks.getStatus()
  const results = taskStatus.results || {}

  const criticals = Object.values(results).filter(r => r?.level === 'CRITICAL' || r?.level === 'HIGH')
  if (criticals.length === 0) return

  const issueList = criticals.map(r => `${r.icon} ${r.name}: ${r.summary}`).join('\n')

  const prompt = `你是國家級網路安全專家。以下是 VPS (167.71.13.130 Ubuntu) 的安全掃描結果中的高危項目：

${issueList}

請給出：
1. 每個問題的 **一行診斷**
2. 每個問題的 **一條可直接執行的修復命令**（bash 命令）
3. **整體風險評估**（一句話）

格式簡潔，可直接複製執行的命令用 \`code\` 包裹。不超過 300 字。`

  try {
    const analysis = await analyzeSecurityData(
      { score: 0, verdict: 'EXPERT_ANALYSIS', findings: criticals.map(c => ({ level: c.level, title: c.summary })) },
      null
    )
    await sendAsBot('onion', `🔬 *專家級安全分析*\n\n${analysis}`, 'Markdown')
  } catch (e) {
    console.error('[Dashboard] expert analysis error:', e.message)
  }
}

function startDashboard() {
  if (dashTimer) return

  setTimeout(() => updateDashboard(), 5000)

  dashTimer = setInterval(() => updateDashboard(), DASH_INTERVAL)
  expertTimer = setInterval(() => runExpertAnalysis(), EXPERT_INTERVAL)

  console.log('[Dashboard] Started — pin update every 2min, expert analysis every 10min')
}

function stopDashboard() {
  if (dashTimer) { clearInterval(dashTimer); dashTimer = null }
  if (expertTimer) { clearInterval(expertTimer); expertTimer = null }
}

function getDashStatus() {
  return { running: !!dashTimer, pinnedMsgId, interval: DASH_INTERVAL / 1000 }
}

module.exports = { startDashboard, stopDashboard, updateDashboard, getDashStatus }
