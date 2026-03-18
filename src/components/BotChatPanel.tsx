import { useState, useEffect, useRef, useCallback } from 'react'

interface Group {
  id: string
  name: string
  type: string
  messageCount: number
  lastActivity: string | null
  isMain: boolean
}

interface Message {
  id: number
  from: string
  fromId?: number
  username?: string
  text: string
  ts: string
  replyTo?: number | null
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

type Tab = 'groups' | 'bots' | 'alerts'

export default function BotChatPanel() {
  const [tab, setTab] = useState<Tab>('groups')
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [bots, setBots] = useState<BotInfo[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [monitorStatus, setMonitorStatus] = useState<MonitorStatus | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [selectedBot, setSelectedBot] = useState<string>('win')
  const [botChatInput, setBotChatInput] = useState('')
  const msgEndRef = useRef<HTMLDivElement>(null)

  // Fetch groups
  const fetchGroups = useCallback(async () => {
    try {
      const r = await fetch('/api/bot/groups')
      const d = await r.json()
      setGroups(d.groups || [])
    } catch {}
  }, [])

  // Fetch messages for selected group
  const fetchMessages = useCallback(async () => {
    if (!selectedGroup) return
    try {
      const r = await fetch(`/api/bot/messages?groupId=${selectedGroup}&limit=80`)
      const d = await r.json()
      setMessages(d.messages || [])
    } catch {}
  }, [selectedGroup])

  // Fetch bots
  const fetchBots = useCallback(async () => {
    try {
      const r = await fetch('/api/bot/experts')
      const d = await r.json()
      setBots(d.bots || [])
    } catch {}
  }, [])

  // Fetch alerts
  const fetchAlerts = useCallback(async () => {
    try {
      const [aR, sR] = await Promise.all([
        fetch('/api/monitor/alerts?limit=30'),
        fetch('/api/monitor/status'),
      ])
      const aD = await aR.json()
      const sD = await sR.json()
      setAlerts(aD.alerts || [])
      setMonitorStatus(sD)
    } catch {}
  }, [])

  useEffect(() => {
    fetchGroups()
    fetchBots()
    fetchAlerts()
    const t = setInterval(() => {
      fetchGroups()
      if (tab === 'alerts') fetchAlerts()
    }, 8000)
    return () => clearInterval(t)
  }, [fetchGroups, fetchBots, fetchAlerts, tab])

  useEffect(() => {
    fetchMessages()
    const t = setInterval(fetchMessages, 5000)
    return () => clearInterval(t)
  }, [fetchMessages])

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Send message to group
  const sendToGroup = async () => {
    if (!selectedGroup || !input.trim() || sending) return
    setSending(true)
    try {
      await fetch('/api/bot/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: selectedGroup, text: input.trim() }),
      })
      setInput('')
      setTimeout(fetchMessages, 1000)
    } catch {}
    setSending(false)
  }

  // Chat with bot
  const chatWithBot = async () => {
    if (!botChatInput.trim() || sending) return
    setSending(true)
    try {
      const endpoint = selectedBot === 'win'
        ? '/api/bot/chat'
        : '/api/bot/chat-any'
      const body = selectedBot === 'win'
        ? { message: botChatInput.trim(), user: 'panel' }
        : { bot: selectedBot, message: botChatInput.trim(), user: 'panel' }
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setBotChatInput('')
    } catch {}
    setSending(false)
  }

  const ALERT_COLORS: Record<string, string> = {
    CRITICAL: 'border-red-800 bg-red-950/50 text-red-400',
    HIGH: 'border-orange-800 bg-orange-950/40 text-orange-400',
    MEDIUM: 'border-yellow-800 bg-yellow-950/30 text-yellow-400',
    INFO: 'border-slate-700 bg-slate-900/40 text-slate-400',
  }

  const RISK_COLOR: Record<string, string> = {
    HIGH: 'text-red-400 bg-red-950/60',
    MEDIUM: 'text-yellow-400 bg-yellow-950/40',
    LOW: 'text-emerald-400 bg-emerald-950/40',
  }

  const selectedGroupName = groups.find(g => g.id === selectedGroup)?.name || '選擇群組'

  return (
    <div className="h-full flex gap-4 overflow-hidden">
      {/* Left sidebar — Groups / Bots / Alerts tabs */}
      <div className="w-72 shrink-0 flex flex-col border border-slate-800 rounded-xl bg-slate-900/30 overflow-hidden">
        {/* Tab buttons */}
        <div className="flex border-b border-slate-800 shrink-0">
          {([['groups', '📡 群組'], ['bots', '🤖 Bot'], ['alerts', '🚨 警報']] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-[11px] font-medium transition-all ${tab === t ? 'text-cyan-400 border-b-2 border-cyan-500 bg-slate-800/40' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {label}
              {t === 'alerts' && monitorStatus && monitorStatus.recentCritical > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] bg-red-900 text-red-300">{monitorStatus.recentCritical}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'groups' && (
            <div className="p-2 space-y-1">
              {groups.length === 0 ? (
                <div className="text-center py-8 text-[10px] text-slate-600">
                  Win Bot 尚未加入任何群組<br />或尚未收到訊息
                </div>
              ) : groups.map(g => (
                <button
                  key={g.id}
                  onClick={() => setSelectedGroup(g.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all ${selectedGroup === g.id ? 'bg-cyan-950/50 border border-cyan-800/60 text-cyan-300' : 'hover:bg-slate-800/50 text-slate-400 border border-transparent'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{g.isMain ? '⭐' : '💬'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-medium truncate">{g.name}</div>
                      <div className="text-[9px] text-slate-600">{g.messageCount} 條訊息 {g.isMain ? '· 主群' : ''}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {tab === 'bots' && (
            <div className="p-2 space-y-1">
              {bots.map(b => (
                <button
                  key={b.key}
                  onClick={() => setSelectedBot(b.key)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all ${selectedBot === b.key ? 'bg-violet-950/50 border border-violet-800/60 text-violet-300' : 'hover:bg-slate-800/50 text-slate-400 border border-transparent'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${b.running ? 'bg-emerald-400' : 'bg-slate-700'}`} />
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium">{b.name}</div>
                      <div className="text-[9px] text-slate-600 truncate">{b.desc}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {tab === 'alerts' && (
            <div className="p-2 space-y-1.5">
              {/* Monitor status strip */}
              {monitorStatus && (
                <div className="flex items-center gap-2 px-2 py-2 rounded-lg border border-slate-800 bg-slate-900/60 mb-2">
                  <span className={`w-2 h-2 rounded-full ${monitorStatus.running ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
                  <span className="text-[10px] text-slate-400">
                    {monitorStatus.running ? '監控中' : '已停止'}
                  </span>
                  <div className="flex-1" />
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${RISK_COLOR[monitorStatus.ddosRisk] || ''}`}>
                    DDoS: {monitorStatus.ddosRisk}
                  </span>
                </div>
              )}
              {alerts.length === 0 ? (
                <div className="text-center py-8 text-[10px] text-slate-600">暫無安全警報</div>
              ) : alerts.map(a => (
                <div key={a.id} className={`px-2.5 py-2 rounded-lg border text-[10px] ${ALERT_COLORS[a.level] || ''}`}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="font-mono text-[8px] opacity-70">{a.level}</span>
                    <span className="font-medium">{a.title}</span>
                  </div>
                  <div className="text-[9px] opacity-60 line-clamp-2">{a.detail}</div>
                  <div className="text-[8px] opacity-40 mt-0.5">{new Date(a.ts).toLocaleTimeString('zh-TW')}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col border border-slate-800 rounded-xl bg-slate-900/20 overflow-hidden">
        {tab === 'groups' ? (
          <>
            {/* Group message header */}
            <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900/40">
              <span className="text-lg">💬</span>
              <div>
                <div className="text-xs font-medium text-slate-300">{selectedGroupName}</div>
                <div className="text-[9px] text-slate-600">
                  {selectedGroup ? `ID: ${selectedGroup}` : '← 從左側選擇群組'}
                </div>
              </div>
              <div className="flex-1" />
              {selectedGroup && (
                <button
                  onClick={fetchMessages}
                  className="text-[9px] px-2 py-1 border border-slate-700 rounded text-slate-500 hover:text-cyan-400 hover:border-cyan-800 transition-all"
                >
                  🔄 刷新
                </button>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {!selectedGroup ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
                  <span className="text-4xl">📡</span>
                  <span className="text-xs">選擇左側群組查看訊息</span>
                  <span className="text-[10px] text-slate-700">Win Bot 自動監控所有加入的群組</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-8 text-[10px] text-slate-600">此群組暫無訊息記錄</div>
              ) : messages.map(m => (
                <div key={m.id} className={`flex gap-2 ${m.from === 'SD (面板)' ? 'flex-row-reverse' : ''}`}>
                  <div className={`max-w-[75%] rounded-xl px-3 py-2 ${m.from === 'SD (面板)' ? 'bg-cyan-950/50 border border-cyan-800/40' : 'bg-slate-800/60 border border-slate-700/40'}`}>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] font-medium text-cyan-400">{m.from}</span>
                      {m.username && <span className="text-[9px] text-slate-600">@{m.username}</span>}
                      <span className="text-[8px] text-slate-700">{new Date(m.ts).toLocaleTimeString('zh-TW')}</span>
                    </div>
                    <div className="text-[11px] text-slate-300 whitespace-pre-wrap break-words">{m.text}</div>
                  </div>
                </div>
              ))}
              <div ref={msgEndRef} />
            </div>

            {/* Send input */}
            {selectedGroup && (
              <div className="shrink-0 px-4 py-3 border-t border-slate-800 bg-slate-900/40">
                <div className="flex gap-2">
                  <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendToGroup()}
                    placeholder="透過 Win Bot 發送訊息到此群組..."
                    className="flex-1 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-700 transition-colors"
                  />
                  <button
                    onClick={sendToGroup}
                    disabled={sending || !input.trim()}
                    className="px-4 py-2 rounded-lg text-xs font-medium bg-cyan-950/50 border border-cyan-800/60 text-cyan-400 hover:bg-cyan-900/50 hover:border-cyan-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    {sending ? '⏳' : '📤'} 發送
                  </button>
                </div>
                <div className="text-[9px] text-slate-700 mt-1">訊息將以 SD Bot 身份發送到群組</div>
              </div>
            )}
          </>
        ) : tab === 'bots' ? (
          <>
            {/* Bot chat area */}
            <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900/40">
              <span className="text-lg">🤖</span>
              <div>
                <div className="text-xs font-medium text-slate-300">
                  與 {bots.find(b => b.key === selectedBot)?.name || selectedBot} 交互
                </div>
                <div className="text-[9px] text-slate-600">
                  {bots.find(b => b.key === selectedBot)?.desc || ''}
                </div>
              </div>
            </div>

            {/* Bot chat messages - use botChatQueue */}
            <BotChatMessages botKey={selectedBot} />

            {/* Bot chat input */}
            <div className="shrink-0 px-4 py-3 border-t border-slate-800 bg-slate-900/40">
              <div className="flex gap-2">
                <input
                  value={botChatInput}
                  onChange={e => setBotChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && chatWithBot()}
                  placeholder={`與 ${bots.find(b => b.key === selectedBot)?.name || 'Bot'} 對話...`}
                  className="flex-1 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-violet-700 transition-colors"
                />
                <button
                  onClick={chatWithBot}
                  disabled={sending || !botChatInput.trim()}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-violet-950/50 border border-violet-800/60 text-violet-400 hover:bg-violet-900/50 hover:border-violet-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  發送
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Alerts detail view */
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl">🚨</span>
              <div>
                <div className="text-sm font-medium text-slate-300">安全監控中心</div>
                <div className="text-[10px] text-slate-600">
                  自動偵測 SSH 暴力破解、惡意掃描、DDoS 攻擊 · 全量 TG 播報
                </div>
              </div>
              <div className="flex-1" />
              {monitorStatus?.ddosRisk === 'HIGH' && (
                <button
                  onClick={async () => {
                    await fetch('/api/monitor/ddos-shield', { method: 'POST' })
                    fetchAlerts()
                  }}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-medium bg-red-950/50 border border-red-800/60 text-red-400 hover:bg-red-900/50 animate-pulse"
                >
                  🛡 啟用 DO 雲盾
                </button>
              )}
              <button
                onClick={fetchAlerts}
                className="text-[9px] px-2 py-1 border border-slate-700 rounded text-slate-500 hover:text-cyan-400 transition-all"
              >
                🔄 刷新
              </button>
            </div>

            {/* Stats cards */}
            {monitorStatus && (
              <div className="grid grid-cols-4 gap-3 mb-4">
                <StatMini label="總警報" value={String(monitorStatus.totalAlerts)} />
                <StatMini label="嚴重" value={String(monitorStatus.recentCritical)} color={monitorStatus.recentCritical > 0 ? 'text-red-400' : undefined} />
                <StatMini label="高危" value={String(monitorStatus.recentHigh)} color={monitorStatus.recentHigh > 0 ? 'text-orange-400' : undefined} />
                <StatMini label="DDoS 風險" value={monitorStatus.ddosRisk} color={monitorStatus.ddosRisk === 'HIGH' ? 'text-red-400' : monitorStatus.ddosRisk === 'MEDIUM' ? 'text-yellow-400' : 'text-emerald-400'} />
              </div>
            )}

            <div className="space-y-2">
              {alerts.map(a => (
                <div key={a.id} className={`rounded-xl border px-3 py-2.5 ${ALERT_COLORS[a.level] || ''}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-mono opacity-70">[{a.category}]</span>
                    <span className="text-[9px] font-mono opacity-70">{a.level}</span>
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
      </div>
    </div>
  )
}

function StatMini({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-center">
      <div className="text-[9px] text-slate-600">{label}</div>
      <div className={`text-sm font-mono font-bold ${color || 'text-slate-300'}`}>{value}</div>
    </div>
  )
}

function BotChatMessages({ botKey }: { botKey: string }) {
  const [queue, setQueue] = useState<Array<{ id: number; from: string; text: string; ts: string; direction: string }>>([])
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const r = await fetch('/api/bot/chat')
        const d = await r.json()
        setQueue(d.queue || [])
      } catch {}
    }
    fetch_()
    const t = setInterval(fetch_, 4000)
    return () => clearInterval(t)
  }, [botKey])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [queue])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
      {queue.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
          <span className="text-4xl">🤖</span>
          <span className="text-xs">輸入命令與 Bot 交互</span>
          <span className="text-[10px] text-slate-700">/help · /forward · /sd · /winstatus</span>
        </div>
      ) : queue.map(m => (
        <div key={m.id} className={`flex gap-2 ${m.direction === 'in' ? '' : 'flex-row-reverse'}`}>
          <div className={`max-w-[75%] rounded-xl px-3 py-2 ${m.direction === 'out' ? 'bg-violet-950/40 border border-violet-800/40' : 'bg-slate-800/60 border border-slate-700/40'}`}>
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
