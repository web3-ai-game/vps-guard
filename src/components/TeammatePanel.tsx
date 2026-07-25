import { useState, useEffect, useCallback } from 'react'

interface TeammateStatus {
  ip?: string
  hostname?: string
  os?: string
  firewall?: string
  defender?: string
  open_ports?: string
  timestamp?: string
  raw?: string
}

interface BotMessage {
  id: number
  from: string
  text: string
  ts: string
}

interface Props {
  botRunning: boolean
}

function StatBadge({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3">
      <div className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-sm font-mono font-medium ${ok === true ? 'text-emerald-400' : ok === false ? 'text-red-400' : 'text-slate-300'}`}>
        {value || '—'}
      </div>
    </div>
  )
}

const WIN_ACTIONS = [
  { id: 'protect', icon: '🛡', label: '一鍵全防護', desc: '啟用防火牆 + Defender + 禁用 SMB1 + DNS 清除', cmd: '!protect', color: 'border-emerald-800/50 hover:border-emerald-600 hover:bg-emerald-950/40' },
  { id: 'status',  icon: '📊', label: '取得狀態',   desc: '回報 IP / 防火牆 / Defender / 開放端口',     cmd: '!status',  color: 'border-cyan-800/50 hover:border-cyan-600 hover:bg-cyan-950/40' },
  { id: 'netstat', icon: '🔗', label: '連線狀態',   desc: '列出所有 ESTABLISHED TCP 連線',               cmd: '!netstat', color: 'border-indigo-800/50 hover:border-indigo-600 hover:bg-indigo-950/40' },
  { id: 'ipconfig',icon: '🌐', label: '網路配置',   desc: '顯示 IP / 閘道 / DNS 配置',                  cmd: '!ipconfig',color: 'border-sky-800/50 hover:border-sky-600 hover:bg-sky-950/40' },
  { id: 'dnsflush',icon: '🔄', label: 'DNS 清除',   desc: 'ipconfig /flushdns',                         cmd: '!dnsflush',color: 'border-purple-800/50 hover:border-purple-600 hover:bg-purple-950/40' },
]

export default function TeammatePanel({ botRunning }: Props) {
  const [status, setStatus] = useState<TeammateStatus | null>(null)
  const [messages, setMessages] = useState<BotMessage[]>([])
  const [loading, setLoading] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<string | null>(null)

  const fetchMessages = useCallback(async () => {
    try {
      const r = await fetch('/api/bot/messages')
      const d = await r.json()
      if (d.messages) setMessages(d.messages)
      if (d.teammate) setStatus(d.teammate)
      setLastRefresh(new Date().toLocaleTimeString())
    } catch {}
  }, [])

  useEffect(() => {
    fetchMessages()
    const t = setInterval(fetchMessages, 4000)
    return () => clearInterval(t)
  }, [fetchMessages])

  const sendCmd = async (cmd: string, actionId: string) => {
    if (loading) return
    setLoading(actionId)
    try {
      await fetch('/api/bot/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cmd }),
      })
      setTimeout(fetchMessages, 3000)
    } catch {}
    setLoading(null)
  }

  const fwOk = status?.firewall?.toLowerCase().includes('true') || status?.firewall?.toLowerCase().includes('enabled')
  const wdOk = status?.defender?.toLowerCase() === 'true'

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      {/* Bot status bar */}
      <div className={`shrink-0 rounded-xl border px-4 py-2.5 flex items-center gap-3 text-sm ${botRunning ? 'border-emerald-800/40 bg-emerald-950/20' : 'border-slate-800 bg-slate-900/30'}`}>
        <span className={`w-2 h-2 rounded-full ${botRunning ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
        <span className={botRunning ? 'text-emerald-400' : 'text-red-400'}>
          {botRunning ? 'Telegram Bot 已連線 — @svs_pve_bot' : 'Bot 未連線 — 請在 Settings 填入 Bot Token'}
        </span>
        <div className="flex-1" />
        {lastRefresh && <span className="text-[10px] text-slate-700">更新: {lastRefresh}</span>}
        <button onClick={fetchMessages} className="text-[10px] text-slate-600 hover:text-slate-400 border border-slate-800 rounded px-2 py-1 transition-colors">
          重整
        </button>
      </div>

      {/* Teammate status cards */}
      {status ? (
        <div className="grid grid-cols-4 gap-3 shrink-0">
          <StatBadge label="IP" value={status.ip || '—'} />
          <StatBadge label="主機名" value={status.hostname || '—'} />
          <StatBadge label="防火牆" value={status.firewall || '—'} ok={fwOk} />
          <StatBadge label="Defender" value={status.defender || '—'} ok={wdOk} />
        </div>
      ) : (
        <div className="shrink-0 grid grid-cols-4 gap-3">
          {['IP', '主機名', '防火牆', 'Defender'].map(l => (
            <div key={l} className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3">
              <div className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">{l}</div>
              <div className="text-sm text-slate-700 font-mono">等待連線…</div>
            </div>
          ))}
        </div>
      )}

      {/* Open ports display */}
      {status?.open_ports && status.open_ports !== 'none' && (
        <div className="shrink-0 bg-orange-950/20 border border-orange-900/40 rounded-xl px-4 py-2.5">
          <div className="text-[10px] text-orange-600 uppercase tracking-wider mb-1">⚠ 隊友開放端口</div>
          <div className="text-[11px] font-mono text-orange-300 truncate">{status.open_ports}</div>
        </div>
      )}

      {/* Action buttons */}
      <div className="grid grid-cols-5 gap-3 shrink-0">
        {WIN_ACTIONS.map(a => (
          <button
            key={a.id}
            onClick={() => sendCmd(a.cmd, a.id)}
            disabled={!botRunning || loading !== null}
            className={`rounded-xl border bg-slate-900/40 px-3 py-3 flex flex-col items-center gap-2 text-center transition-all disabled:opacity-30 disabled:cursor-not-allowed ${a.color} ${loading === a.id ? 'opacity-50' : ''}`}
          >
            <span className="text-2xl">{loading === a.id ? '⏳' : a.icon}</span>
            <span className="text-[11px] font-medium text-slate-200 leading-tight">{a.label}</span>
            <span className="text-[9px] text-slate-600 leading-tight">{a.desc}</span>
          </button>
        ))}
      </div>

      {/* Setup guide if bot not running */}
      {!botRunning && (
        <div className="shrink-0 bg-slate-900/60 border border-slate-700/40 rounded-xl px-4 py-3 text-xs text-slate-500 space-y-1">
          <div className="text-slate-400 font-medium mb-2">📋 隊友設定步驟（Windows 11）</div>
          <div>1. 安裝 Python 3 → <span className="text-cyan-600">python.org</span></div>
          <div>2. 執行：<code className="bg-slate-800 px-1 rounded text-slate-300">pip install python-telegram-bot==13.15</code></div>
          <div>3. 打開 <code className="bg-slate-800 px-1 rounded text-slate-300">agent/blue-team-agent.py</code>，填入 BOT_TOKEN 和 CHAT_ID</div>
          <div>4. 執行：<code className="bg-slate-800 px-1 rounded text-slate-300">python blue-team-agent.py</code></div>
          <div>5. 在本面板 Settings 填入相同 Bot Token → 即可遠端控制</div>
        </div>
      )}

      {/* Bot message feed */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="text-[10px] text-slate-600 uppercase tracking-wider mb-2 shrink-0">Bot 訊息記錄</div>
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
          {messages.length === 0 ? (
            <div className="text-[11px] text-slate-700 text-center py-8">尚無 Bot 訊息</div>
          ) : (
            messages.map(m => (
              <div key={m.id} className="bg-slate-900/40 border border-slate-800 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] text-cyan-600 font-mono">{m.from}</span>
                  <span className="text-[9px] text-slate-700">{new Date(m.ts).toLocaleTimeString()}</span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono whitespace-pre-wrap break-all">{m.text.slice(0, 200)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
