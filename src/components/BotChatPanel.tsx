import { useState, useEffect, useRef, useCallback } from 'react'

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Group { id: string; name: string; type: string; messageCount: number; lastActivity: string | null; isMain: boolean }
interface FeedMessage { id: number; from: string; fromId?: number; username?: string; text: string; ts: string; replyTo?: number | null; groupId: string; groupName: string; isMain: boolean }
interface BotInfo { key: string; name: string; role: string; desc: string; running: boolean }
interface Alert { id: number; level: string; category: string; title: string; detail: string; ts: string }
interface MonitorStatus { running: boolean; totalAlerts: number; recentCritical: number; recentHigh: number; ddosRisk: string }
interface VPano {
  ts: string; hostname: string; uptime: string
  system: { mem: { total: number; used: number; available: number }; disk: { total: number; used: number; pct: string }; load: Record<string, number>; cpuCores: number }
  processes: { user: string; pid: string; cpu: number; mem: number; cmd: string }[]
  services: { name: string; status: string; sub: string }[]
  containers: { name: string; status: string; ports: string }[]
  security: { ufwActive: boolean; ufwRules: number; f2bActive: boolean; f2bJails: number }
  network: { ports: { port: string; addr: string; proc: string; public: boolean }[]; connCount: number }
  projects: Record<string, { deployed: boolean; path: string; nginx?: boolean; port?: number }>
  monitor: MonitorStatus; alerts: Alert[]; bots: BotInfo[]; groups: Group[]
}


interface DefenderStatus {
  running: boolean
  stats: { totalBlocked: number; totalScans: number; totalBrute: number; bannedToday: number; sessionStart: string }
  totalThreats: number; activeThreats24h: number; totalBanned: number; whitelist: number
  topAttackers: ThreatEntry[]
}
interface ThreatEntry {
  ip: string; count: number; firstSeen: string; lastSeen: string
  types: string[]; usernames: string[]; banned: boolean; banTime: string | null
  details: string[]
}

type View = 'feed' | 'group' | 'bots' | 'alerts' | 'vps' | 'battle'
const fmtBytes = (b: number) => b < 1048576 ? (b/1024).toFixed(0)+'K' : b < 1073741824 ? (b/1048576).toFixed(1)+'M' : (b/1073741824).toFixed(1)+'G'

