import { useState, useEffect, useRef, useCallback } from 'react'

interface Group {
  id: string
  name: string
  type: string
  messageCount: number
  lastActivity: string | null
  isMain: boolean
}

interface FeedMessage {
  id: number
  from: string
  fromId?: number
  username?: string
  text: string
  ts: string
  replyTo?: number | null
  groupId: string
  groupName: string
  isMain: boolean
}

interface BotInfo {
  key: string
  name: string
  role: string
  desc: string
  running: boolean
}

interface Alert {
  id: number
  level: string
  category: string
  title: string
  detail: string
  ts: string
}

interface MonitorStatus {
  running: boolean
  totalAlerts: number
  recentCritical: number
  recentHigh: number
  ddosRisk: string
}

type View = 'feed' | 'group' | 'bots' | 'alerts' | 'vps'

export default function BotChatPanel() {
  const [view, setView] = useState<View>('feed')
  const [feed, setFeed] = useState<FeedMessage[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [groupMessages, setGroupMessages] = useState<FeedMessage[]>([])
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

  // Unified feed — includes feed + groups + monitor + alerts
  const fetchFeed = useCallback(async () => {
    try {
      const r = await fetch('/api/bot/feed?limit=80')
      const d = await r.json()
      setFeed(d.feed || [])
      setGroups(d.groups || [])
      if (d.monitor) setMonitorStatus(d.monitor)
      if (d.alerts) setAlerts(d.alerts)
    } catch {}
  }, [])

  const fetchBots = useCallback(async () => {
    try {
      const r = await fetch('/api/bot/experts')
      const d = await r.json()
      setBots(d.bots || [])
    } catch {}
  }, [])

  const fetchGroupMsgs = useCallback(async () => {
    if (!selectedGroup) return
    try {
      const r = await fetch(`/api/bot/messages?groupId=${selectedGroup}&limit=80`)
      const d = await r.json()
      setGroupMessages(d.messages || [])
    } catch {}
  }, [selectedGroup])

  const fetchAlerts = useCallback(async () => {
    try {
      const r = await fetch('/api/monitor/alerts?limit=30')
      const d = await r.json()
      setAlerts(d.alerts || [])
    } catch {}
  }, [])

  useEffect(() => {
    fetchFeed()
    fetchBots()
    const t = setInterval(fetchFeed, 6000)
    return () => clearInterval(t)
  }, [fetchFeed, fetchBots])

  useEffect(() => {
    if (view === 'group' && selectedGroup) {
      fetchGroupMsgs()
      const t = setInterval(fetchGroupMsgs, 5000)
      return () => clearInterval(t)
    }
  }, [view, selectedGroup, fetchGroupMsgs])

  useEffect(() => {
    if (view === 'alerts') fetchAlerts()
  }, [view, fetchAlerts])

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [feed, groupMessages])

  // Send message to a group via Win Bot
  const sendToGroup = async (groupId: string) => {
    if (!input.trim() || sending) return
    setSending(true)
    try {
      await fetch('/api/bot/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, text: input.trim() }),
      })
      setInput('')
      setReplyTarget(null)
      setTimeout(() => { fetchFeed(); fetchGroupMsgs() }, 1000)
    } catch {}
    setSending(false)
  }

  // Chat with any bot
  const chatWithBot = async () => {
    if (!botChatInput.trim() || sending) return
    setSending(true)
    try {
      const ep = selectedBot === 'win' ? '/api/bot/chat' : '/api/bot/chat-any'
      const body = selectedBot === 'win'
        ? { message: botChatInput.trim(), user: 'panel' }
        : { bot: selectedBot, message: botChatInput.trim(), user: 'panel' }
      await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      setBotChatInput('')
    } catch {}
    setSending(false)
  }

  // Mac bot send
  const macBotSend = async () => {
    if (!input.trim() || sending) return
    setSending(true)
    try {
      await fetch('/api/bot/mac-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input.trim() }),
      })
      setInput('')
    } catch {}
    setSending(false)
  }

  const AC: Record<string, string> = {
    CRITICAL: 'border-red-800 bg-red-950/50 text-red-400',
    HIGH: 'border-orange-800 bg-orange-950/40 text-orange-400',
    MEDIUM: 'border-yellow-800 bg-yellow-950/30 text-yellow-400',
    INFO: 'border-slate-700 bg-slate-900/40 text-slate-400',
  }

  const viewButtons: { id: View; icon: string; label: string }[] = [
    { id: 'feed', icon: '📡', label: '全量動態' },
    { id: 'group', icon: '💬', label: '群組' },
    { id: 'bots', icon: '🤖', label: 'Bot 交互' },
    { id: 'alerts', icon: '🚨', label: '安全警報' },
    { id: 'vps', icon: '🛡', label: 'VPS 防禦' },
  ]

  return (
    <div className="h-full flex flex-col overflow-hidden gap-3">
      {/* Top bar — view switch + security status */}
      <div className="shrink-0 flex items-center gap-2">
        {viewButtons.map(v => (
          <button key={v.id} onClick={() => setView(v.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${view === v.id ? 'bg-cyan-950/50 border-cyan-800/60 text-cyan-300' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'}`}
          >{v.icon} {v.label}</button>
        ))}
        <div className="flex-1" />
        {monitorStatus && (
          <div className="flex items-center gap-3 text-[10px] font-mono">
            <span className={`flex items-center gap-1 ${monitorStatus.running ? 'text-emerald-400' : 'text-red-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${monitorStatus.running ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
              監控
            </span>
            <span className={monitorStatus.ddosRisk === 'HIGH' ? 'text-red-400' : monitorStatus.ddosRisk === 'MEDIUM' ? 'text-yellow-400' : 'text-slate-500'}>
              DDoS: {monitorStatus.ddosRisk}
            </span>
            <span className="text-slate-600">警報: {monitorStatus.totalAlerts}</span>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex gap-3 min-h-0 overflow-hidden">

        {/* ═══ FEED VIEW — 默認全量動態 ═══ */}
        {view === 'feed' && (
          <>
            {/* Sidebar: group list */}
            <div className="w-56 shrink-0 flex flex-col border border-slate-800 rounded-xl bg-slate-900/30 overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-800 text-[10px] text-slate-500 font-medium">監控群組</div>
              <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
                {groups.length === 0 ? (
                  <div className="text-center py-6 text-[10px] text-slate-600">等待 Win Bot 收到群組訊息...</div>
                ) : groups.map(g => (
                  <button key={g.id} onClick={() => { setSelectedGroup(g.id); setView('group') }}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-800/50 text-slate-400 transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs">{g.isMain ? '⭐' : '💬'}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-medium truncate">{g.name}</div>
                        <div className="text-[8px] text-slate-600">{g.messageCount} 條 {g.isMain ? '· OECE 主群 (摘要)' : '· 全量監控'}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              {/* Quick alerts */}
              {alerts.length > 0 && (
                <div className="border-t border-slate-800 p-1.5 space-y-1 max-h-36 overflow-y-auto">
                  <div className="text-[9px] text-slate-600 px-1">最近警報</div>
                  {alerts.slice(0, 3).map(a => (
                    <div key={a.id} className={`px-2 py-1 rounded text-[9px] border ${AC[a.level] || ''}`}>
                      <span className="font-medium">{a.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Feed messages */}
            <div className="flex-1 flex flex-col border border-slate-800 rounded-xl bg-slate-900/20 overflow-hidden">
              <div className="shrink-0 px-4 py-2.5 border-b border-slate-800 bg-slate-900/40 flex items-center gap-2">
                <span className="text-sm">📡</span>
                <span className="text-xs font-medium text-slate-300">全量動態流</span>
                <span className="text-[9px] text-slate-600">— OECE 去重摘要 · 其他群全量</span>
                <div className="flex-1" />
                <button onClick={fetchFeed} className="text-[9px] px-2 py-0.5 border border-slate-700 rounded text-slate-500 hover:text-cyan-400 transition-all">🔄</button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
                {feed.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
                    <span className="text-4xl">📡</span>
                    <span className="text-xs">等待 Win Bot 接收群組訊息...</span>
                    <span className="text-[10px] text-slate-700">Bot 加入群組後自動開始監控</span>
                  </div>
                ) : feed.map((m, i) => (
                  <div key={`${m.groupId}-${m.id}-${i}`} className="flex gap-2 group">
                    <div className={`flex-1 rounded-lg px-3 py-2 border ${m.isMain ? 'bg-amber-950/20 border-amber-900/30' : 'bg-slate-800/40 border-slate-700/30'}`}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${m.isMain ? 'bg-amber-900/40 text-amber-400' : 'bg-cyan-900/30 text-cyan-400'}`}>{m.groupName}</span>
                        <span className="text-[10px] font-medium text-slate-300">{m.from}</span>
                        {m.username && <span className="text-[9px] text-slate-600">@{m.username}</span>}
                        <div className="flex-1" />
                        <span className="text-[8px] text-slate-700">{new Date(m.ts).toLocaleTimeString('zh-TW')}</span>
                      </div>
                      <div className="text-[11px] text-slate-300 whitespace-pre-wrap break-words line-clamp-4">{m.text}</div>
                    </div>
                    {/* Quick reply button for non-main groups */}
                    {!m.isMain && (
                      <button
                        onClick={() => { setReplyTarget(m); setSelectedGroup(m.groupId) }}
                        className="opacity-0 group-hover:opacity-100 self-center text-[9px] px-2 py-1 border border-slate-700 rounded text-slate-500 hover:text-cyan-400 hover:border-cyan-700 transition-all shrink-0"
                      >↩ 回覆</button>
                    )}
                  </div>
                ))}
                <div ref={msgEndRef} />
              </div>

              {/* Reply bar */}
              <div className="shrink-0 px-4 py-2.5 border-t border-slate-800 bg-slate-900/40">
                {replyTarget && (
                  <div className="flex items-center gap-2 mb-2 px-2 py-1 rounded bg-slate-800/50 border border-slate-700/50 text-[9px]">
                    <span className="text-cyan-400">↩ 回覆 [{replyTarget.groupName}] {replyTarget.from}</span>
                    <span className="text-slate-600 truncate flex-1">{replyTarget.text?.slice(0, 40)}</span>
                    <button onClick={() => setReplyTarget(null)} className="text-slate-500 hover:text-red-400">✕</button>
                  </div>
                )}
                <div className="flex gap-2">
                  <select
                    value={selectedGroup || ''}
                    onChange={e => setSelectedGroup(e.target.value || null)}
                    className="bg-slate-800/60 border border-slate-700 rounded-lg px-2 py-2 text-[10px] text-slate-400 focus:outline-none w-36 shrink-0"
                  >
                    <option value="">選擇目標群組</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name} {g.isMain ? '(主群)' : ''}</option>)}
                  </select>
                  <input value={input} onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && selectedGroup && sendToGroup(selectedGroup)}
                    placeholder="透過 Bot 發送訊息..."
                    className="flex-1 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-700 transition-colors"
                  />
                  <button onClick={() => selectedGroup && sendToGroup(selectedGroup)} disabled={sending || !input.trim() || !selectedGroup}
                    className="px-3 py-2 rounded-lg text-[10px] font-medium bg-cyan-950/50 border border-cyan-800/60 text-cyan-400 hover:bg-cyan-900/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >SD 發送</button>
                  <button onClick={macBotSend} disabled={sending || !input.trim()}
                    className="px-3 py-2 rounded-lg text-[10px] font-medium bg-emerald-950/50 border border-emerald-800/60 text-emerald-400 hover:bg-emerald-900/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >Chou 發送</button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ═══ GROUP VIEW — 單群組全量 ═══ */}
        {view === 'group' && (
          <>
            <div className="w-56 shrink-0 flex flex-col border border-slate-800 rounded-xl bg-slate-900/30 overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-800 text-[10px] text-slate-500 font-medium">群組列表</div>
              <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
                {groups.map(g => (
                  <button key={g.id} onClick={() => setSelectedGroup(g.id)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg transition-all ${selectedGroup === g.id ? 'bg-cyan-950/50 border border-cyan-800/60 text-cyan-300' : 'hover:bg-slate-800/50 text-slate-400 border border-transparent'}`}
                  >
                    <div className="text-[10px] font-medium truncate">{g.isMain ? '⭐ ' : '💬 '}{g.name}</div>
                    <div className="text-[8px] text-slate-600">{g.messageCount} 條</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 flex flex-col border border-slate-800 rounded-xl bg-slate-900/20 overflow-hidden">
              <div className="shrink-0 px-4 py-2.5 border-b border-slate-800 bg-slate-900/40 flex items-center gap-2">
                <span className="text-sm">💬</span>
                <span className="text-xs font-medium text-slate-300">{groups.find(g => g.id === selectedGroup)?.name || '選擇群組'}</span>
                {selectedGroup && groups.find(g => g.id === selectedGroup)?.isMain && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-400">OECE 主群</span>
                )}
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
                {!selectedGroup ? (
                  <div className="text-center py-12 text-[10px] text-slate-600">← 選擇群組</div>
                ) : groupMessages.length === 0 ? (
                  <div className="text-center py-12 text-[10px] text-slate-600">此群暫無訊息</div>
                ) : groupMessages.map((m, i) => (
                  <div key={`${m.id}-${i}`} className={`flex gap-2 ${m.from === 'SD (面板)' ? 'flex-row-reverse' : ''}`}>
                    <div className={`max-w-[80%] rounded-lg px-3 py-2 ${m.from === 'SD (面板)' ? 'bg-cyan-950/40 border border-cyan-800/40' : 'bg-slate-800/50 border border-slate-700/30'}`}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-medium text-cyan-400">{m.from}</span>
                        <span className="text-[8px] text-slate-700">{new Date(m.ts).toLocaleTimeString('zh-TW')}</span>
                      </div>
                      <div className="text-[11px] text-slate-300 whitespace-pre-wrap break-words">{m.text}</div>
                    </div>
                  </div>
                ))}
                <div ref={msgEndRef} />
              </div>
              {selectedGroup && (
                <div className="shrink-0 px-4 py-2.5 border-t border-slate-800 bg-slate-900/40">
                  <div className="flex gap-2">
                    <input value={input} onChange={e => setInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && sendToGroup(selectedGroup)}
                      placeholder="透過 SD Bot 發送到此群..."
                      className="flex-1 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-700"
                    />
                    <button onClick={() => sendToGroup(selectedGroup)} disabled={sending || !input.trim()}
                      className="px-3 py-2 rounded-lg text-[10px] font-medium bg-cyan-950/50 border border-cyan-800/60 text-cyan-400 disabled:opacity-30 transition-all"
                    >📤 發送</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ═══ BOTS VIEW — Bot 交互 ═══ */}
        {view === 'bots' && (
          <>
            <div className="w-56 shrink-0 flex flex-col border border-slate-800 rounded-xl bg-slate-900/30 overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-800 text-[10px] text-slate-500 font-medium">Bot 列表</div>
              <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
                {bots.map(b => (
                  <button key={b.key} onClick={() => setSelectedBot(b.key)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg transition-all ${selectedBot === b.key ? 'bg-violet-950/50 border border-violet-800/60 text-violet-300' : 'hover:bg-slate-800/50 text-slate-400 border border-transparent'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${b.running ? 'bg-emerald-400' : 'bg-slate-700'}`} />
                      <div>
                        <div className="text-[10px] font-medium">{b.name}</div>
                        <div className="text-[8px] text-slate-600 truncate">{b.desc}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="border-t border-slate-800 p-2 text-[9px] text-slate-600">
                <div>Mac Bot: Mr`Chou 助理</div>
                <div>Win Bot: SD (面板代理)</div>
              </div>
            </div>
            <div className="flex-1 flex flex-col border border-slate-800 rounded-xl bg-slate-900/20 overflow-hidden">
              <div className="shrink-0 px-4 py-2.5 border-b border-slate-800 bg-slate-900/40 flex items-center gap-2">
                <span className="text-sm">🤖</span>
                <span className="text-xs font-medium text-slate-300">{bots.find(b => b.key === selectedBot)?.name || selectedBot}</span>
                <span className="text-[9px] text-slate-600">{bots.find(b => b.key === selectedBot)?.desc || ''}</span>
              </div>
              <BotChatMessages botKey={selectedBot} />
              <div className="shrink-0 px-4 py-2.5 border-t border-slate-800 bg-slate-900/40">
                <div className="flex gap-2">
                  <input value={botChatInput} onChange={e => setBotChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && chatWithBot()}
                    placeholder={`與 ${bots.find(b => b.key === selectedBot)?.name || 'Bot'} 對話...`}
                    className="flex-1 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-violet-700"
                  />
                  <button onClick={chatWithBot} disabled={sending || !botChatInput.trim()}
                    className="px-3 py-2 rounded-lg text-[10px] font-medium bg-violet-950/50 border border-violet-800/60 text-violet-400 disabled:opacity-30 transition-all"
                  >發送</button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ═══ ALERTS VIEW ═══ */}
        {view === 'alerts' && (
          <div className="flex-1 flex flex-col border border-slate-800 rounded-xl bg-slate-900/20 overflow-hidden">
            <div className="shrink-0 px-4 py-2.5 border-b border-slate-800 bg-slate-900/40 flex items-center gap-2">
              <span className="text-sm">🚨</span>
              <span className="text-xs font-medium text-slate-300">安全監控中心</span>
              <span className="text-[9px] text-slate-600">SSH·Nginx·Fail2Ban·DDoS 全量 TG 播報</span>
              <div className="flex-1" />
              {monitorStatus?.ddosRisk === 'HIGH' && (
                <button onClick={() => fetch('/api/monitor/ddos-shield', { method: 'POST' }).then(fetchAlerts)}
                  className="px-2 py-1 rounded text-[9px] bg-red-950/50 border border-red-800/60 text-red-400 animate-pulse"
                >🛡 啟用 DO 雲盾</button>
              )}
              <button onClick={fetchAlerts} className="text-[9px] px-2 py-0.5 border border-slate-700 rounded text-slate-500 hover:text-cyan-400 transition-all">🔄</button>
            </div>
            {monitorStatus && (
              <div className="shrink-0 grid grid-cols-4 gap-2 px-4 py-2 border-b border-slate-800">
                <StatMini label="總警報" value={String(monitorStatus.totalAlerts)} />
                <StatMini label="嚴重" value={String(monitorStatus.recentCritical)} color={monitorStatus.recentCritical > 0 ? 'text-red-400' : undefined} />
                <StatMini label="高危" value={String(monitorStatus.recentHigh)} color={monitorStatus.recentHigh > 0 ? 'text-orange-400' : undefined} />
                <StatMini label="DDoS" value={monitorStatus.ddosRisk} color={monitorStatus.ddosRisk === 'HIGH' ? 'text-red-400' : monitorStatus.ddosRisk === 'MEDIUM' ? 'text-yellow-400' : 'text-emerald-400'} />
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {alerts.map(a => (
                <div key={a.id} className={`rounded-xl border px-3 py-2.5 ${AC[a.level] || ''}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-mono opacity-70">[{a.category}]</span>
                    <span className="text-[11px] font-medium">{a.title}</span>
                    <div className="flex-1" />
                    <span className="text-[8px] text-slate-600">{new Date(a.ts).toLocaleString('zh-TW')}</span>
                  </div>
                  <p className="text-[10px] opacity-70 whitespace-pre-wrap">{a.detail}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ VPS VIEW — VPS 防禦 + 稽查 ═══ */}
        {view === 'vps' && <VPSDefensePanel />}
      </div>
    </div>
  )
}

function StatMini({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-lg px-2 py-1.5 text-center">
      <div className="text-[8px] text-slate-600">{label}</div>
      <div className={`text-xs font-mono font-bold ${color || 'text-slate-300'}`}>{value}</div>
    </div>
  )
}

function BotChatMessages({ botKey }: { botKey: string }) {
  const [queue, setQueue] = useState<Array<{ id: number; from: string; text: string; ts: string; direction: string }>>([])
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const f = async () => {
      try { const r = await fetch('/api/bot/chat'); const d = await r.json(); setQueue(d.queue || []) } catch {}
    }
    f()
    const t = setInterval(f, 4000)
    return () => clearInterval(t)
  }, [botKey])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [queue])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
      {queue.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
          <span className="text-3xl">🤖</span>
          <span className="text-xs">輸入命令與 Bot 交互</span>
          <span className="text-[10px] text-slate-700">/help · /forward · /sd · /winstatus</span>
        </div>
      ) : queue.map(m => (
        <div key={m.id} className={`flex gap-2 ${m.direction === 'in' ? '' : 'flex-row-reverse'}`}>
          <div className={`max-w-[75%] rounded-lg px-3 py-2 ${m.direction === 'out' ? 'bg-violet-950/40 border border-violet-800/40' : 'bg-slate-800/60 border border-slate-700/40'}`}>
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-[10px] font-medium ${m.direction === 'out' ? 'text-violet-400' : 'text-cyan-400'}`}>{m.from}</span>
              <span className="text-[8px] text-slate-700">{new Date(m.ts).toLocaleTimeString('zh-TW')}</span>
            </div>
            <div className="text-[11px] text-slate-300 whitespace-pre-wrap break-words">{m.text}</div>
          </div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
}

function VPSDefensePanel() {
  const [audit, setAudit] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)

  const runAudit = async () => {
    setLoading(true)
    try { const r = await fetch('/api/audit'); setAudit(await r.json()) } catch {}
    setLoading(false)
  }

  useEffect(() => { runAudit() }, [])

  const a = audit as Record<string, unknown> | null
  const sec = (a?.security || {}) as Record<string, unknown>
  const net = (a?.network || {}) as Record<string, unknown>
  const ports = (a?.listenPorts || []) as Array<Record<string, unknown>>
  const findings = (a?.findings || []) as Array<Record<string, string>>

  return (
    <div className="flex-1 flex flex-col border border-slate-800 rounded-xl bg-slate-900/20 overflow-hidden">
      <div className="shrink-0 px-4 py-2.5 border-b border-slate-800 bg-slate-900/40 flex items-center gap-2">
        <span className="text-sm">🛡</span>
        <span className="text-xs font-medium text-slate-300">VPS 防禦 + 安全稽查</span>
        <div className="flex-1" />
        <button onClick={runAudit} disabled={loading}
          className="text-[9px] px-2 py-0.5 border border-slate-700 rounded text-slate-500 hover:text-cyan-400 transition-all disabled:opacity-30"
        >{loading ? '⏳ 掃描中...' : '🔄 重新稽查'}</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!a ? (
          <div className="text-center py-12 text-[10px] text-slate-600">{loading ? '稽查中...' : '點擊「重新稽查」開始'}</div>
        ) : (
          <>
            {/* Score */}
            <div className="flex items-center gap-4 px-4 py-3 rounded-xl border border-slate-800 bg-slate-900/40">
              <div className={`text-2xl font-mono font-bold ${(a.score as number) >= 80 ? 'text-emerald-400' : (a.score as number) >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>{a.score as number}/100</div>
              <div>
                <div className="text-xs text-slate-300">{a.verdict as string}</div>
                <div className="text-[9px] text-slate-600">{a.hostname as string} · {a.os as string}</div>
              </div>
            </div>
            {/* Security */}
            <div className="grid grid-cols-3 gap-2">
              <StatMini label="UFW 防火牆" value={sec.firewallEnabled ? '✅ ON' : '❌ OFF'} color={sec.firewallEnabled ? 'text-emerald-400' : 'text-red-400'} />
              <StatMini label="隱身模式" value={sec.stealthEnabled ? '✅ ON' : '❌ OFF'} color={sec.stealthEnabled ? 'text-emerald-400' : 'text-orange-400'} />
              <StatMini label="Fail2Ban" value={sec.fail2banActive ? `✅ ${sec.fail2banJails}獄` : '❌ OFF'} color={sec.fail2banActive ? 'text-emerald-400' : 'text-red-400'} />
            </div>
            {/* Network */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-3 py-2 text-[10px] font-mono space-y-0.5">
              <div className="flex gap-8"><span className="text-slate-600 w-16">IP</span><span className="text-slate-300">{net.ip as string}</span></div>
              <div className="flex gap-8"><span className="text-slate-600 w-16">閘道</span><span className="text-slate-300">{net.gateway as string}</span></div>
              <div className="flex gap-8"><span className="text-slate-600 w-16">監聽端口</span><span className="text-orange-400">{ports.length} 個</span></div>
            </div>
            {/* Findings */}
            {findings.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] text-slate-500 font-medium">發現項目 ({findings.length})</div>
                {findings.map((f, i) => (
                  <div key={i} className={`rounded-lg border px-3 py-2 text-[10px] ${f.level === 'CRITICAL' ? 'border-red-800 bg-red-950/40 text-red-400' : f.level === 'HIGH' ? 'border-orange-800 bg-orange-950/30 text-orange-400' : 'border-slate-700 bg-slate-900/30 text-slate-400'}`}>
                    <span className="font-medium">[{f.level}] {f.title}</span>
                    <div className="text-[9px] opacity-70 mt-0.5">{f.detail}</div>
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
