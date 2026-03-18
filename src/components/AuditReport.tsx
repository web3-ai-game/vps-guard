interface NetInterface {
  name: string
  ip: string
  prefix: string
  mac: string
}

interface Network {
  ip: string
  iface?: string
  mac: string
  gateway: string
  dns: string[]
  interfaces?: NetInterface[]
  mask?: string
}

interface Security {
  firewallEnabled: boolean
  stealthEnabled: boolean
  ufwDefault?: string
  fail2banActive?: boolean
  fail2banJails?: number
}

interface ListenPort {
  port: string
  process: string
  addr: string
  public?: boolean
}

interface Connection {
  local: string
  remote: string
  process?: string
}

interface Device {
  ip: string
  mac: string
  vendor?: string
  state?: string
}

interface Finding {
  level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'INFO'
  code: string
  title: string
  detail: string
  fix: string
}

export interface AuditData {
  generatedAt: string
  hostname: string
  os: string
  network: Network
  wifi: unknown
  security: Security
  listenPorts: ListenPort[]
  established: Connection[]
  devices: Device[]
  arpScanAvailable?: boolean
  findings: Finding[]
  score: number
  verdict: string
  uptime?: string
  memory?: string
}

const LEVEL_STYLE: Record<string, string> = {
  CRITICAL: 'bg-red-950/60 border-red-800/60 text-red-400',
  HIGH:     'bg-orange-950/60 border-orange-800/60 text-orange-400',
  MEDIUM:   'bg-yellow-950/40 border-yellow-800/40 text-yellow-400',
  INFO:     'bg-slate-900/40 border-slate-700/40 text-slate-400',
}

const LEVEL_DOT: Record<string, string> = {
  CRITICAL: 'bg-red-500',
  HIGH:     'bg-orange-500',
  MEDIUM:   'bg-yellow-500',
  INFO:     'bg-slate-500',
}

const VERDICT_COLOR: Record<string, string> = {
  CRITICAL:   'text-red-400',
  'HIGH RISK':'text-orange-400',
  MODERATE:   'text-yellow-400',
  ACCEPTABLE: 'text-emerald-400',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="text-[9px] tracking-[4px] text-slate-600 uppercase mb-2 font-mono">{title}</div>
      {children}
    </div>
  )
}

function KV({ label, value, mono = true, highlight }: { label: string; value: string; mono?: boolean; highlight?: string }) {
  return (
    <div className="flex items-start gap-3 py-0.5">
      <span className="text-[10px] text-slate-600 w-28 shrink-0">{label}</span>
      <span className={`text-[11px] ${mono ? 'font-mono' : ''} ${highlight ?? 'text-slate-300'}`}>{value}</span>
    </div>
  )
}

function exportMarkdown(data: AuditData) {
  const lines: string[] = []
  const t = new Date(data.generatedAt).toLocaleString()

  lines.push('# VPS 零信任安全稽查報告')
  lines.push(`> 產生時間: ${t}  |  主機: ${data.hostname}  |  系統: ${data.os}`)
  if (data.uptime) lines.push(`> 運行時間: ${data.uptime}`)
  lines.push('')
  lines.push(`## 評定: ${data.verdict}  (安全評分: ${data.score}/100)`)
  lines.push('')
  lines.push('## 網路配置')
  lines.push(`- **IP**: ${data.network.ip}  |  接口: ${data.network.iface || ''}`)
  lines.push(`- **閘道**: ${data.network.gateway}  |  MAC: ${data.network.mac}`)
  lines.push(`- **DNS**: ${data.network.dns?.join(', ') || 'N/A'}`)
  if (data.network.interfaces?.length) {
    lines.push('### 網路接口')
    for (const iface of data.network.interfaces) lines.push(`- ${iface.name}: ${iface.ip}/${iface.prefix} (${iface.mac})`)
  }
  lines.push('')
  lines.push('## 安全態勢')
  lines.push(`- UFW 防火牆: ${data.security.firewallEnabled ? '✅ 已啟用' : '❌ 未啟用'}`)
  if (data.security.ufwDefault) lines.push(`- 預設策略: ${data.security.ufwDefault}`)
  lines.push(`- 隱身模式: ${data.security.stealthEnabled ? '✅ 已啟用' : '❌ 未啟用'}`)
  lines.push(`- Fail2Ban: ${data.security.fail2banActive ? `✅ 運行中 (${data.security.fail2banJails} 個監獄)` : '❌ 未運行'}`)
  lines.push(`- 監聽端口: ${data.listenPorts.length}`)
  lines.push(`- 活躍連線: ${data.established.length}`)
  lines.push('')
  if (data.listenPorts.length > 0) {
    lines.push('## 監聽端口')
    lines.push('| 端口 | 進程 | 地址 | 公網 |')
    lines.push('|------|------|------|------|')
    for (const p of data.listenPorts) lines.push(`| ${p.port} | ${p.process} | ${p.addr} | ${p.public ? '⚠ 是' : '否'} |`)
    lines.push('')
  }
  lines.push('## 發現項目')
  for (const f of data.findings) {
    lines.push(`### [${f.level}] ${f.title}`)
    lines.push(f.detail)
    lines.push(`> **修復**: ${f.fix}`)
    lines.push('')
  }
  lines.push('---')
  lines.push('*零信任原則：VPS 預設暴露於公網，所有入站流量必須嚴格過濾。*')

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `vps-audit-${Date.now()}.md`
  a.click()
  URL.revokeObjectURL(url)
}

