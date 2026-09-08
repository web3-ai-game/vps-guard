const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { saveEncrypted, loadEncrypted, X_DIR } = require('./crypto-store')

const CACHE_DIR = path.join(X_DIR, 'cache')
const WATCH_DIRS = [
  path.join(X_DIR),
  '/root/TEAM/server',
  '/root/TEAM/src/components',
  '/root/TEAM/dist',
]
const SNAPSHOT_FILE = 'cache/snapshot.enc'
const CHANGES_LOG = 'cache/changes.enc'
const SYNC_STATUS = 'cache/sync-status.enc'

let watchInterval = null

function ensureCacheDir() {
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }) } catch {}
  try { fs.mkdirSync(path.join(CACHE_DIR, 'diffs'), { recursive: true }) } catch {}
}

function hashFile(filePath) {
  try {
    const content = fs.readFileSync(filePath)
    return crypto.createHash('sha256').update(content).digest('hex')
  } catch { return null }
}

function scanDir(dir, maxDepth = 2, depth = 0) {
  const results = {}
  if (depth >= maxDepth) return results
  try {
    const items = fs.readdirSync(dir)
    for (const item of items) {
      if (item.startsWith('.') || item === 'node_modules' || item === 'cache') continue
      const full = path.join(dir, item)
      try {
        const stat = fs.statSync(full)
        if (stat.isFile()) {
          results[full] = {
            size: stat.size,
            mtime: stat.mtimeMs,
            hash: hashFile(full),
          }
        } else if (stat.isDirectory()) {
          Object.assign(results, scanDir(full, maxDepth, depth + 1))
        }
      } catch {}
    }
  } catch {}
  return results
}

function takeSnapshot() {
  ensureCacheDir()
  const snapshot = {}
  for (const dir of WATCH_DIRS) {
    try {
      Object.assign(snapshot, scanDir(dir))
    } catch {}
  }
  snapshot._ts = Date.now()
  snapshot._dirs = WATCH_DIRS
  saveEncrypted(SNAPSHOT_FILE, snapshot)
  return snapshot
}

function detectChanges() {
  const prev = loadEncrypted(SNAPSHOT_FILE)
  const current = takeSnapshot()

  if (!prev) return { firstRun: true, files: Object.keys(current).length }

  const changes = { added: [], modified: [], deleted: [], ts: Date.now() }

  for (const [file, info] of Object.entries(current)) {
    if (file.startsWith('_')) continue
    if (!prev[file]) {
      changes.added.push({ file, size: info.size })
    } else if (prev[file].hash !== info.hash) {
      changes.modified.push({ file, oldSize: prev[file].size, newSize: info.size })
    }
  }

  for (const file of Object.keys(prev)) {
    if (file.startsWith('_')) continue
    if (!current[file]) {
      changes.deleted.push({ file })
    }
  }

  const hasChanges = changes.added.length + changes.modified.length + changes.deleted.length > 0

  if (hasChanges) {
    const existing = loadEncrypted(CHANGES_LOG) || []
    existing.push(changes)
    if (existing.length > 100) existing.splice(0, existing.length - 100)
    saveEncrypted(CHANGES_LOG, existing)
  }

  return { hasChanges, ...changes }
}

function getCachedChanges() {
  return loadEncrypted(CHANGES_LOG) || []
}

function getSyncStatus() {
  return loadEncrypted(SYNC_STATUS) || { mac: null, win: null }
}

function updateSyncStatus(platform, data) {
  const status = getSyncStatus()
  status[platform] = {
    ...data,
    ts: new Date().toISOString(),
  }
  saveEncrypted(SYNC_STATUS, status)
  return status
}

function cacheContent(key, content) {
  ensureCacheDir()
  const safeKey = path.basename(key)
  saveEncrypted(`cache/${safeKey}.enc`, {
    content,
    cachedAt: new Date().toISOString(),
  })
}

function getCachedContent(key) {
  const safeKey = path.basename(key)
  const data = loadEncrypted(`cache/${safeKey}.enc`)
  return data?.content || null
}

function startWatching(intervalMs = 60000, onChangeCallback) {
  if (watchInterval) clearInterval(watchInterval)

  ensureCacheDir()
  takeSnapshot()

  watchInterval = setInterval(() => {
    try {
      const result = detectChanges()
      if (result.hasChanges && onChangeCallback) {
        onChangeCallback(result)
      }
    } catch (e) {
      console.error('[Watcher] scan error:', e.message)
    }
  }, intervalMs)

  console.log(`[Watcher] Monitoring ${WATCH_DIRS.length} dirs every ${intervalMs / 1000}s`)
  return watchInterval
}

function stopWatching() {
  if (watchInterval) { clearInterval(watchInterval); watchInterval = null }
}

function getWatchStatus() {
  const snapshot = loadEncrypted(SNAPSHOT_FILE)
  const changes = getCachedChanges()
  return {
    watching: !!watchInterval,
    dirs: WATCH_DIRS,
    lastSnapshot: snapshot?._ts ? new Date(snapshot._ts).toISOString() : null,
    trackedFiles: snapshot ? Object.keys(snapshot).filter(k => !k.startsWith('_')).length : 0,
    totalChanges: changes.length,
    recentChanges: changes.slice(-5),
  }
}

module.exports = {
  takeSnapshot, detectChanges, getCachedChanges,
  getSyncStatus, updateSyncStatus,
  cacheContent, getCachedContent,
  startWatching, stopWatching, getWatchStatus,
}
