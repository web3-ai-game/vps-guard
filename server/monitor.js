// server/monitor.js — VPS Security Monitor Daemon
// Monitors auth.log, nginx, fail2ban, DDoS patterns
// Reports to panel + TG

const { execFile } = require('child_process')
const fs = require('fs')

const MAX_ALERTS = 300
const alerts = []
let monitorInterval = null
let broadcastFn = null // set by init()

// ═══ Alert Management ═══
function addAlert(level, category, title, detail) {
  const alert = {
    id: Date.now() + Math.random(),
    level, // CRITICAL, HIGH, MEDIUM, INFO
    category, // ssh, scan, ddos, ban, system
    title,
    detail,
    ts: new Date().toISOString(),
    reported: false,
  }
  alerts.unshift(alert)
  if (alerts.length > MAX_ALERTS) alerts.length = MAX_ALERTS

  // Broadcast CRITICAL and HIGH to TG
  if ((level === 'CRITICAL' || level === 'HIGH') && broadcastFn) {
    const emoji = level === 'CRITICAL' ? '🚨' : '⚠️'
    broadcastFn(`${emoji} [安全警報] ${title}\n${detail}`).catch(() => {})
  }

  return alert
}

// ═══ Auth.log Monitor — SSH brute force detection ═══
let lastAuthCheck = 0

async function checkAuthLog() {
  return new Promise((resolve) => {
    const since = new Date(Date.now() - 120000).toISOString() // last 2 min
    execFile('journalctl', ['-u', 'ssh', '--since', '2 minutes ago', '--no-pager', '-q'], { timeout: 5000 }, (err, stdout) => {
      if (err || !stdout) return resolve()
      const lines = stdout.split('\n').filter(Boolean)
      const failedAttempts = lines.filter(l => l.includes('Failed password') || l.includes('Invalid user'))
      const acceptedLogins = lines.filter(l => l.includes('Accepted'))

      if (failedAttempts.length >= 5) {
        // Extract IPs
        const ips = {}
        for (const line of failedAttempts) {
          const ipMatch = line.match(/from (\d+\.\d+\.\d+\.\d+)/)
          if (ipMatch) ips[ipMatch[1]] = (ips[ipMatch[1]] || 0) + 1
        }
        const topAttackers = Object.entries(ips).sort((a, b) => b[1] - a[1]).slice(0, 5)
        addAlert('HIGH', 'ssh', `SSH 暴力破解偵測 (${failedAttempts.length} 次失敗)`,
          `過去 2 分鐘 ${failedAttempts.length} 次失敗嘗試\n攻擊來源: ${topAttackers.map(([ip, c]) => `${ip}(${c}次)`).join(', ')}`)
      }

      for (const line of acceptedLogins) {
        const ipMatch = line.match(/from (\d+\.\d+\.\d+\.\d+)/)
        addAlert('INFO', 'ssh', 'SSH 登入成功', `${line.slice(-80)}\nIP: ${ipMatch?.[1] || 'unknown'}`)
      }
      resolve()
    })
  })
}

// ═══ Connection Rate Monitor — DDoS Detection ═══
let prevConnCount = 0
let highConnStreak = 0

async function checkConnectionRate() {
  return new Promise((resolve) => {
    execFile('ss', ['-tn', 'state', 'established'], { timeout: 3000 }, (err, stdout) => {
      if (err) return resolve()
      const lines = stdout.split('\n').filter(l => l.trim() && !l.startsWith('Recv-Q'))
      const count = lines.length

      // Track connection rate spike
      if (count > 200) {
        highConnStreak++
        if (highConnStreak >= 3) {
          addAlert('CRITICAL', 'ddos', `疑似 DDoS 攻擊 — ${count} 條連線`,
            `連續 ${highConnStreak} 次偵測到超高連線數 (>${200})\n當前: ${count} 條 TCP 連線\n建議立即啟用 DO 雲盾`)
        }
      } else if (count > 100) {
        addAlert('MEDIUM', 'system', `高連線數: ${count} 條 TCP`, `連線數超過 100，密切關注`)
        highConnStreak = 0
      } else {
        highConnStreak = 0
      }

      // Track IPs with most connections
      const ipCounts = {}
      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 4) {
          const remoteIp = parts[3].replace(/:\d+$/, '')
          ipCounts[remoteIp] = (ipCounts[remoteIp] || 0) + 1
        }
      }
      // Single IP with > 30 connections = suspicious
      for (const [ip, c] of Object.entries(ipCounts)) {
        if (c > 30) {
          addAlert('HIGH', 'scan', `單一 IP 大量連線: ${ip} (${c} 條)`,
            `IP ${ip} 建立了 ${c} 條 TCP 連線，可能是掃描或攻擊`)
        }
      }

      prevConnCount = count
      resolve()
    })
  })
}

