import { useState } from 'react'

interface AuditData {
  os?: string
  security?: { firewallEnabled: boolean; stealthEnabled: boolean }
  listenPorts?: { port: string; process: string }[]
  devices?: { ip: string }[]
  wifi?: { authMode?: string }
  network?: { dns: string[] }
  score?: number
  verdict?: string
  findings?: { level: string; title: string }[]
}

interface TeammateData {
  ip?: string
  firewall?: string
  defender?: string
  open_ports?: string
}

interface Props {
  auditData: AuditData | null
  botRunning: boolean
}

export default function AIIntelPanel({ auditData, botRunning }: Props) {
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runAnalysis = async () => {
    setLoading(true)
    setError(null)
    setAnalysis(null)

    try {
      let teammateData: TeammateData | null = null
      if (botRunning) {
        const r = await fetch('/api/bot/messages')
        const d = await r.json()
        if (d.teammate) teammateData = d.teammate
      }

      const resp = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auditData: auditData || {}, teammateData }),
      })
      const data = await resp.json()
      if (data.error) throw new Error(data.error)
      setAnalysis(data.analysis)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '未知錯誤')
    } finally {
      setLoading(false)
    }
  }

  const renderAnalysis = (text: string) => {
    return text.split('\n').map((line, i) => {
      if (!line.trim()) return <div key={i} className="h-2" />
      if (line.startsWith('**') && line.endsWith('**')) {
        return <div key={i} className="text-cyan-300 font-semibold text-sm mt-3 mb-1">{line.replace(/\*\*/g, '')}</div>
      }
      if (/^\d+\./.test(line)) {
        return <div key={i} className="text-slate-300 text-sm pl-4 py-0.5">{line}</div>
      }
      if (line.startsWith('🔴') || line.startsWith('⚠') || line.startsWith('🚨')) {
        return <div key={i} className="text-red-400 text-sm py-0.5">{line}</div>
      }
      if (line.startsWith('🟡') || line.startsWith('⚡')) {
        return <div key={i} className="text-yellow-400 text-sm py-0.5">{line}</div>
      }
      if (line.startsWith('✅') || line.startsWith('🟢')) {
        return <div key={i} className="text-emerald-400 text-sm py-0.5">{line}</div>
      }
      return <div key={i} className="text-slate-400 text-sm py-0.5">{line}</div>
    })
  }

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-start gap-4">
        <div className="flex-1">
          <div className="text-base font-medium text-slate-200 mb-1">🤖 Grok AI 安全智能分析</div>
          <div className="text-xs text-slate-600">
            整合你的審計數據和隊友狀態，由 xAI Grok 給出繁體中文安全建議
          </div>
        </div>
        <button
          onClick={runAnalysis}
          disabled={loading}
          className="shrink-0 px-5 py-2.5 rounded-xl text-sm font-mono border border-cyan-800/60 bg-cyan-950/30 text-cyan-400 hover:border-cyan-600 hover:bg-cyan-900/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading ? (
            <><div className="w-4 h-4 border-2 border-cyan-700 border-t-transparent rounded-full animate-spin" />分析中…</>
          ) : (
            <><span>⚡</span>開始分析</>
          )}
        </button>
      </div>

      {/* Context info */}
      <div className="shrink-0 grid grid-cols-3 gap-3">
        <div className={`rounded-xl border px-3 py-2.5 ${auditData ? 'border-emerald-800/40 bg-emerald-950/10' : 'border-slate-800 bg-slate-900/30'}`}>
          <div className="text-[10px] text-slate-600 mb-1">我的設備審計</div>
          <div className={`text-sm font-mono ${auditData ? 'text-emerald-400' : 'text-slate-600'}`}>
            {auditData ? `✅ 已有數據 · ${auditData.verdict || '—'}` : '⚠ 請先執行 AUDIT 稽查'}
          </div>
        </div>
        <div className={`rounded-xl border px-3 py-2.5 ${botRunning ? 'border-cyan-800/40 bg-cyan-950/10' : 'border-slate-800 bg-slate-900/30'}`}>
          <div className="text-[10px] text-slate-600 mb-1">隊友數據</div>
          <div className={`text-sm font-mono ${botRunning ? 'text-cyan-400' : 'text-slate-600'}`}>
            {botRunning ? '✅ Bot 已連線' : '⚠ Bot 未連線'}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-3 py-2.5">
          <div className="text-[10px] text-slate-600 mb-1">AI 模型</div>
          <div className="text-sm font-mono text-purple-400">grok-4-0709</div>
        </div>
      </div>

      {/* Analysis result */}
      <div className="flex-1 min-h-0 bg-black/40 rounded-xl border border-slate-800 overflow-hidden">
        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="w-10 h-10 border-2 border-cyan-700 border-t-transparent rounded-full animate-spin" />
            <div className="text-xs text-slate-500 font-mono">Grok 分析中，約 10-20 秒…</div>
          </div>
        )}
        {error && (
          <div className="p-5">
            <div className="text-red-400 text-sm mb-2">❌ 分析失敗</div>
            <div className="text-xs text-slate-500 font-mono bg-red-950/20 border border-red-900/30 rounded-lg px-3 py-2">{error}</div>
            <div className="text-xs text-slate-600 mt-3">
              請檢查：Settings → xAI API Key 是否已填入
            </div>
          </div>
        )}
        {!loading && !error && !analysis && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
            <span className="text-4xl">🤖</span>
            <span className="text-sm">點擊「開始分析」取得 AI 安全建議</span>
            <span className="text-xs text-slate-700">需要先完成 AUDIT 稽查以獲得最準確分析</span>
          </div>
        )}
        {analysis && !loading && (
          <div className="h-full overflow-y-auto p-5">
            <div className="text-[10px] text-slate-600 font-mono mb-4 pb-3 border-b border-slate-800">
              分析時間: {new Date().toLocaleString()} · 模型: grok-4-0709
            </div>
            <div className="space-y-0.5">
              {renderAnalysis(analysis)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
