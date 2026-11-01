interface Device {
  ip: string
  mac: string
  vendor: string
  randomMac: boolean
}

interface DeviceListProps {
  devices: Device[]
  scannedAt: string | null
}

const VENDOR_ICONS: Record<string, string> = {
  samsung: '📱',
  apple: '🍎',
  intel: '💻',
  phaten: '📶',
  dragon: '📷',
  cloud: '🔀',
}

function vendorIcon(vendor: string): string {
  const v = vendor.toLowerCase()
  for (const [key, icon] of Object.entries(VENDOR_ICONS)) {
    if (v.includes(key)) return icon
  }
  return '❓'
}

function roleGuess(vendor: string, ip: string, randomMac: boolean): string {
  if (ip.endsWith('.1')) return 'Gateway / Router'
  if (randomMac) return 'Phone (MAC randomized)'
  const v = vendor.toLowerCase()
  if (v.includes('samsung')) return 'Android Phone'
  if (v.includes('apple')) return 'Apple Device'
  if (v.includes('intel')) return 'Laptop / PC'
  if (v.includes('phaten')) return 'WiFi AP (Hotel infra)'
  if (v.includes('dragon')) return 'IoT / IP Camera'
  if (v.includes('cloud')) return 'Network Equipment'
  return 'Unknown Device'
}

export function parseArpScan(lines: string[]): Device[] {
  const devices: Device[] = []
  const re = /^(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-f:]{17})\s+(.*)$/i
  for (const line of lines) {
    const m = line.match(re)
    if (!m) continue
    const [, ip, mac, vendor] = m
    const randomMac = vendor.toLowerCase().includes('locally administered')
    devices.push({ ip, mac, vendor: vendor.trim(), randomMac })
  }
  return devices
}

export default function DeviceList({ devices, scannedAt }: DeviceListProps) {
  if (devices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-600 text-xs gap-2">
        <span className="text-2xl">📡</span>
        <span>Run ARP Scan to discover devices</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-1 pb-2 shrink-0">
        <span className="text-[10px] text-slate-600">
          {devices.length} devices found
        </span>
        {scannedAt && (
          <span className="text-[10px] text-slate-700">{scannedAt}</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {devices.map((d) => (
          <div
            key={d.ip}
            className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2.5 hover:border-slate-700 transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-base">{vendorIcon(d.vendor)}</span>
                <span className="font-mono text-sm text-cyan-300">{d.ip}</span>
                {d.ip.endsWith('.1') && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-950/60 text-amber-400 border border-amber-900/50">
                    GW
                  </span>
                )}
                {d.randomMac && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] bg-purple-950/60 text-purple-400 border border-purple-900/50">
                    rand MAC
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-500">
                {roleGuess(d.vendor, d.ip, d.randomMac)}
              </span>
            </div>
            <div className="font-mono text-[10px] text-slate-500">{d.mac}</div>
            {!d.randomMac && d.vendor && (
              <div className="text-[10px] text-slate-600 mt-0.5 truncate">{d.vendor}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
