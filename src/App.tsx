import { useState, useEffect, useRef, useCallback } from 'react'
import PinGate from './components/PinGate'
import MyDevicePanel from './components/MyDevicePanel'
import TeammatePanel from './components/TeammatePanel'
import AIIntelPanel from './components/AIIntelPanel'
import AuditReport, { AuditData } from './components/AuditReport'
import SettingsPanel from './components/SettingsPanel'
import DOShieldPanel from './components/DOShieldPanel'
import TaskPanel from './components/TaskPanel'
import TeamStatus from './components/TeamStatus'

type Page = 'device' | 'teammate' | 'ai' | 'audit' | 'tasks' | 'do' | 'settings'

interface LogLine {
  id: number
  type: 'stdout' | 'stderr' | 'info' | 'error' | 'start' | 'done'
  text: string
}

let lineId = 0

export default function App() {
  const [unlocked, setUnlocked] = useState(() => !!sessionStorage.getItem('bt-pin-token'))
  const [connected, setConnected] = useState(false)
  const [running, setRunning] = useState(false)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [activeLabel, setActiveLabel] = useState<string | null>(null)
  const [lines, setLines] = useState<LogLine[]>([])
  const [page, setPage] = useState<Page>('device')
  const [auditData, setAuditData] = useState<AuditData | null>(null)
  const [auditLoading, setAuditLoading] = useState(false)
  const [botRunning, setBotRunning] = useState(false)
  const [firewallEnabled, setFirewallEnabled] = useState<boolean | null>(null)
  const [stealthEnabled, setStealthEnabled] = useState<boolean | null>(null)
  const [listenPortCount, setListenPortCount] = useState<number | null>(null)
  const [lanDeviceCount, setLanDeviceCount] = useState<number | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const runBufRef = useRef<{ tool: string; lines: LogLine[] } | null>(null)

  const addLine = useCallback((type: LogLine['type'], text: string) => {
    const line: LogLine = { id: lineId++, type, text }
    setLines(prev => [...prev, line])
    if (runBufRef.current) runBufRef.current.lines.push(line)
  }, [])

  useEffect(() => {
    const check = () => {
      fetch('/api/status').then(r => r.json()).then(d => setBotRunning(d.botRunning ?? false)).catch(() => {})
    }
    check()
    const t = setInterval(check, 5000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const connect = () => {
      const ws = new WebSocket(`${proto}://${window.location.host}/ws`)
      wsRef.current = ws
      ws.onopen = () => setConnected(true)
      ws.onclose = () => { setConnected(false); setRunning(false); setTimeout(connect, 3000) }
      ws.onmessage = (e: MessageEvent) => {
        const msg = JSON.parse(e.data)
        switch (msg.type) {
          case 'start':
            setRunning(true)
            setActiveTool(msg.tool)
            setActiveLabel(msg.label)
            setLines([])
            runBufRef.current = { tool: msg.tool, lines: [] }
            addLine('start', `▶ ${msg.label}`)
            break
          case 'stdout':
            msg.text.split('\n').filter(Boolean).forEach((l: string) => addLine('stdout', l))
            break
          case 'stderr':
            msg.text.split('\n').filter(Boolean).forEach((l: string) => addLine('stderr', l))
            break
          case 'done': {
            setRunning(false)
            addLine('done', `■ exit code: ${msg.code}`)
            const buf = runBufRef.current
            if (buf) {
              const outLines = buf.lines.filter(l => l.type === 'stdout').map(l => l.text)
              if (buf.tool === 'firewall_status') setFirewallEnabled(outLines.join(' ').toLowerCase().includes('enabled'))
              if (buf.tool === 'fw_enable') setFirewallEnabled(msg.code === 0)
              if (buf.tool === 'stealth_mode') setStealthEnabled(msg.code === 0)
              if (buf.tool === 'open_ports') setListenPortCount(outLines.filter(l => l.trim()).length)
              if (buf.tool === 'arp_scan') {
                const count = outLines.filter(l => /^\d+\.\d+\.\d+\.\d+\s+[0-9a-f:]{17}/i.test(l)).length
                if (count > 0) setLanDeviceCount(count)
              }
            }
            runBufRef.current = null
            break
          }
          case 'error':
            setRunning(false)
            addLine('error', `✖ ${msg.text}`)
            runBufRef.current = null
            break
        }
      }
    }
    connect()
    return () => wsRef.current?.close()
  }, [addLine])

  const runTool = useCallback((id: string) => {
    if (!connected || running) return
    wsRef.current?.send(JSON.stringify({ type: 'run', tool: id }))
  }, [connected, running])

  const clearTerminal = useCallback(() => {
    setLines([])
    setActiveTool(null)
    setActiveLabel(null)
  }, [])

  const runAudit = async () => {
    setAuditLoading(true)
    setAuditData(null)
    setPage('audit')
    try {
      const r = await fetch('/api/audit')
      const data: AuditData = await r.json()
      setAuditData(data)
      if (data.security) { setFirewallEnabled(data.security.firewallEnabled); setStealthEnabled(data.security.stealthEnabled) }
      if (data.listenPorts) setListenPortCount(data.listenPorts.length)
      if (data.devices) setLanDeviceCount(data.devices.length)
    } catch {}
    setAuditLoading(false)
  }

  const NAV: { id: Page; label: string; icon: string; color: string }[] = [
    { id: 'device',   label: '我的設備',   icon: '🖥',  color: 'cyan' },
    { id: 'teammate', label: '隊友防護',   icon: '🛡',  color: 'emerald' },
    { id: 'ai',       label: 'AI 分析',    icon: '🤖',  color: 'violet' },
    { id: 'audit',    label: '稽查報告',   icon: '📋',  color: 'amber' },
    { id: 'tasks',    label: '藍隊任務',   icon: '⚡',  color: 'rose' },
    { id: 'do',       label: 'DO 雲盾',    icon: '☁',   color: 'blue' },
    { id: 'settings', label: '設定',       icon: '⚙',   color: 'slate' },
  ]

  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} />

  const activeColor: Record<string, string> = {
    cyan:    'bg-cyan-950/70 text-cyan-300 border-cyan-700/80 shadow-cyan-900/30',
    emerald: 'bg-emerald-950/70 text-emerald-300 border-emerald-700/80 shadow-emerald-900/30',
    violet:  'bg-violet-950/70 text-violet-300 border-violet-700/80 shadow-violet-900/30',
    amber:   'bg-amber-950/70 text-amber-300 border-amber-700/80 shadow-amber-900/30',
    rose:    'bg-rose-950/70 text-rose-300 border-rose-700/80 shadow-rose-900/30',
    blue:    'bg-blue-950/70 text-blue-300 border-blue-700/80 shadow-blue-900/30',
    slate:   'bg-slate-800/70 text-slate-300 border-slate-600/80 shadow-slate-900/30',
  }

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden text-slate-300"
      style={{ background: 'radial-gradient(ellipse at 20% 40%, #030d1c 0%, #010306 100%)' }}
    >
      {/* Top navigation bar */}
      <header
        className="shrink-0 flex items-center gap-0 px-4 border-b border-slate-900/80 h-14"
        style={{ background: 'rgba(2,6,18,0.95)' }}
      >
        <div className="flex items-center gap-2.5 mr-5">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-sm tracking-[5px] text-slate-300 uppercase font-bold">BLUE TEAM</span>
        </div>

        <nav className="flex items-center gap-1.5">
          {NAV.map(n => (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all border shadow-sm ${
                page === n.id
                  ? activeColor[n.color]
                  : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/60 border-transparent'
              }`}
            >
              <span className="text-base">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>

        <div className="flex-1" />

        <div className="flex items-center gap-4 text-[11px] font-mono">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-500 animate-pulse'}`} />
            <span className={connected ? 'text-emerald-400' : 'text-red-400'}>
              {connected ? 'WS 已連線' : 'WS 離線'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${botRunning ? 'bg-cyan-400 animate-pulse' : 'bg-slate-700'}`} />
            <span className={botRunning ? 'text-cyan-400' : 'text-slate-600'}>
              {botRunning ? 'Bot ✓' : 'Bot ✗'}
            </span>
          </div>
          {running && (
            <div className="flex items-center gap-1.5 text-amber-400">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              執行中…
            </div>
          )}
        </div>
      </header>

      {/* Team status bar */}
      <div className="shrink-0 px-5 pt-4">
        <TeamStatus />
      </div>

      {/* Main content */}
      <main className="flex-1 min-h-0 p-5 overflow-hidden">
        {page === 'device' && (
          <MyDevicePanel
            connected={connected}
            running={running}
            lines={lines}
            activeLabel={activeLabel}
            onRunTool={runTool}
            onClear={clearTerminal}
            firewallEnabled={firewallEnabled}
            stealthEnabled={stealthEnabled}
            listenPortCount={listenPortCount}
            lanDeviceCount={lanDeviceCount}
          />
        )}
        {page === 'teammate' && <TeammatePanel botRunning={botRunning} />}
        {page === 'ai' && <AIIntelPanel auditData={auditData} botRunning={botRunning} />}
        {page === 'audit' && <AuditReport data={auditData} loading={auditLoading} onRun={runAudit} />}
        {page === 'tasks' && <TaskPanel />}
        {page === 'do' && <DOShieldPanel />}
        {page === 'settings' && <SettingsPanel />}
      </main>

      {/* Footer */}
      <footer
        className="shrink-0 flex items-center px-5 h-7 border-t border-slate-900/60 text-[9px] font-mono text-slate-700"
        style={{ background: 'rgba(2,6,18,0.9)' }}
      >
        <span>藍隊安全防護控制台</span>
        <span className="mx-3">·</span>
        <span>零信任模式 — 預設不可信</span>
        <div className="flex-1" />
        {activeTool && <span className="text-slate-600">上次工具: {activeTool}</span>}
      </footer>
    </div>
  )
}