export default function BotChatPanel() {
  const [view, setView] = useState<View>('feed')
  const [pano, setPano] = useState<VPano | null>(null)
  const [feed, setFeed] = useState<FeedMessage[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [groupMessages, setGroupMessages] = useState<any[]>([])
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [bots, setBots] = useState<BotInfo[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [monitorStatus, setMonitorStatus] = useState<MonitorStatus | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [selectedBot, setSelectedBot] = useState<string>('win')
  const [botChatInput, setBotChatInput] = useState('')
  const [replyTarget, setReplyTarget] = useState<FeedMessage | null>(null)
  const msgEndRef = useRef<HTMLDivElement>(null)
  const [defStatus, setDefStatus] = useState<DefenderStatus | null>(null)
  const [threatList, setThreatList] = useState<ThreatEntry[]>([])
  const [battleFilter, setBattleFilter] = useState<'all' | 'banned' | 'active'>('all')

  const fetchPano = useCallback(async () => {
    try {
      const r = await fetch('/api/vps/panorama')
      const d: VPano = await r.json()
      setPano(d); setMonitorStatus(d.monitor); setAlerts(d.alerts || []); setGroups(d.groups || []); setBots(d.bots || [])
    } catch {}
  }, [])

  const fetchFeed = useCallback(async () => {
    try {
      const r = await fetch('/api/bot/feed?limit=80')
      const d = await r.json()
      setFeed(d.feed || []); if (d.groups?.length) setGroups(d.groups)
    } catch {}
  }, [])

  const fetchGroupMsgs = useCallback(async () => {
    if (!selectedGroup) return
    try { const r = await fetch(`/api/bot/messages?groupId=${selectedGroup}&limit=80`); const d = await r.json(); setGroupMessages(d.messages || []) } catch {}
  }, [selectedGroup])

  const fetchAlertsFull = useCallback(async () => {
    try { const r = await fetch('/api/monitor/alerts?limit=30'); const d = await r.json(); setAlerts(d.alerts || []) } catch {}
  }, [])

  const fetchDefender = useCallback(async () => {
    try {
      const [sr, tr] = await Promise.all([fetch('/api/defender/status'), fetch('/api/defender/threats?limit=80')])
      const sd: DefenderStatus = await sr.json()
      const td = await tr.json()
      setDefStatus(sd); setThreatList(td.threats || [])
    } catch {}
  }, [])

  useEffect(() => {
    fetchPano(); fetchFeed()
    const t1 = setInterval(fetchPano, 15000)
    const t2 = setInterval(fetchFeed, 8000)
    return () => { clearInterval(t1); clearInterval(t2) }
  }, [fetchPano, fetchFeed])

  useEffect(() => {
    if (view === 'group' && selectedGroup) { fetchGroupMsgs(); const t = setInterval(fetchGroupMsgs, 5000); return () => clearInterval(t) }
  }, [view, selectedGroup, fetchGroupMsgs])

  useEffect(() => { if (view === 'alerts') fetchAlertsFull() }, [view, fetchAlertsFull])
  useEffect(() => {
    if (view === 'battle') { fetchDefender(); const t = setInterval(fetchDefender, 8000); return () => clearInterval(t) }
  }, [view, fetchDefender])
  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [feed, groupMessages])

  const sendToGroup = async (gid: string) => {
    if (!input.trim() || sending) return
    setSending(true)
    try {
      await fetch('/api/bot/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groupId: gid, text: input.trim() }) })
      setInput(''); setReplyTarget(null); setTimeout(() => { fetchFeed(); fetchGroupMsgs() }, 1000)
    } catch {}
    setSending(false)
  }

  const chatWithBot = async () => {
    if (!botChatInput.trim() || sending) return
    setSending(true)
    try {
      const ep = selectedBot === 'win' ? '/api/bot/chat' : '/api/bot/chat-any'
      const body = selectedBot === 'win' ? { message: botChatInput.trim(), user: 'panel' } : { bot: selectedBot, message: botChatInput.trim(), user: 'panel' }
      await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      setBotChatInput('')
    } catch {}
    setSending(false)
  }

  const macBotSend = async () => {
    if (!input.trim() || sending) return
    setSending(true)
    try { await fetch('/api/bot/mac-send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: input.trim() }) }); setInput('') } catch {}
    setSending(false)
  }

  const broadcastReport = async () => {
    try { await fetch('/api/defender/broadcast', { method: 'POST' }) } catch {}
  }

  const manualBan = async (ip: string) => {
    if (!confirm('\u5c01\u7981 ' + ip + ' ?')) return
    try { await fetch('/api/defender/ban', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip, reason: 'Manual ban from panel' }) }); fetchDefender() } catch {}
  }

  const AC: Record<string, string> = {
    CRITICAL: 'border-red-800 bg-red-950/50 text-red-400',
    HIGH: 'border-orange-800 bg-orange-950/40 text-orange-400',
    MEDIUM: 'border-yellow-800 bg-yellow-950/30 text-yellow-400',
    INFO: 'border-slate-700 bg-slate-900/40 text-slate-400',
  }

  const viewBtns: { id: View; icon: string; label: string }[] = [
    { id: 'feed', icon: '\ud83d\udce1', label: '\u5168\u666f\u7e3d\u89bd' },
    { id: 'group', icon: '\ud83d\udcac', label: '\u7fa4\u7d44\u76e3\u63a7' },
    { id: 'bots', icon: '\ud83e\udd16', label: 'Bot\u4ea4\u4e92' },
    { id: 'alerts', icon: '\ud83d\udea8', label: '\u5b89\u5168\u8b66\u5831' },
    { id: 'vps', icon: '\ud83d\udee1', label: 'VPS\u7a3d\u67e5' },
    { id: 'battle', icon: '\u2694\ufe0f', label: '\u653b\u9632\u6230\u6cc1' },
  ]

  const s = pano?.system
  const memPct = s ? Math.round((s.mem.used / s.mem.total) * 100) : 0

  return (
    <div className="h-full flex flex-col overflow-hidden gap-2">
      {/* Top nav */}
      <div className="shrink-0 flex items-center gap-1.5 flex-wrap">
        {viewBtns.map(v => (
          <button key={v.id} onClick={() => setView(v.id)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all border ${view === v.id ? 'bg-cyan-950/50 border-cyan-800/60 text-cyan-300' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'}`}
          >{v.icon} {v.label}</button>
        ))}
        <div className="flex-1" />
        {monitorStatus && (
          <div className="flex items-center gap-2 text-[9px] font-mono">
            <span className={`flex items-center gap-1 ${monitorStatus.running ? 'text-emerald-400' : 'text-red-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${monitorStatus.running ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} /> \u76e3\u63a7
            </span>
            <span className={monitorStatus.ddosRisk === 'HIGH' ? 'text-red-400' : monitorStatus.ddosRisk === 'MEDIUM' ? 'text-yellow-400' : 'text-slate-500'}>
              DDoS:{monitorStatus.ddosRisk}
            </span>
            {monitorStatus.totalAlerts > 0 && <span className="text-orange-400">\u8b66\u5831:{monitorStatus.totalAlerts}</span>}
          </div>
        )}
      </div>

      <div className="flex-1 flex gap-2 min-h-0 overflow-hidden">
        {/* FEED / PANORAMA */}
        {view === 'feed' && (
          <div className="flex-1 flex flex-col overflow-hidden gap-2">
            {pano && s && (
              <div className="shrink-0 space-y-2">
                <div className="grid grid-cols-6 gap-2">
                  <Stat label="\u4e3b\u6a5f" val={pano.hostname} />
                  <Stat label="\u904b\u884c" val={pano.uptime.replace('up ', '')} />
                  <Stat label="CPU" val={`${(s.load['1m'] || 0).toFixed(1)}/${s.cpuCores}\u6838`} c={(s.load['1m'] || 0) > s.cpuCores ? 'text-red-400' : (s.load['1m'] || 0) > s.cpuCores * 0.7 ? 'text-yellow-400' : 'text-emerald-400'} />
                  <Stat label="\u8a18\u61b6\u9ad4" val={`${memPct}% ${fmtBytes(s.mem.used)}`} c={memPct > 85 ? 'text-red-400' : memPct > 60 ? 'text-yellow-400' : 'text-emerald-400'} />
                  <Stat label="\u78c1\u789f" val={s.disk.pct} c={parseInt(s.disk.pct) > 80 ? 'text-red-400' : 'text-emerald-400'} />
                  <Stat label="\u9023\u7dda" val={String(pano.network.connCount)} c={pano.network.connCount > 50 ? 'text-orange-400' : 'text-slate-300'} />
                </div>
                <div className="grid grid-cols-6 gap-2">
                  <Stat label="UFW" val={pano.security.ufwActive ? 'ON' : 'OFF'} c={pano.security.ufwActive ? 'text-emerald-400' : 'text-red-400'} />
                  <Stat label="Fail2Ban" val={pano.security.f2bActive ? `ON(${pano.security.f2bJails})` : 'OFF'} c={pano.security.f2bActive ? 'text-emerald-400' : 'text-red-400'} />
                  <Stat label="\u516c\u958b\u7aef\u53e3" val={String(pano.network.ports.filter(p => p.public).length)} c={pano.network.ports.filter(p => p.public).length > 3 ? 'text-orange-400' : 'text-slate-300'} />
                  <Stat label="BOG" val={pano.projects.bog?.deployed ? 'LIVE' : 'DOWN'} c={pano.projects.bog?.deployed ? 'text-emerald-400' : 'text-red-400'} />
                  <Stat label="\u7fa4\u7d44" val={String(pano.groups.length)} />
                  <Stat label="Bot" val={`${pano.bots.filter(b => b.running).length}/${pano.bots.length}`} c={pano.bots.every(b => b.running) ? 'text-emerald-400' : 'text-orange-400'} />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 rounded-lg border border-slate-800 bg-slate-900/30 px-3 py-1.5">
                    <div className="text-[7px] text-slate-600 mb-1">\u670d\u52d9 ({pano.services.length})</div>
                    <div className="flex flex-wrap gap-1">
                      {pano.services.slice(0, 20).map(sv => (
                        <span key={sv.name} className="text-[7px] px-1 py-0.5 rounded bg-slate-800/60 text-slate-400">{sv.name}</span>
                      ))}
                    </div>
                  </div>
                  <div className="w-48 shrink-0 rounded-lg border border-slate-800 bg-slate-900/30 px-3 py-1.5">
                    <div className="text-[7px] text-slate-600 mb-1">\u516c\u958b\u7aef\u53e3</div>
                    <div className="flex flex-wrap gap-1">
                      {pano.network.ports.filter(p => p.public).map(p => (
                        <span key={p.port} className="text-[7px] px-1 py-0.5 rounded bg-orange-950/30 border border-orange-900/30 text-orange-400">{p.port}/{p.proc}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {!pano && <div className="text-center py-8 text-[9px] text-slate-600">\u8f09\u5165 VPS \u5168\u666f\u8cc7\u6599...</div>}

            {/* Feed + alerts row */}
            <div className="flex-1 flex gap-2 min-h-0 overflow-hidden">
              {/* Feed */}
              <div className="flex-1 flex flex-col border border-slate-800 rounded-xl bg-slate-900/20 overflow-hidden">
                <div className="shrink-0 px-3 py-1.5 border-b border-slate-800 bg-slate-900/40 flex items-center gap-2">
                  <span className="text-[9px] font-medium text-slate-400">\u5168\u91cf\u52d5\u614b\u6d41</span>
                  <span className="text-[7px] text-slate-600">OECE\u53bb\u91cd\u00b7\u5176\u4ed6\u7fa4\u5168\u91cf</span>
                  <div className="flex-1" />
                  <button onClick={fetchFeed} className="text-[7px] px-1.5 py-0.5 border border-slate-700 rounded text-slate-600 hover:text-cyan-400">\u5237\u65b0</button>
                </div>
                <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
                  {feed.length === 0 ? (
                    <div className="text-center py-4 text-[8px] text-slate-600">Bot\u7fa4\u7d44\u8a0a\u606f\u5c07\u5373\u6642\u986f\u793a<br />Win Bot \u76e3\u63a7\u4e2d...</div>
                  ) : feed.map((m, i) => (
                    <div key={`${m.groupId}-${m.id}-${i}`} className="flex gap-1 group">
                      <div className={`flex-1 rounded-lg px-2 py-1.5 border ${m.isMain ? 'bg-amber-950/20 border-amber-900/30' : 'bg-slate-800/40 border-slate-700/30'}`}>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`text-[7px] px-1 py-0.5 rounded ${m.isMain ? 'bg-amber-900/40 text-amber-400' : 'bg-cyan-900/30 text-cyan-400'}`}>{m.groupName}</span>
                          <span className="text-[8px] font-medium text-slate-300">{m.from}</span>
                          <div className="flex-1" />
                          <span className="text-[6px] text-slate-700">{new Date(m.ts).toLocaleTimeString('zh-TW')}</span>
                        </div>
                        <div className="text-[9px] text-slate-300 whitespace-pre-wrap break-words line-clamp-3">{m.text}</div>
                      </div>
                      {!m.isMain && (
                        <button onClick={() => { setReplyTarget(m); setSelectedGroup(m.groupId) }}
                          className="opacity-0 group-hover:opacity-100 self-center text-[7px] px-1 py-0.5 border border-slate-700 rounded text-slate-600 hover:text-cyan-400 shrink-0"
                        >\u21a9</button>
                      )}
                    </div>
                  ))}
                  <div ref={msgEndRef} />
                </div>
                {/* Reply bar */}
                <div className="shrink-0 px-3 py-2 border-t border-slate-800 bg-slate-900/40">
                  {replyTarget && (
                    <div className="flex items-center gap-1 mb-1.5 px-2 py-1 rounded bg-slate-800/50 text-[7px]">
                      <span className="text-cyan-400">\u21a9[{replyTarget.groupName}]{replyTarget.from}</span>
                      <span className="text-slate-600 truncate flex-1">{replyTarget.text?.slice(0, 30)}</span>
                      <button onClick={() => setReplyTarget(null)} className="text-slate-500 hover:text-red-400">\u2715</button>
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <select value={selectedGroup || ''} onChange={e => setSelectedGroup(e.target.value || null)}
                      className="bg-slate-800/60 border border-slate-700 rounded-lg px-1.5 py-1.5 text-[8px] text-slate-400 w-24 shrink-0"
                    ><option value="">\u76ee\u6a19\u7fa4</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
                    <input value={input} onChange={e => setInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && selectedGroup) sendToGroup(selectedGroup) }}
                      placeholder="Bot\u4ee3\u767c..."
                      className="flex-1 bg-slate-800/60 border border-slate-700 rounded-lg px-2 py-1.5 text-[9px] text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-700"
                    />
                    <button onClick={() => { if (selectedGroup) sendToGroup(selectedGroup) }} disabled={sending || !input.trim() || !selectedGroup}
                      className="px-2 py-1.5 rounded-lg text-[8px] bg-cyan-950/50 border border-cyan-800/60 text-cyan-400 disabled:opacity-30"
                    >SD</button>
                    <button onClick={macBotSend} disabled={sending || !input.trim()}
                      className="px-2 py-1.5 rounded-lg text-[8px] bg-emerald-950/50 border border-emerald-800/60 text-emerald-400 disabled:opacity-30"
                    >Chou</button>
                  </div>
                </div>
              </div>

              {/* Right column */}
              <div className="w-56 shrink-0 flex flex-col gap-2 overflow-hidden">
                <div className="flex-1 flex flex-col border border-slate-800 rounded-xl bg-slate-900/30 overflow-hidden min-h-0">
                  <div className="shrink-0 px-2 py-1.5 border-b border-slate-800 text-[8px] text-slate-500 font-medium flex items-center gap-1">
                    \ud83d\udea8 \u8b66\u5831
                    {alerts.length > 0 && <span className="px-1 rounded bg-red-950/50 text-red-400">{alerts.length}</span>}
                  </div>
                  <div className="flex-1 overflow-y-auto p-1 space-y-1">
                    {alerts.length === 0
                      ? <div className="text-center py-3 text-[7px] text-slate-600">\u66ab\u7121</div>
                      : alerts.map(a => (
                        <div key={a.id} className={`px-2 py-1 rounded border text-[7px] ${AC[a.level] || ''}`}>
                          <div className="font-medium">{a.title}</div>
                          <div className="opacity-60 line-clamp-2">{a.detail}</div>
                        </div>
                      ))
                    }
                  </div>
                </div>
                {pano && (
                  <div className="h-32 shrink-0 flex flex-col border border-slate-800 rounded-xl bg-slate-900/30 overflow-hidden">
                    <div className="px-2 py-1.5 border-b border-slate-800 text-[8px] text-slate-500 font-medium">Top\u9032\u7a0b</div>
                    <div className="flex-1 overflow-y-auto p-1 text-[7px] font-mono">
                      {pano.processes.slice(0, 8).map((p, i) => (
                        <div key={i} className="flex gap-1.5 px-1 py-0.5 hover:bg-slate-800/30 rounded">
                          <span className="w-7 text-right text-slate-600">{p.mem.toFixed(1)}%</span>
                          <span className="w-7 text-right text-cyan-500">{p.cpu.toFixed(1)}%</span>
                          <span className="text-slate-400 truncate flex-1">{p.cmd}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* GROUP VIEW */}
        {view === 'group' && (
          <>
            <div className="w-44 shrink-0 flex flex-col border border-slate-800 rounded-xl bg-slate-900/30 overflow-hidden">
              <div className="px-2 py-1.5 border-b border-slate-800 text-[8px] text-slate-500 font-medium">\u7fa4\u7d44</div>
              <div className="flex-1 overflow-y-auto p-1 space-y-0.5">
                {groups.length === 0
                  ? <div className="text-center py-4 text-[7px] text-slate-600">\u7b49\u5f85...</div>
                  : groups.map(g => (
                    <button key={g.id} onClick={() => setSelectedGroup(g.id)}
                      className={`w-full text-left px-2 py-1.5 rounded-lg text-[8px] ${selectedGroup === g.id ? 'bg-cyan-950/50 border border-cyan-800/60 text-cyan-300' : 'hover:bg-slate-800/50 text-slate-400 border border-transparent'}`}
                    >{g.isMain ? '\u2b50 ' : '\ud83d\udcac '}{g.name} <span className="text-[6px] text-slate-600">({g.messageCount})</span></button>
                  ))
                }
              </div>
            </div>
            <div className="flex-1 flex flex-col border border-slate-800 rounded-xl bg-slate-900/20 overflow-hidden">
              <div className="shrink-0 px-3 py-2 border-b border-slate-800 bg-slate-900/40 flex items-center gap-2">
                <span className="text-[9px] font-medium text-slate-300">{groups.find(g => g.id === selectedGroup)?.name || '\u9078\u64c7\u7fa4\u7d44'}</span>
                {selectedGroup && groups.find(g => g.id === selectedGroup)?.isMain && <span className="text-[7px] px-1 py-0.5 rounded bg-amber-900/30 text-amber-400">OECE</span>}
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
                {!selectedGroup ? <div className="text-center py-6 text-[8px] text-slate-600">\u2190 \u9078\u64c7\u7fa4\u7d44</div>
                  : groupMessages.length === 0 ? <div className="text-center py-6 text-[8px] text-slate-600">\u66ab\u7121\u8a0a\u606f</div>
                  : groupMessages.map((m: any, i: number) => (
                    <div key={`gm-${m.id}-${i}`} className={`flex gap-1.5 ${m.from === 'SD (\u9762\u677f)' ? 'flex-row-reverse' : ''}`}>
                      <div className={`max-w-[80%] rounded-lg px-2.5 py-1.5 ${m.from === 'SD (\u9762\u677f)' ? 'bg-cyan-950/40 border border-cyan-800/40' : 'bg-slate-800/50 border border-slate-700/30'}`}>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[8px] font-medium text-cyan-400">{m.from}</span>
                          <span className="text-[6px] text-slate-700">{new Date(m.ts).toLocaleTimeString('zh-TW')}</span>
                        </div>
                        <div className="text-[9px] text-slate-300 whitespace-pre-wrap break-words">{m.text}</div>
                      </div>
                    </div>
                  ))
                }
                <div ref={msgEndRef} />
              </div>
              {selectedGroup && (
                <div className="shrink-0 px-3 py-2 border-t border-slate-800 bg-slate-900/40 flex gap-1.5">
                  <input value={input} onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') sendToGroup(selectedGroup) }}
                    placeholder="SD Bot \u4ee3\u767c..."
                    className="flex-1 bg-slate-800/60 border border-slate-700 rounded-lg px-2 py-1.5 text-[9px] text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-700"
                  />
                  <button onClick={() => sendToGroup(selectedGroup)} disabled={sending || !input.trim()}
                    className="px-2 py-1.5 rounded-lg text-[8px] bg-cyan-950/50 border border-cyan-800/60 text-cyan-400 disabled:opacity-30"
                  >\u767c\u9001</button>
                </div>
              )}
            </div>
          </>
        )}

        {/* BOTS VIEW */}
        {view === 'bots' && (
          <>
            <div className="w-44 shrink-0 flex flex-col border border-slate-800 rounded-xl bg-slate-900/30 overflow-hidden">
              <div className="px-2 py-1.5 border-b border-slate-800 text-[8px] text-slate-500 font-medium">Bot</div>
              <div className="flex-1 overflow-y-auto p-1 space-y-0.5">
                {bots.map(b => (
                  <button key={b.key} onClick={() => setSelectedBot(b.key)}
                    className={`w-full text-left px-2 py-1.5 rounded-lg text-[8px] flex items-center gap-1.5 ${selectedBot === b.key ? 'bg-violet-950/50 border border-violet-800/60 text-violet-300' : 'hover:bg-slate-800/50 text-slate-400 border border-transparent'}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${b.running ? 'bg-emerald-400' : 'bg-slate-700'}`} />
                    <div><div>{b.name}</div><div className="text-[6px] text-slate-600 truncate">{b.desc}</div></div>
                  </button>
                ))}
              </div>
              <div className="border-t border-slate-800 p-1.5 text-[7px] text-slate-600">Mac:Chou \u00b7 Win:SD</div>
            </div>
            <div className="flex-1 flex flex-col border border-slate-800 rounded-xl bg-slate-900/20 overflow-hidden">
              <div className="shrink-0 px-3 py-2 border-b border-slate-800 bg-slate-900/40 text-[9px] text-slate-300 font-medium">
                {bots.find(b => b.key === selectedBot)?.name || selectedBot}
                <span className="text-[7px] text-slate-600 ml-1">{bots.find(b => b.key === selectedBot)?.desc}</span>
              </div>
              <BotChatMessages botKey={selectedBot} />
              <div className="shrink-0 px-3 py-2 border-t border-slate-800 bg-slate-900/40 flex gap-1.5">
                <input value={botChatInput} onChange={e => setBotChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') chatWithBot() }}
                  placeholder={`\u8207${bots.find(b => b.key === selectedBot)?.name || 'Bot'}\u5c0d\u8a71...`}
                  className="flex-1 bg-slate-800/60 border border-slate-700 rounded-lg px-2 py-1.5 text-[9px] text-slate-300 placeholder-slate-600 focus:outline-none focus:border-violet-700"
                />
                <button onClick={chatWithBot} disabled={sending || !botChatInput.trim()}
                  className="px-2 py-1.5 rounded-lg text-[8px] bg-violet-950/50 border border-violet-800/60 text-violet-400 disabled:opacity-30"
                >\u767c\u9001</button>
              </div>
            </div>
          </>
        )}

        {/* ALERTS VIEW */}
        {view === 'alerts' && (
          <div className="flex-1 flex flex-col border border-slate-800 rounded-xl bg-slate-900/20 overflow-hidden">
            <div className="shrink-0 px-3 py-2 border-b border-slate-800 bg-slate-900/40 flex items-center gap-2">
              <span className="text-[9px] font-medium text-slate-300">\u5b89\u5168\u76e3\u63a7\u4e2d\u5fc3</span>
              <span className="text-[7px] text-slate-600">SSH\u00b7Nginx\u00b7F2B\u00b7DDoS\u00b7TG\u64ad\u5831</span>
              <div className="flex-1" />
              {monitorStatus?.ddosRisk === 'HIGH' && (
                <button onClick={() => fetch('/api/monitor/ddos-shield', { method: 'POST' }).then(fetchAlertsFull)}
                  className="px-2 py-1 rounded text-[7px] bg-red-950/50 border border-red-800/60 text-red-400 animate-pulse"
                >\ud83d\udee1 DO\u96f2\u76fe</button>
              )}
              <button onClick={fetchAlertsFull} className="text-[7px] px-1.5 py-0.5 border border-slate-700 rounded text-slate-600 hover:text-cyan-400">\ud83d\udd04</button>
            </div>
            {monitorStatus && (
              <div className="shrink-0 grid grid-cols-4 gap-2 px-3 py-2 border-b border-slate-800">
                <Stat label="\u7e3d\u8b66\u5831" val={String(monitorStatus.totalAlerts)} />
                <Stat label="\u56b4\u91cd" val={String(monitorStatus.recentCritical)} c={monitorStatus.recentCritical > 0 ? 'text-red-400' : undefined} />
                <Stat label="\u9ad8\u5371" val={String(monitorStatus.recentHigh)} c={monitorStatus.recentHigh > 0 ? 'text-orange-400' : undefined} />
                <Stat label="DDoS" val={monitorStatus.ddosRisk} c={monitorStatus.ddosRisk === 'HIGH' ? 'text-red-400' : monitorStatus.ddosRisk === 'MEDIUM' ? 'text-yellow-400' : 'text-emerald-400'} />
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {alerts.map(a => (
                <div key={a.id} className={`rounded-lg border px-2.5 py-2 ${AC[a.level] || ''}`}>
                  <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-[7px] font-mono opacity-70">[{a.category}]</span>
                    <span className="text-[9px] font-medium">{a.title}</span>
                    <div className="flex-1" />
                    <span className="text-[6px] text-slate-600">{new Date(a.ts).toLocaleString('zh-TW')}</span>
                  </div>
                  <p className="text-[8px] opacity-70 whitespace-pre-wrap">{a.detail}</p>
                </div>
              ))}
            </div>
          </div>
        )}


        {/* BATTLE VIEW */}
        {view === 'battle' && (
          <div className="flex-1 flex flex-col overflow-hidden gap-2">
            {/* Battle stats header */}
            {defStatus && (
              <div className="shrink-0 space-y-2">
                <div className="grid grid-cols-7 gap-1.5">
                  <div className="col-span-2 bg-gradient-to-br from-red-950/60 to-slate-900/80 border border-red-800/40 rounded-xl px-3 py-2 text-center">
                    <div className="text-[7px] text-red-400/70">\u5df2\u6bbc\u6ec5\u6575\u65b9</div>
                    <div className="text-xl font-mono font-black text-red-400">{defStatus.totalBanned}</div>
                    <div className="text-[7px] text-slate-600">\u4eca\u65e5 +{defStatus.stats.bannedToday}</div>
                  </div>
                  <Stat label="\u5075\u6e2c\u6b21\u6578" val={String(defStatus.stats.totalScans)} c="text-amber-400" />
                  <Stat label="\u653b\u64ca\u651d\u622a" val={String(defStatus.stats.totalBlocked)} c="text-red-400" />
                  <Stat label="24h\u5a01\u8105" val={String(defStatus.activeThreats24h)} c={defStatus.activeThreats24h > 10 ? 'text-orange-400' : 'text-slate-300'} />
                  <Stat label="\u5a01\u8105\u7e3d\u6578" val={String(defStatus.totalThreats)} />
                  <Stat label="\u767d\u540d\u55ae" val={String(defStatus.whitelist)} c="text-emerald-400" />
                </div>
                {/* Attack type breakdown bar */}
                <div className="flex gap-1 items-center px-1">
                  <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden flex">
                    {(() => {
                      const types: Record<string, number> = {}
                      for (const t of threatList) for (const tp of t.types) types[tp] = (types[tp] || 0) + t.count
                      const total = Object.values(types).reduce((a, b) => a + b, 0) || 1
                      const colors: Record<string, string> = { ssh_brute: 'bg-red-500', web_scan: 'bg-orange-500', auto_tool: 'bg-purple-500', dir_brute: 'bg-yellow-500', rate_limit: 'bg-cyan-500', ssh_spray: 'bg-pink-500', manual: 'bg-slate-500' }
                      return Object.entries(types).sort((a,b) => b[1]-a[1]).map(([tp, cnt]) => (
                        <div key={tp} className={`${colors[tp] || 'bg-slate-600'} h-full`} style={{ width: `${(cnt/total)*100}%` }} title={`${tp}: ${cnt}`} />
                      ))
                    })()}
                  </div>
                  <div className="flex gap-1.5 text-[6px] shrink-0">
                    <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />SSH</span>
                    <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-orange-500" />Web</span>
                    <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-purple-500" />Tool</span>
                    <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />Dir</span>
                  </div>
                </div>
              </div>
            )}

            {/* Threat table + live log */}
            <div className="flex-1 flex gap-2 min-h-0 overflow-hidden">
              {/* Threat table */}
              <div className="flex-1 flex flex-col border border-slate-800 rounded-xl bg-slate-900/20 overflow-hidden">
                <div className="shrink-0 px-3 py-1.5 border-b border-slate-800 bg-slate-900/40 flex items-center gap-2">
                  <span className="text-[9px] font-medium text-slate-400">\u2694\ufe0f \u5a01\u8105\u6e05\u55ae</span>
                  <div className="flex gap-1">
                    {(['all','banned','active'] as const).map(f => (
                      <button key={f} onClick={() => setBattleFilter(f)}
                        className={`text-[7px] px-1.5 py-0.5 rounded border ${battleFilter === f ? 'border-cyan-800 bg-cyan-950/40 text-cyan-400' : 'border-transparent text-slate-600 hover:text-slate-400'}`}
                      >{f === 'all' ? '\u5168\u90e8' : f === 'banned' ? '\u5df2\u5c01\u7981' : '\u6d3b\u8e8d'}</button>
                    ))}
                  </div>
                  <div className="flex-1" />
                  <button onClick={broadcastReport} className="text-[7px] px-1.5 py-0.5 border border-amber-800/50 rounded bg-amber-950/30 text-amber-400 hover:bg-amber-950/50">\ud83d\udce3 \u5c0f\u611b\u64ad\u5831</button>
                  <button onClick={fetchDefender} className="text-[7px] px-1.5 py-0.5 border border-slate-700 rounded text-slate-600 hover:text-cyan-400">\ud83d\udd04</button>
                </div>
                <div className="shrink-0 grid grid-cols-12 gap-1 px-3 py-1 border-b border-slate-800/50 text-[6px] text-slate-600 font-mono">
                  <span className="col-span-3">IP</span>
                  <span className="col-span-1 text-right">\u6b21\u6578</span>
                  <span className="col-span-2">\u985e\u578b</span>
                  <span className="col-span-2">\u7528\u6236\u540d</span>
                  <span className="col-span-2">\u6700\u5f8c\u898b</span>
                  <span className="col-span-1">\u72c0\u614b</span>
                  <span className="col-span-1">\u64cd\u4f5c</span>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {threatList
                    .filter(t => battleFilter === 'all' ? true : battleFilter === 'banned' ? t.banned : !t.banned)
                    .map((t, i) => (
                    <div key={t.ip} className={`grid grid-cols-12 gap-1 px-3 py-1 text-[7px] font-mono border-b border-slate-800/20 hover:bg-slate-800/30 ${i % 2 === 0 ? 'bg-slate-900/10' : ''}`}>
                      <span className="col-span-3 text-slate-300 truncate" title={t.ip}>{t.ip}</span>
                      <span className={`col-span-1 text-right font-bold ${t.count > 100 ? 'text-red-400' : t.count > 20 ? 'text-orange-400' : 'text-slate-400'}`}>{t.count}</span>
                      <span className="col-span-2 flex gap-0.5 flex-wrap">
                        {t.types.map(tp => (
                          <span key={tp} className={`px-0.5 rounded ${tp === 'ssh_brute' ? 'bg-red-950/50 text-red-400' : tp === 'web_scan' ? 'bg-orange-950/50 text-orange-400' : tp === 'auto_tool' ? 'bg-purple-950/50 text-purple-400' : 'bg-slate-800 text-slate-500'}`}>{tp.replace('_',''). slice(0,6)}</span>
                        ))}
                      </span>
                      <span className="col-span-2 text-slate-500 truncate">{t.usernames?.slice(-3).join(',') || '-'}</span>
                      <span className="col-span-2 text-slate-600">{t.lastSeen ? new Date(t.lastSeen).toLocaleTimeString('zh-TW') : '-'}</span>
                      <span className="col-span-1">{t.banned
                        ? <span className="text-red-400">\ud83d\udeab</span>
                        : <span className="text-yellow-400">\u26a0\ufe0f</span>
                      }</span>
                      <span className="col-span-1">
                        {!t.banned && <button onClick={() => manualBan(t.ip)} className="text-[6px] px-1 py-0.5 rounded bg-red-950/40 border border-red-800/40 text-red-400 hover:bg-red-900/40">BAN</button>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right column — live attack feed + heatmap */}
              <div className="w-56 shrink-0 flex flex-col gap-2 overflow-hidden">
                {/* Live attack feed */}
                <div className="flex-1 flex flex-col border border-red-900/40 rounded-xl bg-red-950/10 overflow-hidden min-h-0">
                  <div className="shrink-0 px-2 py-1.5 border-b border-red-900/30 text-[8px] text-red-400 font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> \u5be6\u6642\u653b\u64ca\u6d41
                  </div>
                  <div className="flex-1 overflow-y-auto p-1 space-y-0.5 font-mono text-[6px]">
                    {threatList.filter(t => {
                      const ago = Date.now() - new Date(t.lastSeen).getTime()
                      return ago < 3600000
                    }).slice(0, 30).map((t, i) => (
                      <div key={`live-${t.ip}-${i}`} className={`px-1.5 py-0.5 rounded ${t.banned ? 'bg-red-950/30 text-red-400/80' : 'bg-amber-950/20 text-amber-400/80'}`}>
                        <span className={t.banned ? 'line-through' : ''}>{t.ip}</span>
                        <span className="text-slate-600 ml-1">{t.types[0]}</span>
                        <span className="float-right">{t.banned ? '\u2620\ufe0f' : '\u26a0\ufe0f'} {t.count}</span>
                      </div>
                    ))}
                    {threatList.filter(t => Date.now() - new Date(t.lastSeen).getTime() < 3600000).length === 0 && (
                      <div className="text-center py-4 text-slate-600 text-[7px]">\u66ab\u7121\u6d3b\u8e8d\u653b\u64ca<br/>\u9632\u79a6\u76fe\u724c\u5df2\u555f\u52d5</div>
                    )}
                  </div>
                </div>

                {/* Top attackers mini chart */}
                <div className="h-36 shrink-0 flex flex-col border border-slate-800 rounded-xl bg-slate-900/30 overflow-hidden">
                  <div className="px-2 py-1.5 border-b border-slate-800 text-[8px] text-slate-500 font-medium">\ud83c\udfc6 \u653b\u64ca\u6392\u884c\u699c</div>
                  <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
                    {defStatus?.topAttackers?.slice(0, 8).map((t, i) => {
                      const maxCount = defStatus.topAttackers[0]?.count || 1
                      const pct = Math.round((t.count / maxCount) * 100)
                      return (
                        <div key={t.ip} className="flex items-center gap-1">
                          <span className={`text-[7px] w-3 text-right font-bold ${i < 3 ? 'text-red-400' : 'text-slate-500'}`}>{i+1}</span>
                          <div className="flex-1 relative h-3 bg-slate-800/50 rounded overflow-hidden">
                            <div className={`absolute inset-y-0 left-0 rounded ${i === 0 ? 'bg-red-600/60' : i < 3 ? 'bg-orange-600/40' : 'bg-slate-700/40'}`} style={{ width: `${pct}%` }} />
                            <span className="absolute inset-0 flex items-center px-1 text-[6px] text-slate-300 font-mono truncate">{t.ip}</span>
                          </div>
                          <span className="text-[6px] w-8 text-right font-mono text-slate-500">{t.count > 999 ? (t.count/1000).toFixed(1)+'k' : t.count}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VPS AUDIT VIEW */}
        {view === 'vps' && <VPSAuditPanel />}
      </div>
    </div>
  )
}

function Stat({ label, val, c }: { label: string; val: string; c?: string }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-lg px-2 py-1.5 text-center">
      <div className="text-[7px] text-slate-600">{label}</div>
      <div className={`text-[9px] font-mono font-bold ${c || 'text-slate-300'}`}>{val}</div>
    </div>
  )
}

function BotChatMessages({ botKey }: { botKey: string }) {
  const [queue, setQueue] = useState<Array<{ id: number; from: string; text: string; ts: string; direction: string }>>([])
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const f = async () => { try { const r = await fetch('/api/bot/chat'); const d = await r.json(); setQueue(d.queue || []) } catch {} }
    f(); const t = setInterval(f, 4000); return () => clearInterval(t)
  }, [botKey])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [queue])

  return (
    <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
      {queue.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-600">
          <span className="text-2xl">\ud83e\udd16</span>
          <span className="text-[8px]">\u8f38\u5165\u547d\u4ee4\u8207Bot\u4ea4\u4e92</span>
          <span className="text-[7px] text-slate-700">/help\u00b7/forward\u00b7/sd\u00b7/winstatus</span>
        </div>
      ) : queue.map(m => (
        <div key={m.id} className={`flex gap-1.5 ${m.direction === 'in' ? '' : 'flex-row-reverse'}`}>
          <div className={`max-w-[75%] rounded-lg px-2.5 py-1.5 ${m.direction === 'out' ? 'bg-violet-950/40 border border-violet-800/40' : 'bg-slate-800/60 border border-slate-700/40'}`}>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={`text-[8px] font-medium ${m.direction === 'out' ? 'text-violet-400' : 'text-cyan-400'}`}>{m.from}</span>
              <span className="text-[6px] text-slate-700">{new Date(m.ts).toLocaleTimeString('zh-TW')}</span>
            </div>
            <div className="text-[9px] text-slate-300 whitespace-pre-wrap break-words">{m.text}</div>
          </div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
}

function VPSAuditPanel() {
  const [audit, setAudit] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const run = async () => { setLoading(true); try { const r = await fetch('/api/audit'); setAudit(await r.json()) } catch {}; setLoading(false) }
  useEffect(() => { run() }, [])

  const a = audit
  const sec = a?.security || {}
  const net = a?.network || {}
  const ports = (a?.listenPorts || []) as any[]
  const findings = (a?.findings || []) as any[]

  return (
    <div className="flex-1 flex flex-col border border-slate-800 rounded-xl bg-slate-900/20 overflow-hidden">
      <div className="shrink-0 px-3 py-2 border-b border-slate-800 bg-slate-900/40 flex items-center gap-2">
        <span className="text-[9px] font-medium text-slate-300">VPS \u5b89\u5168\u7a3d\u67e5</span>
        <div className="flex-1" />
        <button onClick={run} disabled={loading} className="text-[7px] px-2 py-0.5 border border-slate-700 rounded text-slate-600 hover:text-cyan-400 disabled:opacity-30">
          {loading ? '\u6383\u63cf\u4e2d...' : '\ud83d\udd04 \u91cd\u65b0\u7a3d\u67e5'}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {!a ? (
          <div className="text-center py-6 text-[8px] text-slate-600">{loading ? '\u7a3d\u67e5\u4e2d...' : '\u8f09\u5165\u4e2d...'}</div>
        ) : (
          <>
            <div className="flex items-center gap-3 px-3 py-2 rounded-xl border border-slate-800 bg-slate-900/40">
              <div className={`text-xl font-mono font-bold ${a.score >= 80 ? 'text-emerald-400' : a.score >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>{a.score}/100</div>
              <div>
                <div className="text-[9px] text-slate-300">{a.verdict}</div>
                <div className="text-[7px] text-slate-600">{a.hostname}\u00b7{a.os}</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="UFW" val={sec.firewallEnabled ? 'ON' : 'OFF'} c={sec.firewallEnabled ? 'text-emerald-400' : 'text-red-400'} />
              <Stat label="\u96b1\u8eab" val={sec.stealthEnabled ? 'ON' : 'OFF'} c={sec.stealthEnabled ? 'text-emerald-400' : 'text-orange-400'} />
              <Stat label="F2B" val={sec.fail2banActive ? `ON(${sec.fail2banJails})` : 'OFF'} c={sec.fail2banActive ? 'text-emerald-400' : 'text-red-400'} />
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/30 px-3 py-2 text-[8px] font-mono space-y-0.5">
              <div className="flex gap-4"><span className="text-slate-600 w-12">IP</span><span className="text-slate-300">{net.ip}</span></div>
              <div className="flex gap-4"><span className="text-slate-600 w-12">\u9598\u9053</span><span className="text-slate-300">{net.gateway}</span></div>
              <div className="flex gap-4"><span className="text-slate-600 w-12">\u7aef\u53e3</span><span className="text-orange-400">{ports.length}\u500b(\u516c\u958b:{ports.filter((p: any) => p.public).length})</span></div>
            </div>
            {findings.length > 0 && (
              <div className="space-y-1">
                <div className="text-[8px] text-slate-500 font-medium">\u767c\u73fe ({findings.length})</div>
                {findings.map((f: any, i: number) => (
                  <div key={i} className={`rounded-lg border px-2 py-1.5 text-[8px] ${f.level === 'CRITICAL' ? 'border-red-800 bg-red-950/40 text-red-400' : f.level === 'HIGH' ? 'border-orange-800 bg-orange-950/30 text-orange-400' : 'border-slate-700 bg-slate-900/30 text-slate-400'}`}>
                    [{f.level}] {f.title}
                    <div className="text-[7px] opacity-70 mt-0.5">{f.detail}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
