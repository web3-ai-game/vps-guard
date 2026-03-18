interface Network {
  ip: string
  mask: string
  mac: string
  gateway: string
  dns: string[]
}

interface WiFi {
  ssid: string
  bssid: string
  signal: string
  channel: string
  authMode: string
  phyMode: string
}

interface Security {
  firewallEnabled: boolean
  stealthEnabled: boolean
}

interface ListenPort {
  port: string
  process: string
  addr: string
}

interface Connection {
  local: string
  remote: string
}

interface Device {
  ip: string
  mac: string
  vendor: string
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
  wifi: WiFi
  security: Security
  listenPorts: ListenPort[]
  established: Connection[]
  devices: Device[]
  arpScanAvailable: boolean
  findings: Finding[]
  score: number
  verdict: string
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

  lines.push('# WiFi Zero Trust Audit Report')
  lines.push(`> Generated: ${t}  |  Host: ${data.hostname}  |  OS: ${data.os}`)
  lines.push('')
  lines.push(`## Verdict: ${data.verdict}  (Security Score: ${data.score}/100)`)
  lines.push('')
  lines.push('## Network Environment')
  lines.push(`- **SSID**: ${data.wifi.ssid}`)
  lines.push(`- **BSSID**: ${data.wifi.bssid}`)
  lines.push(`- **Auth**: ${data.wifi.authMode}  |  Channel: ${data.wifi.channel}  |  Signal: ${data.wifi.signal} dBm`)
  lines.push(`- **IP**: ${data.network.ip}  |  Gateway: ${data.network.gateway}`)
  lines.push(`- **DNS**: ${data.network.dns.join(', ') || 'N/A'}`)
  lines.push('')
  lines.push('## Security Posture')
  lines.push(`- Firewall: ${data.security.firewallEnabled ? '✅ Enabled' : '❌ Disabled'}`)
  lines.push(`- Stealth Mode: ${data.security.stealthEnabled ? '✅ Enabled' : '❌ Disabled'}`)
  lines.push(`- Listening Ports: ${data.listenPorts.length}`)
  lines.push(`- Active Connections: ${data.established.length}`)
  lines.push('')
  lines.push(`## LAN Devices (${data.devices.length})`)
  lines.push('| IP | MAC | Vendor |')
  lines.push('|---|---|---|')
  for (const d of data.devices) lines.push(`| ${d.ip} | ${d.mac} | ${d.vendor || '—'} |`)
  lines.push('')
  lines.push('## Findings')
  for (const f of data.findings) {
    lines.push(`### [${f.level}] ${f.title}`)
    lines.push(f.detail)
    lines.push(`> **Fix**: ${f.fix}`)
    lines.push('')
  }
  lines.push('---')
  lines.push('*Zero Trust Principle: All WiFi networks are untrusted by default.*')

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `zero-trust-audit-${Date.now()}.md`
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
          全量 WiFi 稽查審計<br />
          <span className="text-slate-600">— 零信任 · 預設不可信 —</span>
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

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Report header */}
      <div className="shrink-0 flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
        <div>
          <div className="text-xs font-mono text-slate-300">WiFi Zero Trust Audit</div>
          <div className="text-[10px] text-slate-600 mt-0.5">{t} · {data.hostname} · {data.os}</div>
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
            EXPORT .MD
          </button>
          <button
            onClick={onRun}
            className="px-2.5 py-1 rounded text-[9px] font-mono border border-slate-700 text-slate-500 hover:text-cyan-400 hover:border-cyan-800 transition-all"
          >
            RESCAN
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

        {/* WiFi info */}
        <Section title="WiFi 環境">
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-3 py-2.5 space-y-0.5">
            <KV label="SSID" value={data.wifi.ssid} highlight="text-amber-300" />
            <KV label="BSSID" value={data.wifi.bssid} />
            <KV label="Auth" value={data.wifi.authMode || '—'} highlight={data.wifi.authMode.toLowerCase().includes('wpa3') ? 'text-emerald-400' : data.wifi.authMode.toLowerCase().includes('wpa2') ? 'text-yellow-400' : 'text-red-400'} />
            <KV label="Channel" value={data.wifi.channel} />
            <KV label="Signal" value={`${data.wifi.signal} dBm`} />
            <KV label="PHY Mode" value={data.wifi.phyMode} />
          </div>
        </Section>

        {/* Network config */}
        <Section title="網路配置">
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-3 py-2.5 space-y-0.5">
            <KV label="IP" value={data.network.ip} />
            <KV label="Netmask" value={data.network.mask} />
            <KV label="Gateway" value={data.network.gateway} />
            <KV label="MAC" value={data.network.mac} />
            <KV label="DNS" value={data.network.dns.join(', ') || 'N/A'} highlight={data.network.dns.some(d => !d.startsWith('192.168') && !d.startsWith('10.')) ? 'text-yellow-400' : 'text-slate-300'} />
          </div>
        </Section>

        {/* Security posture */}
        <Section title="本機安全態勢">
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-3 py-2.5 space-y-0.5">
            <KV label="Firewall" value={data.security.firewallEnabled ? '✅ Enabled' : '❌ Disabled'} highlight={data.security.firewallEnabled ? 'text-emerald-400' : 'text-red-400'} mono={false} />
            <KV label="Stealth Mode" value={data.security.stealthEnabled ? '✅ Enabled' : '❌ Disabled'} highlight={data.security.stealthEnabled ? 'text-emerald-400' : 'text-orange-400'} mono={false} />
            <KV label="Listen Ports" value={String(data.listenPorts.length)} highlight={data.listenPorts.length > 0 ? 'text-orange-400' : 'text-emerald-400'} />
            <KV label="Connections" value={String(data.established.length)} highlight={data.established.length > 20 ? 'text-yellow-400' : 'text-slate-300'} />
          </div>
          {data.listenPorts.length > 0 && (
            <div className="mt-2 rounded-xl border border-slate-800 bg-black/30 px-3 py-2">
              <div className="text-[9px] text-slate-600 mb-1.5">監聽端口詳情</div>
              {data.listenPorts.map((p, i) => (
                <div key={i} className="flex items-center gap-3 py-0.5">
                  <span className="font-mono text-[10px] text-orange-400 w-12">{p.port}</span>
                  <span className="font-mono text-[10px] text-slate-400">{p.process}</span>
                  <span className="font-mono text-[9px] text-slate-600 truncate">{p.addr}</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* LAN devices */}
        <Section title={`LAN 設備 (${data.devices.length}${data.arpScanAvailable ? ' · arp-scan' : ' · arp cache'})`}>
          {data.devices.length === 0 ? (
            <div className="text-[10px] text-slate-600 px-1">無可用數據 — 執行 ARP Scan 工具後重新稽查</div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/30 overflow-hidden">
              <table className="w-full text-[10px] font-mono">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left text-slate-600 px-3 py-1.5 font-normal">IP</th>
                    <th className="text-left text-slate-600 px-3 py-1.5 font-normal">MAC</th>
                    <th className="text-left text-slate-600 px-3 py-1.5 font-normal">Vendor</th>
                  </tr>
                </thead>
                <tbody>
                  {data.devices.map((d, i) => (
                    <tr key={i} className="border-b border-slate-900 last:border-0">
                      <td className="px-3 py-1 text-cyan-300">{d.ip}</td>
                      <td className="px-3 py-1 text-slate-400">{d.mac}</td>
                      <td className="px-3 py-1 text-slate-500 truncate max-w-[160px]">{d.vendor || '—'}</td>
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
          ZERO TRUST — All WiFi networks are untrusted by default
        </div>
      </div>
    </div>
  )
}
