import { useState, useEffect, useCallback } from 'react'

interface TaskResult {
  taskId: string
  name: string
  icon: string
  status: string
  summary?: string
  level?: string
  error?: string
  ts?: string
  duration?: string
  details?: Record<string, unknown>
}

interface TaskInfo {
  id: string
  name: string
  icon: string
  isRunning: boolean
  lastResult: TaskResult | null
}

interface TaskStatus {
  autoMode: boolean
  tasks: TaskInfo[]
}

const LEVEL_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  CRITICAL: { bg: 'bg-red-950/60', text: 'text-red-400', label: '嚴重' },
  HIGH:     { bg: 'bg-orange-950/60', text: 'text-orange-400', label: '高危' },
  MEDIUM:   { bg: 'bg-yellow-950/60', text: 'text-yellow-400', label: '中等' },
  LOW:      { bg: 'bg-emerald-950/60', text: 'text-emerald-400', label: '安全' },
}

export default function TaskPanel() {
  const [status, setStatus] = useState<TaskStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [scanRunning, setScanRunning] = useState(false)
  const [autoInterval, setAutoInterval] = useState(60)
  const [expanded, setExpanded] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/tasks')
      const d = await r.json()
      setStatus(d)
    } catch {}
  }, [])

  useEffect(() => {
    fetchStatus()
    const t = setInterval(fetchStatus, 5000)
    return () => clearInterval(t)
  }, [fetchStatus])

  const runSingle = async (taskId: string) => {
    setLoading(true)
    try {
      await fetch('/api/tasks/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      })
      await fetchStatus()
    } catch {}
    setLoading(false)
  }

  const runFullScan = async () => {
    setScanRunning(true)
    try {
      await fetch('/api/tasks/fullscan', { method: 'POST' })
      const poll = setInterval(async () => {
        await fetchStatus()
        const r = await fetch('/api/tasks')
        const d = await r.json()
        const anyRunning = Object.values(d.running as Record<string, boolean>).some(Boolean)
        if (!anyRunning) {
          clearInterval(poll)
          setScanRunning(false)
        }
      }, 3000)
      setTimeout(() => { clearInterval(poll); setScanRunning(false) }, 300000)
    } catch {
      setScanRunning(false)
    }
  }

  const toggleAuto = async (enable: boolean) => {
    await fetch('/api/tasks/auto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: enable, intervalMinutes: autoInterval }),
    })
    await fetchStatus()
  }

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    } catch { return ts }
  }

  if (!status) {
    return (
      <div className="h-full flex items-center justify-center text-slate-600">
        <div className="w-5 h-5 border-2 border-cyan-700 border-t-transparent rounded-full animate-spin mr-3" />
        載入任務狀態…
      </div>
    )
  }

  const critCount = status.tasks.filter(t => t.lastResult?.level === 'CRITICAL' || t.lastResult?.level === 'HIGH').length

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-200">🛡 藍隊任務中心</h2>
          <span className="text-xs text-slate-600 font-mono">小愛同學 · 全量安防</span>
        </div>
        <div className="flex items-center gap-2">
          {status.autoMode && (
            <span className="px-2 py-0.5 rounded-full bg-cyan-950/60 border border-cyan-800/50 text-cyan-400 text-[10px] font-mono animate-pulse">
              AUTO
            </span>
          )}
          {critCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-950/60 border border-red-800/50 text-red-400 text-[10px] font-mono">
              {critCount} 警報
            </span>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="shrink-0 flex flex-wrap items-center gap-3 p-4 rounded-xl bg-slate-900/50 border border-slate-800/60">
        <button
          onClick={runFullScan}
          disabled={scanRunning}
          className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all
            bg-gradient-to-r from-cyan-900/80 to-blue-900/80 text-cyan-300 border border-cyan-700/60
            hover:from-cyan-800/80 hover:to-blue-800/80
            disabled:opacity-40 disabled:pointer-events-none"
        >
          {scanRunning ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              掃描進行中…
            </span>
          ) : '⚡ 全量掃描'}
        </button>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-slate-500">自動掃描間隔</span>
          <select
            value={autoInterval}
            onChange={e => setAutoInterval(parseInt(e.target.value))}
            className="bg-slate-800/80 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1.5 outline-none"
          >
            <option value={15}>15 分鐘</option>
            <option value={30}>30 分鐘</option>
            <option value={60}>1 小時</option>
            <option value={120}>2 小時</option>
            <option value={360}>6 小時</option>
          </select>
          <button
            onClick={() => toggleAuto(!status.autoMode)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              status.autoMode
                ? 'bg-red-950/60 text-red-400 border-red-800/60 hover:bg-red-900/60'
                : 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60 hover:bg-emerald-900/60'
            }`}
          >
            {status.autoMode ? '⏹ 停止自動' : '▶ 啟動自動'}
          </button>
        </div>
      </div>

      {/* Task Grid */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
        {status.tasks.map(task => {
          const result = task.lastResult
          const ls = result?.level ? LEVEL_STYLE[result.level] : null
          const isExpanded = expanded === task.id

          return (
            <div
              key={task.id}
              className={`rounded-xl border transition-all ${
                ls ? `${ls.bg} border-slate-700/50` : 'bg-slate-900/40 border-slate-800/50'
              }`}
            >
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02]"
                onClick={() => setExpanded(isExpanded ? null : task.id)}
              >
                <span className="text-xl shrink-0">{task.icon}</span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-200">{task.name}</span>
                    {task.isRunning && (
                      <span className="w-3 h-3 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                    )}
                    {ls && (
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${ls.text} bg-black/20`}>
                        {ls.label}
                      </span>
                    )}
                  </div>
                  {result?.summary && (
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{result.summary}</p>
                  )}
                  {result?.error && (
                    <p className="text-xs text-red-400 mt-0.5 truncate">{result.error}</p>
                  )}
                </div>

                <div className="shrink-0 flex items-center gap-3">
                  {result?.ts && (
                    <span className="text-[10px] text-slate-600 font-mono">{formatTime(result.ts)}</span>
                  )}
                  {result?.duration && (
                    <span className="text-[10px] text-slate-600 font-mono">{result.duration}s</span>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); runSingle(task.id) }}
                    disabled={task.isRunning || loading}
                    className="px-3 py-1 rounded-lg text-[10px] font-semibold border transition-all
                      bg-slate-800/60 text-slate-400 border-slate-700/60
                      hover:text-cyan-400 hover:border-cyan-700/60
                      disabled:opacity-30 disabled:pointer-events-none"
                  >
                    ▶ 執行
                  </button>
                </div>
              </div>

              {isExpanded && result?.details && (
                <div className="px-4 pb-3 border-t border-slate-800/40">
                  <pre className="text-[11px] text-slate-500 font-mono mt-2 whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {JSON.stringify(result.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer info */}
      <div className="shrink-0 text-[10px] text-slate-700 font-mono flex items-center gap-4">
        <span>開源工具: Lynis · ClamAV · chkrootkit · Nmap · UFW · Fail2ban</span>
        <span>·</span>
        <span>結果同步推送 OECE 群</span>
      </div>
    </div>
  )
}