export default function AuditReport({ data, loading, onRun }: {
  data: AuditData | null
  loading: boolean
  onRun: () => void
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-cyan-700 border-t-transparent animate-spin" />
        <div className="text-xs text-slate-500 font-mono">收集環境資料中 — 最多 15 秒…</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="text-4xl">🔎</div>
        <div className="text-xs text-slate-500 text-center leading-relaxed max-w-xs">
          VPS 全量安全稽查<br />
          <span className="text-slate-600">— 零信任 · 公網預設不可信 —</span>
        </div>
        <button
          onClick={onRun}
          className="mt-2 px-6 py-2.5 rounded-xl text-xs font-mono border border-cyan-800/60 bg-cyan-950/40 text-cyan-400 hover:border-cyan-600 hover:bg-cyan-900/40 transition-all"
        >
          ▶ 開始稽查
        </button>
      </div>
    )
  }

  const t = new Date(data.generatedAt).toLocaleString()
  const net = data.network || {} as Network

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Report header */}
      <div className="shrink-0 flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
        <div>
          <div className="text-xs font-mono text-slate-300">VPS 零信任安全稽查報告</div>
          <div className="text-[10px] text-slate-600 mt-0.5">{t} · {data.hostname} · {data.os}</div>
          {data.uptime && <div className="text-[10px] text-slate-600">⏱ {data.uptime}</div>}
        </div>
        <div className="flex items-center gap-2">
          <div className={`text-lg font-mono font-bold ${VERDICT_COLOR[data.verdict] ?? 'text-slate-400'}`}>
            {data.verdict}
          </div>
          <div className="text-[10px] text-slate-600 font-mono">{data.score}/100</div>
          <button
            onClick={() => exportMarkdown(data)}
            className="ml-2 px-2.5 py-1 rounded text-[9px] font-mono border border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600 transition-all"
          >
            匯出 .MD
          </button>
          <button
            onClick={onRun}
            className="px-2.5 py-1 rounded text-[9px] font-mono border border-slate-700 text-slate-500 hover:text-cyan-400 hover:border-cyan-800 transition-all"
          >
            重新掃描
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-1">

        {/* Score bar */}
        <Section title="安全評分">
          <div className="w-full h-2 rounded-full bg-slate-800 mb-1">
            <div
              className={`h-2 rounded-full transition-all ${
                data.score < 40 ? 'bg-red-500' : data.score < 60 ? 'bg-orange-500' : data.score < 80 ? 'bg-yellow-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${data.score}%` }}
            />
          </div>
          <div className="text-[10px] text-slate-600 font-mono">{data.score}/100 — {data.verdict}</div>
        </Section>

        {/* Network config */}
        <Section title="網路配置">
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-3 py-2.5 space-y-0.5">
            <KV label="IP" value={net.ip || '—'} />
            <KV label="主接口" value={net.iface || '—'} />
            <KV label="閘道" value={net.gateway || '—'} />
            <KV label="MAC" value={net.mac || '—'} />
            <KV label="DNS" value={net.dns?.join(', ') || 'N/A'} />
          </div>
          {net.interfaces && net.interfaces.length > 1 && (
            <div className="mt-2 rounded-xl border border-slate-800 bg-black/30 px-3 py-2">
              <div className="text-[9px] text-slate-600 mb-1.5">全部網路接口</div>
              {net.interfaces.map((iface, i) => (
                <div key={i} className="flex items-center gap-3 py-0.5">
                  <span className="font-mono text-[10px] text-cyan-400 w-12">{iface.name}</span>
                  <span className="font-mono text-[10px] text-slate-300">{iface.ip}/{iface.prefix}</span>
                  <span className="font-mono text-[9px] text-slate-600">{iface.mac}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Security posture */}
        <Section title="伺服器安全態勢">
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-3 py-2.5 space-y-0.5">
            <KV label="UFW 防火牆" value={data.security.firewallEnabled ? '✅ 已啟用' : '❌ 未啟用'} highlight={data.security.firewallEnabled ? 'text-emerald-400' : 'text-red-400'} mono={false} />
            {data.security.ufwDefault && <KV label="預設策略" value={data.security.ufwDefault} />}
            <KV label="隱身模式" value={data.security.stealthEnabled ? '✅ ICMP DROP' : '❌ 未啟用'} highlight={data.security.stealthEnabled ? 'text-emerald-400' : 'text-orange-400'} mono={false} />
            <KV label="Fail2Ban" value={data.security.fail2banActive ? `✅ 運行中 (${data.security.fail2banJails ?? 0} 個監獄)` : '❌ 未運行'} highlight={data.security.fail2banActive ? 'text-emerald-400' : 'text-red-400'} mono={false} />
            <KV label="監聽端口" value={String(data.listenPorts.length)} highlight={data.listenPorts.length > 5 ? 'text-orange-400' : 'text-slate-300'} />
            <KV label="活躍連線" value={String(data.established.length)} highlight={data.established.length > 30 ? 'text-yellow-400' : 'text-slate-300'} />
          </div>
          {data.listenPorts.length > 0 && (
            <div className="mt-2 rounded-xl border border-slate-800 bg-black/30 px-3 py-2">
              <div className="text-[9px] text-slate-600 mb-1.5">監聽端口詳情</div>
              {data.listenPorts.map((p, i) => (
                <div key={i} className="flex items-center gap-3 py-0.5">
                  <span className={`font-mono text-[10px] w-12 ${p.public ? 'text-red-400' : 'text-orange-400'}`}>{p.port}</span>
                  <span className="font-mono text-[10px] text-slate-400">{p.process}</span>
                  <span className="font-mono text-[9px] text-slate-600 truncate">{p.addr}</span>
                  {p.public && <span className="text-[8px] text-red-500 border border-red-900 rounded px-1">公網</span>}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Network neighbors */}
        <Section title={`網路鄰居 (${data.devices.length})`}>
          {data.devices.length === 0 ? (
            <div className="text-[10px] text-slate-600 px-1">無可用數據 — 執行「網路鄰居」工具後重新稽查</div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 overflow-hidden">
              <table className="w-full text-[10px] font-mono">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left text-slate-600 px-3 py-1.5 font-normal">IP</th>
                    <th className="text-left text-slate-600 px-3 py-1.5 font-normal">MAC</th>
                    <th className="text-left text-slate-600 px-3 py-1.5 font-normal">狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {data.devices.map((d, i) => (
                    <tr key={i} className="border-b border-slate-900 last:border-0">
                      <td className="px-3 py-1 text-cyan-300">{d.ip}</td>
                      <td className="px-3 py-1 text-slate-400">{d.mac}</td>
                      <td className="px-3 py-1 text-slate-500">{d.state || d.vendor || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Findings */}
        <Section title={`發現項目 (${data.findings.length})`}>
          <div className="space-y-2">
            {data.findings.map((f, i) => (
              <div key={i} className={`rounded-xl border px-3 py-2.5 ${LEVEL_STYLE[f.level]}`}>
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${LEVEL_DOT[f.level]}`} />
                  <span className="text-[9px] font-mono tracking-widest opacity-70">{f.level}</span>
                  <span className="text-[11px] font-medium">{f.title}</span>
                </div>
                <p className="text-[10px] opacity-70 leading-relaxed mb-1.5">{f.detail}</p>
                <div className="text-[9px] opacity-50 font-mono">→ {f.fix}</div>
              </div>
            ))}
          </div>
        </Section>

        <div className="text-[9px] text-slate-700 text-center pb-4 font-mono">
零信任 — VPS 公網預設不可信 · 所有入站流量必須過濾
        </div>
      </div>
    </div>
  )
}
