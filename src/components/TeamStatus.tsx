import { useState, useEffect } from 'react'

interface TeammateData {
  online: boolean
  lastSeen: number | null
  data: {
    firewall?: boolean
    defender?: boolean
    stealth?: boolean
    openPorts?: number
    connections?: number
    suspicious?: string[]
    hostname?: string
    ts?: string
  }
}

interface TeammatesState {
  mac: TeammateData
  win: TeammateData
}

export default function TeamStatus() {
  const [team, setTeam] = useState<TeammatesState | null>(null)

  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch('/api/teammates')
        setTeam(await r.json())
      } catch {}
    }
    poll()
    const t = setInterval(poll, 10000)
    return () => clearInterval(t)
  }, [])

  // Mac auto-heartbeat
  useEffect(() => {
    const beat = async () => {
      try {
        await fetch('/api/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            os: 'mac',
            firewall: true,
            hostname: 'Mac-BlueTeam',
            connections: 0,
            ts: new Date().toISOString(),
          }),
        })
      } catch {}
    }
    beat()
    const t = setInterval(beat, 30000)
    return () => clearInterval(t)
  }, [])

  if (!team) return null

  const ago = (ts: number | null) => {
    if (!ts) return '從未'
    const s = Math.floor((Date.now() - ts) / 1000)
    if (s < 10) return '剛剛'
    if (s < 60) return `${s}s 前`
    if (s < 3600) return `${Math.floor(s / 60)}m 前`
    return `${Math.floor(s / 3600)}h 前`
  }

  const nodes: { key: 'mac' | 'win'; icon: string; label: string; osIcon: string }[] = [
    { key: 'mac', icon: '🍎', label: 'Mac 主控', osIcon: '' },
    { key: 'win', icon: '🪟', label: 'Win 隊友', osIcon: '' },
  ]

  return (
    <div className="flex items-stretch gap-3">
      {nodes.map(n => {
        const t = team[n.key]
        const d = t.data
        const on = t.online

        return (
          <div
            key={n.key}
            className={`relative flex-1 rounded-2xl border p-4 transition-all ${
              on
                ? 'bg-gradient-to-br from-emerald-950/40 to-cyan-950/30 border-emerald-700/50 shadow-lg shadow-emerald-900/20'
                : 'bg-slate-900/40 border-slate-800/50'
            }`}
          >
            {/* Pulse indicator */}
            <div className="absolute top-3 right-3">
              <span className={`relative flex h-3.5 w-3.5`}>
                {on && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />}
                <span className={`relative inline-flex rounded-full h-3.5 w-3.5 ${on ? 'bg-emerald-400' : 'bg-slate-700'}`} />
              </span>
            </div>

            {/* Header */}
            <div className="flex items-center gap-2.5 mb-3">
              <span className="text-2xl">{n.icon}</span>
              <div>
                <div className="text-sm font-bold text-slate-200">{n.label}</div>
                <div className={`text-[10px] font-mono ${on ? 'text-emerald-400' : 'text-slate-600'}`}>
                  {on ? '● 在線' : '○ 離線'} · {ago(t.lastSeen)}
                </div>
              </div>
            </div>

            {/* Protection Status */}
            <div className="space-y-1.5">
              {n.key === 'mac' && (
                <>
                  <StatusRow label="防火牆" ok={d.firewall} />
                  <StatusRow label="隱身模式" ok={d.stealth} />
                </>
              )}
              {n.key === 'win' && (
                <>
                  <StatusRow label="Defender" ok={d.defender} />
                  <StatusRow label="防火牆" ok={d.firewall} />
                </>
              )}
              {d.openPorts !== undefined && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">開放端口</span>
                  <span className={`font-mono ${(d.openPorts || 0) > 10 ? 'text-orange-400' : 'text-slate-400'}`}>
                    {d.openPorts}
                  </span>
                </div>
              )}
              {d.connections !== undefined && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">連線數</span>
                  <span className="font-mono text-slate-400">{d.connections}</span>
                </div>
              )}
              {d.suspicious && d.suspicious.length > 0 && (
                <div className="mt-2 px-2 py-1.5 rounded-lg bg-red-950/40 border border-red-900/40">
                  <div className="text-[10px] text-red-400 font-semibold mb-1">⚠ 可疑項目</div>
                  {d.suspicious.slice(0, 3).map((s, i) => (
                    <div key={i} className="text-[10px] text-red-300/80 truncate">{s}</div>
                  ))}
                </div>
              )}
              {!on && !t.lastSeen && (
                <div className="text-[10px] text-slate-600 mt-2 italic">
                  等待心跳回報…
                </div>
              )}
            </div>

            {/* Hostname */}
            {d.hostname && (
              <div className="mt-2 text-[9px] font-mono text-slate-600 truncate">{d.hostname}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function StatusRow({ label, ok }: { label: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-slate-500">{label}</span>
      <span className={`font-semibold ${ok === true ? 'text-emerald-400' : ok === false ? 'text-red-400' : 'text-slate-600'}`}>
        {ok === true ? '✅ 啟用' : ok === false ? '❌ 關閉' : '—'}
      </span>
    </div>
  )
}
