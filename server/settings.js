const fs = require('fs')
const path = require('path')

const ENV_PATH = path.join(__dirname, '..', '.env')

function readEnv() {
  if (!fs.existsSync(ENV_PATH)) return {}
  const raw = fs.readFileSync(ENV_PATH, 'utf-8')
  const out = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

function writeEnv(values) {
  const current = readEnv()
  const merged = { ...current, ...values }
  const lines = Object.entries(merged).map(([k, v]) => `${k}=${v}`)
  fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n', 'utf-8')
  for (const [k, v] of Object.entries(values)) {
    process.env[k] = v
  }
}

function maskKey(val) {
  if (!val || val.length < 8) return val ? '***' : ''
  return val.slice(0, 6) + '***' + val.slice(-4)
}

module.exports = { readEnv, writeEnv, maskKey }
