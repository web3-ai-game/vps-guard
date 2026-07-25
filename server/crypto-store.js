const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const ALGO = 'aes-256-gcm'
const KEY_FILE = path.join(__dirname, '..', '.crypto-key')
const X_DIR = process.env.X_DIR || '/root/X'

function getOrCreateKey() {
  if (process.env.CRYPTO_KEY) return Buffer.from(process.env.CRYPTO_KEY, 'hex')
  try {
    const hex = fs.readFileSync(KEY_FILE, 'utf8').trim()
    return Buffer.from(hex, 'hex')
  } catch {
    const key = crypto.randomBytes(32)
    try { fs.writeFileSync(KEY_FILE, key.toString('hex'), { mode: 0o600 }) } catch {}
    return key
  }
}

const KEY = getOrCreateKey()

function encrypt(plaintext) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, KEY, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

function decrypt(b64) {
  const buf = Buffer.from(b64, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const enc = buf.subarray(28)
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv)
  decipher.setAuthTag(tag)
  return decipher.update(enc, null, 'utf8') + decipher.final('utf8')
}

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
}

function saveEncrypted(relPath, data) {
  const full = path.join(X_DIR, relPath)
  ensureDir(path.dirname(full))
  const json = typeof data === 'string' ? data : JSON.stringify(data)
  fs.writeFileSync(full, encrypt(json), 'utf8')
}

function loadEncrypted(relPath) {
  const full = path.join(X_DIR, relPath)
  try {
    const b64 = fs.readFileSync(full, 'utf8').trim()
    const json = decrypt(b64)
    try { return JSON.parse(json) } catch { return json }
  } catch { return null }
}

function appendEncryptedLog(relPath, entry) {
  const full = path.join(X_DIR, relPath)
  ensureDir(path.dirname(full))
  const line = encrypt(JSON.stringify(entry))
  fs.appendFileSync(full, line + '\n', 'utf8')
}

function readEncryptedLog(relPath) {
  const full = path.join(X_DIR, relPath)
  try {
    const lines = fs.readFileSync(full, 'utf8').trim().split('\n').filter(Boolean)
    return lines.map(line => {
      try { return JSON.parse(decrypt(line)) } catch { return null }
    }).filter(Boolean)
  } catch { return [] }
}

function listEncryptedLogs(dir) {
  const full = path.join(X_DIR, dir)
  try {
    return fs.readdirSync(full).filter(f => f.endsWith('.enc')).sort()
  } catch { return [] }
}

module.exports = { encrypt, decrypt, saveEncrypted, loadEncrypted, appendEncryptedLog, readEncryptedLog, listEncryptedLogs, X_DIR }
