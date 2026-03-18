import { useState } from 'react'
import Terminal from './Terminal'

interface LogLine {
  id: number
  type: 'stdout' | 'stderr' | 'info' | 'error' | 'start' | 'done'
  text: string
}

interface Props {
  connected: boolean
  running: boolean
  lines: LogLine[]
  activeLabel: string | null
  onRunTool: (id: string) => void
  onClear: () => void
  firewallEnabled: boolean | null
  stealthEnabled: boolean | null
  listenPortCount: number | null
  lanDeviceCount: number | null
}

const TOOLS = [
  { id: 'fw_status',      icon: '🛡', label: '防火牆狀態',     desc: 'UFW 防火牆詳細狀態',     color: 'emerald' },
  { id: 'fw_rules',       icon: '�', label: '防火牆規則',     desc: 'UFW 規則編號列表',       color: 'emerald' },
  { id: 'stealth_mode',   icon: '👁', label: '開啟隱身模式',   desc: 'iptables 阻擋 ICMP 探測', color: 'purple' },
  { id: 'open_ports',     icon: '🔍', label: '開放端口探測',   desc: 'ss -tlnp 監聽端口',      color: 'amber' },
  { id: 'self_scan',      icon: '�', label: '自我端口掃描',   desc: 'nmap 掃描 top 30 端口',  color: 'indigo' },
  { id: 'connections',    icon: '�', label: '活躍連線',       desc: 'ss -tnp 所有 TCP 連線',  color: 'red' },
  { id: 'net_info',       icon: '🌐', label: '網路配置',       desc: 'IP / 接口 / MAC',        color: 'sky' },
  { id: 'route_table',    icon: '🗺', label: '路由表',         desc: '出站路由規則',            color: 'orange' },
  { id: 'neighbors',      icon: '📡', label: '網路鄰居',       desc: 'ARP 鄰居探測',           color: 'cyan' },
  { id: 'fail2ban',       icon: '🚫', label: 'Fail2Ban 狀態', desc: '暴力破解防護狀態',        color: 'rose' },
  { id: 'sys_resources',  icon: '📊', label: '系統資源',       desc: 'CPU / 記憶體 / 磁碟',    color: 'teal' },
  { id: 'recent_logins',  icon: '👤', label: '最近登入',       desc: '最近 20 筆登入記錄',     color: 'violet' },
]

const ONE_CLICK_SUITE = ['fw_status', 'stealth_mode', 'open_ports']

const COLOR_MAP: Record<string, string> = {
  emerald: 'border-emerald-800/50 hover:border-emerald-600 hover:bg-emerald-950/40',
  purple:  'border-purple-800/50 hover:border-purple-600 hover:bg-purple-950/40',
  amber:   'border-amber-800/50 hover:border-amber-600 hover:bg-amber-950/40',
  cyan:    'border-cyan-800/50 hover:border-cyan-600 hover:bg-cyan-950/40',
  indigo:  'border-indigo-800/50 hover:border-indigo-600 hover:bg-indigo-950/40',
  sky:     'border-sky-800/50 hover:border-sky-600 hover:bg-sky-950/40',
  orange:  'border-orange-800/50 hover:border-orange-600 hover:bg-orange-950/40',
  red:     'border-red-800/50 hover:border-red-600 hover:bg-red-950/40',
  rose:    'border-rose-800/50 hover:border-rose-600 hover:bg-rose-950/40',
  teal:    'border-teal-800/50 hover:border-teal-600 hover:bg-teal-950/40',
  violet:  'border-violet-800/50 hover:border-violet-600 hover:bg-violet-950/40',
}

function StatCard({ label, value, ok, icon }: { label: string; value: string; ok?: boolean; icon: string }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
      <span className="text-xl">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] text-slate-600 uppercase tracking-wider">{label}</div>
        <div className={`text-sm font-mono font-medium truncate ${ok === true ? 'text-emerald-400' : ok === false ? 'text-red-400' : 'text-slate-300'}`}>
          {value}
        </div>
      </div>
    </div>
  )
}

export default function MyDevicePanel({ connected, running, lines, activeLabel, onRunTool, onClear, firewallEnabled, stealthEnabled, listenPortCount, lanDeviceCount }: Props) {
  const [showTerminal, setShowTerminal] = useState(true)

  const runSuite = () => {
    if (!connected || running) return
    ONE_CLICK_SUITE.forEach((id, i) => {
      setTimeout(() => onRunTool(id), i * 2500)
    })
  }

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      {/* Status cards */}
      <div className="grid grid-cols-4 gap-3 shrink-0">
        <StatCard label="防火牆" value={firewallEnabled === null ? '—' : firewallEnabled ? '已啟用' : '未啟用'} ok={firewallEnabled ?? undefined} icon="🛡" />
        <StatCard label="隱身模式" value={stealthEnabled === null ? '—' : stealthEnabled ? '已啟用' : '未啟用'} ok={stealthEnabled ?? undefined} icon="👁" />
        <StatCard label="監聽端口" value={listenPortCount === null ? '—' : `${listenPortCount} 個`} ok={listenPortCount !== null ? listenPortCount === 0 : undefined} icon="🔍" />
        <StatCard label="LAN 設備" value={lanDeviceCount === null ? '—' : `${lanDeviceCount} 台`} ok={lanDeviceCount !== null ? lanDeviceCount <= 5 : undefined} icon="📡" />
      </div>

      {/* One-click suite */}
      <div className="shrink-0">
        <button
          onClick={runSuite}
          disabled={!connected || running}
          className="w-full py-3 rounded-xl text-sm font-mono border border-emerald-800/60 bg-emerald-950/30 text-emerald-400 hover:bg-emerald-900/40 hover:border-emerald-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <span className="text-lg">🛡</span>
          一鍵安全檢查（防火牆 + 隱身 + 端口掃描）
        </button>
      </div>

      {/* Tool grid */}
      <div className="grid grid-cols-4 gap-3 shrink-0">
        {TOOLS.map(t => (
          <button
            key={t.id}
            onClick={() => onRunTool(t.id)}
            disabled={!connected || running}
            className={`rounded-xl border bg-slate-900/40 px-3 py-3 flex flex-col items-center gap-2 text-center transition-all disabled:opacity-30 disabled:cursor-not-allowed ${COLOR_MAP[t.color]}`}
          >
            <span className="text-2xl">{t.icon}</span>
            <span className="text-[11px] font-medium text-slate-200 leading-tight">{t.label}</span>
            <span className="text-[9px] text-slate-600 leading-tight">{t.desc}</span>
          </button>
        ))}
      </div>

      {/* Terminal toggle */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setShowTerminal(v => !v)}
          className="text-[10px] font-mono text-slate-600 hover:text-slate-400 border border-slate-800 rounded px-2 py-1 transition-colors"
        >
          {showTerminal ? '▼ 收起輸出' : '▲ 展開輸出'}
        </button>
        {activeLabel && <span className="text-[10px] text-cyan-600 font-mono truncate">{activeLabel}</span>}
        {running && <span className="flex items-center gap-1 text-[10px] text-emerald-500"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />執行中</span>}
        <div className="flex-1" />
        {showTerminal && (
          <button onClick={onClear} className="text-[10px] text-slate-700 hover:text-slate-500 border border-slate-800 rounded px-2 py-1 transition-colors">
            清除
          </button>
        )}
      </div>

      {showTerminal && (
        <div className="flex-1 min-h-0 rounded-xl border border-slate-800 overflow-hidden">
          <Terminal lines={lines} running={running} activeLabel={activeLabel} />
        </div>
      )}
    </div>
  )
}