// ═══ Fail2Ban Monitor ═══
async function checkFail2ban() {
  return new Promise((resolve) => {
    execFile('fail2ban-client', ['status', 'sshd'], { timeout: 3000 }, (err, stdout) => {
      if (err) return resolve()
      const bannedMatch = stdout.match(/Currently banned:\s*(\d+)/)
      const totalMatch = stdout.match(/Total banned:\s*(\d+)/)
      const ipListMatch = stdout.match(/Banned IP list:\s*(.+)/)

      const current = parseInt(bannedMatch?.[1] || '0')
      const total = parseInt(totalMatch?.[1] || '0')

      if (current > 0) {
        const ips = ipListMatch?.[1]?.trim() || ''
        addAlert('INFO', 'ban', `Fail2Ban 已封鎖 ${current} 個 IP`,
          `當前封鎖: ${current} | 總計封鎖: ${total}\n封鎖 IP: ${ips}`)
      }
      resolve()
    })
  })
}

// ═══ Nginx Access Log Scanner ═══
async function checkNginxScans() {
  return new Promise((resolve) => {
    // Check for common scan patterns in last 2 min of nginx logs
    execFile('bash', ['-c',
      'tail -500 /var/log/nginx/access.log 2>/dev/null | grep -iE "(wp-admin|.env|phpinfo|shell|eval|passwd|../|sql|union|select|script)" | tail -20'
    ], { timeout: 3000 }, (err, stdout) => {
      if (err || !stdout?.trim()) return resolve()
      const lines = stdout.trim().split('\n').filter(Boolean)
      if (lines.length > 0) {
        const ips = {}
        for (const line of lines) {
          const ipMatch = line.match(/^(\d+\.\d+\.\d+\.\d+)/)
          if (ipMatch) ips[ipMatch[1]] = (ips[ipMatch[1]] || 0) + 1
        }
        const attackers = Object.entries(ips).map(([ip, c]) => `${ip}(${c}次)`).join(', ')
        addAlert('MEDIUM', 'scan', `偵測到 ${lines.length} 次惡意掃描`,
          `Nginx 日誌發現可疑請求\n掃描來源: ${attackers}\n範例: ${lines[0]?.slice(0, 120)}`)
      }
      resolve()
    })
  })
}

// ═══ Main Monitor Loop ═══
async function runMonitorCycle() {
  try {
    await Promise.all([
      checkAuthLog(),
      checkConnectionRate(),
      checkFail2ban(),
      checkNginxScans(),
    ])
  } catch (e) {
    console.error('[Monitor] cycle error:', e.message)
  }
}

function startMonitor(tgBroadcast) {
  if (tgBroadcast) broadcastFn = tgBroadcast
  if (monitorInterval) clearInterval(monitorInterval)

  // Initial scan
  runMonitorCycle()
  // Run every 60 seconds
  monitorInterval = setInterval(runMonitorCycle, 60 * 1000)
  console.log('[Monitor] Security monitor started (60s interval)')
}

function stopMonitor() {
  if (monitorInterval) { clearInterval(monitorInterval); monitorInterval = null }
}

// ═══ API Functions ═══
function getAlerts(limit = 50) {
  return alerts.slice(0, limit)
}

function getAlertsByLevel(level) {
  return alerts.filter(a => a.level === level).slice(0, 50)
}

function getMonitorStatus() {
  const critCount = alerts.filter(a => a.level === 'CRITICAL' && Date.now() - new Date(a.ts).getTime() < 3600000).length
  const highCount = alerts.filter(a => a.level === 'HIGH' && Date.now() - new Date(a.ts).getTime() < 3600000).length
  return {
    running: !!monitorInterval,
    totalAlerts: alerts.length,
    recentCritical: critCount,
    recentHigh: highCount,
    connStreak: highConnStreak,
    ddosRisk: highConnStreak >= 2 ? 'HIGH' : highConnStreak >= 1 ? 'MEDIUM' : 'LOW',
  }
}

module.exports = {
  startMonitor, stopMonitor,
  getAlerts, getAlertsByLevel, getMonitorStatus,
  addAlert,
}
