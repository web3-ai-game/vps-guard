// ============================================================
// ops.js — 運維操作中心：命令面板 + 一鍵同步 + 資源監控 + 橫向擴展
// ============================================================
const { execFile } = require('child_process')
const os = require('os')
const doApi = require('./do')

const MAX_DROPLETS = 3
const SCALE_THRESHOLD = 80 // CPU/MEM 超過 80% 觸發擴展

// ── 系統資源實時數據 ──
function getSystemResources() {
  return new Promise((resolve) => {
    execFile('bash', ['-c', [
      'echo "CPU:$(top -bn1 2>/dev/null | grep "Cpu(s)" | awk \'{print $2}\')"',
      'echo "MEM_TOTAL:$(free -m | awk \'/Mem/{print $2}\')"',
      'echo "MEM_USED:$(free -m | awk \'/Mem/{print $3}\')"',
      'echo "MEM_PCT:$(free -m | awk \'/Mem/{printf \"%.0f\", $3/$2*100}\')"',
      'echo "DISK_USED:$(df -h / | awk \'NR==2{print $3}\')"',
      'echo "DISK_TOTAL:$(df -h / | awk \'NR==2{print $2}\')"',
      'echo "DISK_PCT:$(df / | awk \'NR==2{printf \"%.0f\", $3/$2*100}\')"',
      'echo "LOAD:$(cat /proc/loadavg | awk \'{print $1}\')"',
      'echo "UPTIME:$(uptime -p | sed \'s/up //\')"',
      'echo "CONNS:$(ss -s | grep estab | awk \'{print $4}\' | tr -d \',\')"',
      'echo "PROCS:$(ps aux | wc -l)"',
    ].join('; ')], { timeout: 8000 }, (err, stdout) => {
      const m = {}
      if (stdout) {
        stdout.split('\n').forEach(l => {
          const [k, ...v] = l.split(':')
          if (k && v.length) m[k.trim()] = v.join(':').trim()
        })
      }
      resolve({
        cpu: parseFloat(m.CPU) || 0,
        memTotal: parseInt(m.MEM_TOTAL) || 0,
        memUsed: parseInt(m.MEM_USED) || 0,
        memPct: parseInt(m.MEM_PCT) || 0,
        diskUsed: m.DISK_USED || '?',
        diskTotal: m.DISK_TOTAL || '?',
        diskPct: parseInt(m.DISK_PCT) || 0,
        load: parseFloat(m.LOAD) || 0,
        uptime: m.UPTIME || '?',
        connections: parseInt(m.CONNS) || 0,
        processes: parseInt(m.PROCS) || 0,
        vcpus: os.cpus().length,
        hostname: os.hostname(),
        ts: new Date().toISOString(),
      })
    })
  })
}

// ── 可執行命令清單 ──
const COMMANDS = {
  // 安全掃描
  ufw_status:    { label: 'UFW 防火牆狀態', cmd: 'ufw', args: ['status', 'verbose'], category: 'security' },
  fail2ban:      { label: 'Fail2Ban 狀態', cmd: 'fail2ban-client', args: ['status'], category: 'security' },
  ssh_logins:    { label: 'SSH 登入記錄', cmd: 'bash', args: ['-c', 'last -20 | head -25'], category: 'security' },
  auth_fails:    { label: '認證失敗記錄', cmd: 'bash', args: ['-c', 'grep "Failed password" /var/log/auth.log 2>/dev/null | tail -15'], category: 'security' },
  open_ports:    { label: '開放端口', cmd: 'bash', args: ['-c', 'netstat -tlnp 2>/dev/null | grep LISTEN'], category: 'security' },
  connections:   { label: '活躍連線', cmd: 'bash', args: ['-c', 'ss -tnp state established | head -30'], category: 'security' },
  // 系統管理
  pm2_status:    { label: 'PM2 進程狀態', cmd: 'pm2', args: ['jlist'], category: 'system' },
  pm2_restart:   { label: 'PM2 重啟', cmd: 'pm2', args: ['restart', 'blue-team', '--update-env'], category: 'system' },
  nginx_status:  { label: 'Nginx 狀態', cmd: 'bash', args: ['-c', 'nginx -t 2>&1; systemctl is-active nginx'], category: 'system' },
  disk_usage:    { label: '磁盤使用', cmd: 'df', args: ['-h'], category: 'system' },
  top_procs:     { label: '資源佔用 Top', cmd: 'bash', args: ['-c', 'ps aux --sort=-%cpu | head -12'], category: 'system' },
  // 部署同步
  git_pull:      { label: 'Git Pull', cmd: 'bash', args: ['-c', 'cd /root/TEAM && git pull origin main 2>&1'], category: 'deploy' },
  git_status:    { label: 'Git Status', cmd: 'bash', args: ['-c', 'cd /root/TEAM && git status --short'], category: 'deploy' },
  build_deploy:  { label: '構建+部署', cmd: 'bash', args: ['-c', 'cd /root/TEAM && npm run build 2>&1 && pm2 restart blue-team --update-env 2>&1 && echo "DEPLOY_OK"'], category: 'deploy', timeout: 60000 },
  sync_x:        { label: '同步 /root/X/', cmd: 'bash', args: ['-c', 'ls -la /root/X/; echo "---"; cat /root/X/README.md | head -20'], category: 'deploy' },
}

