import { useState, useEffect, useCallback } from 'react'

interface Command {
  id: string
  label: string
  category: string
}

interface Resources {
  cpu: number
  memPct: number
  memUsed: number
  memTotal: number
  diskPct: number
  diskUsed: string
  diskTotal: string
  load: number
  uptime: string
  connections: number
  processes: number
  vcpus: number
  hostname: string
  ts: string
}

interface CmdResult {
  id: string
  label: string
  ok: boolean
  stdout: string
  stderr: string
  error: string | null
  duration: string
  ts: string
}

interface VaultStatus {
  encrypted: boolean
  algorithm: string
  totalSizeKB: number
  chatDays: number
  analysisDays: number
  today: { total: number; userMessages: number; botMessages: number; commands: number; alerts: number }
}

interface ScaleInfo {
  needScale: boolean
  canScale: boolean
  dropletCount: number
  maxDroplets: number
  threshold: number
}

export default function CommandPanel() {
  const [commands, setCommands] = useState<Command[]>([])
  const [resources, setResources] = useState<Resources | null>(null)
  const [vault, setVault] = useState<VaultStatus | null>(null)
  const [scale, setScale] = useState<ScaleInfo | null>(null)
  const [result, setResult] = useState<CmdResult | null>(null)
  const [loading, setLoading] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<any>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [tab, setTab] = useState<'commands' | 'vault' | 'scale'>('commands')

  const load = useCallback(async () => {
    try {
      const [cmdR, resR, vaultR, scaleR] = await Promise.all([
        fetch('/api/ops/commands').then(r => r.json()),
        fetch('/api/ops/resources').then(r => r.json()),
        fetch('/api/vault/status').then(r => r.json()),
        fetch('/api/ops/autoscale').then(r => r.json()).catch(() => null),
      ])
      setCommands(cmdR.commands || [])
      setResources(resR)
      setVault(vaultR)
      if (scaleR) setScale(scaleR)
    } catch {}
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { const t = setInterval(load, 15000); return () => clearInterval(t) }, [load])

  const runCmd = async (cmdId: string) => {
    setLoading(cmdId)
    setResult(null)
    try {
      const r = await fetch('/api/ops/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmdId }),
      })
      const data = await r.json()
      setResult(data)
    } catch (e: any) {
      setResult({ id: cmdId, label: cmdId, ok: false, stdout: '', stderr: '', error: e.message, duration: '0', ts: '' })
    }
    setLoading('')
  }

  const fullSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const r = await fetch('/api/ops/sync', { method: 'POST' })
      const data = await r.json()
      setSyncResult(data)
    } catch (e: any) {
      setSyncResult({ ok: false, error: e.message })
    }
    setSyncing(false)
  }

  const runAnalysis = async () => {
    setAnalyzing(true)
    setAnalysis(null)
    try {
      const r = await fetch('/api/vault/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await r.json()
      setAnalysis(data.analysis || 'No analysis returned')
    } catch (e: any) {
      setAnalysis(`Error: ${e.message}`)
    }
    setAnalyzing(false)
  }

  const catByKey = (cat: string) => commands.filter(c => c.category === cat)
  const categories = [
    { key: 'security', label: '🛡 安全', color: 'rose' },
    { key: 'system', label: '⚙ 系統', color: 'cyan' },
    { key: 'deploy', label: '🚀 部署', color: 'emerald' },
  ]

  const pctColor = (v: number) => v > 80 ? 'text-red-400' : v > 60 ? 'text-amber-400' : 'text-emerald-400'
  const pctBar = (v: number) => (
    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${v > 80 ? 'bg-red-500' : v > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(v, 100)}%` }} />
    </div>
  )

  return (
    <div className="h-full flex flex-col gap-4 overflow-auto">
      {/* Resource monitor bar */}
      {resources && (
        <div className="grid grid-cols-6 gap-3">
          {[
            { label: 'CPU', val: `${resources.cpu.toFixed(1)}%`, pct: resources.cpu },
            { label: 'MEM', val: `${resources.memUsed}/${resources.memTotal}MB`, pct: resources.memPct },
            { label: 'DISK', val: `${resources.diskUsed}/${resources.diskTotal}`, pct: resources.diskPct },
            { label: 'LOAD', val: `${resources.load}`, pct: (resources.load / resources.vcpus) * 100 },
            { label: 'CONN', val: `${resources.connections}`, pct: Math.min(resources.connections / 2, 100) },
            { label: 'PROCS', val: `${resources.processes}`, pct: Math.min(resources.processes / 3, 100) },
          ].map(m => (
            <div key={m.label} className="bg-slate-900/60 border border-slate-800/60 rounded-lg p-2.5">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">{m.label}</span>
                <span className={`text-xs font-mono font-bold ${pctColor(m.pct)}`}>{m.val}</span>
              </div>
              {pctBar(m.pct)}
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        {[
          { id: 'commands' as const, label: '⚡ 命令面板', count: commands.length },
          { id: 'vault' as const, label: '🔒 機密容器', count: vault?.today?.total || 0 },
          { id: 'scale' as const, label: '☁ 橫向擴展', count: scale?.dropletCount || 0 },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${
              tab === t.id ? 'bg-cyan-950/70 text-cyan-300 border-cyan-700/80' : 'text-slate-500 border-transparent hover:bg-slate-800/60'
            }`}>
            {t.label} <span className="text-[10px] opacity-60">({t.count})</span>
          </button>
        ))}

        <div className="flex-1" />
        <button onClick={fullSync} disabled={syncing}
          className="px-5 py-2 bg-emerald-600/80 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold transition-all disabled:opacity-50 border border-emerald-500/40">
          {syncing ? '⏳ 同步中…' : '🔄 一鍵同步'}
        </button>
      </div>

      {syncResult && (
        <div className={`p-3 rounded-lg border text-xs font-mono ${syncResult.ok ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-300' : 'bg-red-950/40 border-red-700/50 text-red-300'}`}>
          {syncResult.ok ? '✅ 同步成功' : `❌ ${syncResult.error || '同步失敗'}`}
          {syncResult.steps?.map((s: any, i: number) => (
            <div key={i} className="mt-1 opacity-80">{s.ok ? '✓' : '✗'} {s.step} ({s.duration}s)</div>
          ))}
        </div>
      )}

      {/* Commands tab */}
      {tab === 'commands' && (
        <div className="flex gap-4 flex-1 min-h-0">
          <div className="w-64 shrink-0 space-y-3 overflow-auto">
            {categories.map(cat => (
              <div key={cat.key}>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">{cat.label}</h3>
                <div className="space-y-1">
                  {catByKey(cat.key).map(cmd => (
                    <button key={cmd.id} onClick={() => runCmd(cmd.id)} disabled={!!loading}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all border ${
                        loading === cmd.id ? 'bg-amber-950/50 border-amber-700/50 text-amber-300 animate-pulse'
                          : result?.id === cmd.id ? (result.ok ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-300' : 'bg-red-950/40 border-red-700/50 text-red-300')
                          : 'bg-slate-900/40 border-slate-800/50 text-slate-300 hover:bg-slate-800/60 hover:border-slate-700/60'
                      }`}>
                      {cmd.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex-1 bg-slate-950/60 border border-slate-800/50 rounded-lg p-4 overflow-auto">
            {result ? (
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className={`font-bold text-sm ${result.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                    {result.ok ? '✅' : '❌'} {result.label}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">{result.duration}s</span>
                </div>
                <pre className="text-[11px] font-mono text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {result.stdout || result.stderr || result.error || 'No output'}
                </pre>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center h-full text-amber-400 animate-pulse">⏳ 執行中…</div>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-600 text-sm">選擇左側命令執行</div>
            )}
          </div>
        </div>
      )}

      {/* Vault tab */}
      {tab === 'vault' && vault && (
        <div className="flex-1 space-y-4 overflow-auto">
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: '加密算法', val: vault.algorithm, icon: '🔐' },
              { label: '容器大小', val: `${vault.totalSizeKB} KB`, icon: '💾' },
              { label: '記錄天數', val: `${vault.chatDays}`, icon: '📅' },
              { label: '分析報告', val: `${vault.analysisDays}`, icon: '📊' },
            ].map(s => (
              <div key={s.label} className="bg-slate-900/60 border border-slate-800/60 rounded-lg p-3">
                <span className="text-base mr-2">{s.icon}</span>
                <span className="text-[10px] text-slate-500 uppercase">{s.label}</span>
                <div className="text-sm font-bold text-slate-200 mt-1">{s.val}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: '今日訊息', val: vault.today.total, color: 'cyan' },
              { label: '用戶訊息', val: vault.today.userMessages, color: 'emerald' },
              { label: 'Bot 訊息', val: vault.today.botMessages, color: 'violet' },
            ].map(s => (
              <div key={s.label} className={`bg-${s.color}-950/30 border border-${s.color}-800/40 rounded-lg p-3 text-center`}>
                <div className={`text-2xl font-bold text-${s.color}-400`}>{s.val}</div>
                <div className="text-[10px] text-slate-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={runAnalysis} disabled={analyzing}
              className="px-5 py-2.5 bg-violet-600/80 hover:bg-violet-500 text-white rounded-lg text-sm font-bold transition-all disabled:opacity-50 border border-violet-500/40">
              {analyzing ? '🧠 分析中…' : '🧠 AI 機密分析'}
            </button>
          </div>

          {analysis && (
            <div className="bg-violet-950/30 border border-violet-800/40 rounded-lg p-4">
              <h3 className="text-sm font-bold text-violet-300 mb-2">🔒 機密分析結果</h3>
              <pre className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{analysis}</pre>
            </div>
          )}
        </div>
      )}

      {/* Scale tab */}
      {tab === 'scale' && scale && (
        <div className="flex-1 space-y-4 overflow-auto">
          <div className="grid grid-cols-3 gap-3">
            <div className={`rounded-lg p-4 border ${scale.needScale ? 'bg-red-950/40 border-red-700/50' : 'bg-emerald-950/40 border-emerald-700/50'}`}>
              <div className="text-[10px] text-slate-500 uppercase">擴展狀態</div>
              <div className={`text-lg font-bold ${scale.needScale ? 'text-red-400' : 'text-emerald-400'}`}>
                {scale.needScale ? '⚠ 需要擴展' : '✅ 資源正常'}
              </div>
            </div>
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-lg p-4">
              <div className="text-[10px] text-slate-500 uppercase">當前 Droplets</div>
              <div className="text-lg font-bold text-cyan-400">{scale.dropletCount} / {scale.maxDroplets}</div>
            </div>
            <div className="bg-slate-900/60 border border-slate-800/60 rounded-lg p-4">
              <div className="text-[10px] text-slate-500 uppercase">觸發閾值</div>
              <div className="text-lg font-bold text-amber-400">{scale.threshold}%</div>
            </div>
          </div>

          <div className="bg-slate-900/40 border border-slate-800/50 rounded-lg p-4 text-xs text-slate-400">
            <p>當 CPU 或 MEM 超過 {scale.threshold}% 時自動觸發橫向擴展。</p>
            <p className="mt-1">最多支持 {scale.maxDroplets} 個 VPS Droplet (DO 雲盾)。</p>
            <p className="mt-1">新 Droplet 自帶 UFW + Fail2Ban + Nginx 反向代理。</p>
          </div>
        </div>
      )}
    </div>
  )
}