// ── 執行命令 ──
function runCommand(cmdId) {
  const spec = COMMANDS[cmdId]
  if (!spec) return Promise.reject(new Error(`Unknown command: ${cmdId}`))

  return new Promise((resolve) => {
    const start = Date.now()
    execFile(spec.cmd, spec.args, { timeout: spec.timeout || 15000, maxBuffer: 2 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({
        id: cmdId,
        label: spec.label,
        category: spec.category,
        ok: !err,
        stdout: (stdout || '').slice(0, 8000),
        stderr: (stderr || '').slice(0, 2000),
        error: err ? err.message : null,
        duration: ((Date.now() - start) / 1000).toFixed(1),
        ts: new Date().toISOString(),
      })
    })
  })
}

// ── 一鍵全量同步 (git pull → build → pm2 restart) ──
async function fullSync() {
  const steps = []

  // Step 1: git pull
  const pull = await runCommand('git_pull')
  steps.push({ step: 'git_pull', ...pull })
  if (!pull.ok && !pull.stdout.includes('Already up to date')) {
    return { ok: false, steps, error: 'Git pull failed' }
  }

  // Step 2: build
  const build = await runCommand('build_deploy')
  steps.push({ step: 'build_deploy', ...build })

  return {
    ok: build.ok || (build.stdout && build.stdout.includes('DEPLOY_OK')),
    steps,
    ts: new Date().toISOString(),
  }
}

// ── 自動擴展判斷 ──
async function checkAutoScale() {
  const res = await getSystemResources()
  const needScale = res.cpu > SCALE_THRESHOLD || res.memPct > SCALE_THRESHOLD

  let droplets = []
  let canScale = false
  try {
    droplets = await doApi.listDroplets()
    canScale = droplets.length < MAX_DROPLETS
  } catch (e) {
    return { needScale, canScale: false, current: res, droplets: [], error: e.message }
  }

  return {
    needScale,
    canScale,
    current: res,
    dropletCount: droplets.length,
    maxDroplets: MAX_DROPLETS,
    threshold: SCALE_THRESHOLD,
    droplets,
  }
}

// ── 自動擴展執行 ──
async function autoScale(region) {
  const check = await checkAutoScale()
  if (!check.needScale) return { scaled: false, reason: 'Resources within threshold', ...check }
  if (!check.canScale) return { scaled: false, reason: `Max droplets (${MAX_DROPLETS}) reached`, ...check }

  try {
    const droplet = await doApi.createShieldDroplet({
      name: `bt-shield-auto-${Date.now()}`,
      region: region || 'sgp1',
      targetIp: '167.71.13.130',
      targetPort: 3001,
    })
    return { scaled: true, droplet, ...check }
  } catch (e) {
    return { scaled: false, reason: e.message, ...check }
  }
}

function getCommandList() {
  return Object.entries(COMMANDS).map(([id, spec]) => ({
    id,
    label: spec.label,
    category: spec.category,
  }))
}

module.exports = { getSystemResources, runCommand, fullSync, checkAutoScale, autoScale, getCommandList, COMMANDS }
