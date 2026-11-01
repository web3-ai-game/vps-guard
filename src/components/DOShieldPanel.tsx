import { useState, useEffect, useCallback } from 'react'

interface Droplet {
  id: number
  name: string
  status: 'new' | 'active' | 'off' | 'archive'
  region: string
  regionName: string
  size: string
  ip: string | null
  memory: number
  vcpus: number
  createdAt: string
}

interface Region { slug: string; name: string }
interface Size { slug: string; memory: number; vcpus: number; disk: number; price_monthly: number }
interface SSHKey { id: number; name: string; fingerprint: string }
interface Account { email: string; status: string; dropletLimit: number }

const STATUS_COLOR: Record<string, string> = {
  active:  'text-emerald-400',
  new:     'text-amber-400',
  off:     'text-slate-500',
  archive: 'text-red-400',
}

const SHIELD_REGIONS = [
  { slug: 'sgp1', name: '🇸🇬 新加坡' },
  { slug: 'sfo3', name: '🇺🇸 舊金山' },
  { slug: 'lon1', name: '🇬🇧 倫敦' },
  { slug: 'fra1', name: '🇩🇪 法蘭克福' },
  { slug: 'blr1', name: '🇮🇳 班加羅爾' },
  { slug: 'tor1', name: '🇨🇦 多倫多' },
]

function DropletCard({ d, onDestroy, onRefresh }: { d: Droplet; onDestroy: (id: number) => void; onRefresh: (id: number) => void }) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">🛡</span>
            <span className="text-sm font-medium text-slate-200 truncate">{d.name}</span>
          </div>
          <div className={`text-xs font-mono mt-0.5 ${STATUS_COLOR[d.status] || 'text-slate-400'}`}>
            {d.status.toUpperCase()} · {d.regionName || d.region}
          </div>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={() => onRefresh(d.id)}
            className="px-2 py-1 text-[10px] text-slate-600 hover:text-slate-400 border border-slate-800 rounded transition-colors"
          >
            ↻
          </button>
          {confirming ? (
            <>
              <button onClick={() => onDestroy(d.id)} className="px-2 py-1 text-[10px] text-red-400 border border-red-900/60 rounded transition-colors hover:bg-red-950/40">確認刪除</button>
              <button onClick={() => setConfirming(false)} className="px-2 py-1 text-[10px] text-slate-500 border border-slate-800 rounded">取消</button>
            </>
          ) : (
            <button onClick={() => setConfirming(true)} className="px-2 py-1 text-[10px] text-slate-600 hover:text-red-400 border border-slate-800 hover:border-red-900/60 rounded transition-colors">
              🗑
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
        <div className="bg-black/30 rounded-lg px-2 py-1.5">
          <div className="text-slate-700 mb-0.5">IP</div>
          <div className="text-cyan-400">{d.ip || '分配中…'}</div>
        </div>
        <div className="bg-black/30 rounded-lg px-2 py-1.5">
          <div className="text-slate-700 mb-0.5">規格</div>
          <div className="text-slate-400">{d.vcpus}vCPU / {d.memory}MB</div>
        </div>
        <div className="bg-black/30 rounded-lg px-2 py-1.5">
          <div className="text-slate-700 mb-0.5">建立</div>
          <div className="text-slate-400">{new Date(d.createdAt).toLocaleDateString()}</div>
        </div>
      </div>

      {d.ip && d.status === 'active' && (
        <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-lg px-3 py-2 text-[10px] font-mono text-emerald-400">
          🌐 盾牌 IP: {d.ip} · UFW + Nginx + Fail2ban 已部署
        </div>
      )}
    </div>
  )
}

export default function DOShieldPanel() {
  const [account, setAccount] = useState<Account | null>(null)
  const [droplets, setDroplets] = useState<Droplet[]>([])
  const [regions, setRegions] = useState<Region[]>(SHIELD_REGIONS)
  const [sizes, setSizes] = useState<Size[]>([])
  const [sshKeys, setSSHKeys] = useState<SSHKey[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: `bt-shield-${Date.now().toString(36)}`,
    region: 'sgp1',
    size: 's-1vcpu-512mb-10gb',
    targetIp: '',
    targetPort: '80',
    sshKeyId: '',
  })

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [accR, dropR, sizesR, keysR] = await Promise.all([
        fetch('/api/do/account').then(r => r.json()),
        fetch('/api/do/droplets').then(r => r.json()),
        fetch('/api/do/sizes').then(r => r.json()),
        fetch('/api/do/ssh-keys').then(r => r.json()),
      ])
      if (accR.error) throw new Error(accR.error)
      setAccount(accR)
      setDroplets(dropR.droplets || [])
      setSizes(sizesR.sizes || [])
      setSSHKeys(keysR.keys || [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'API 錯誤')
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const refreshDroplet = async (id: number) => {
    try {
      const d = await fetch(`/api/do/droplets/${id}`).then(r => r.json())
      setDroplets(prev => prev.map(x => x.id === id ? d : x))
    } catch {}
  }

  const createDroplet = async () => {
    setCreating(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        region: form.region,
        size: form.size,
        targetIp: form.targetIp || undefined,
        targetPort: form.targetPort || '80',
      }
      if (form.sshKeyId) body.sshKeyIds = [parseInt(form.sshKeyId)]
      const r = await fetch('/api/do/droplets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await r.json()
      if (data.error) throw new Error(data.error)
      setDroplets(prev => [data.droplet, ...prev])
      setForm(f => ({ ...f, name: `bt-shield-${Date.now().toString(36)}` }))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '建立失敗')
    }
    setCreating(false)
  }

  const destroyDroplet = async (id: number) => {
    try {
      await fetch(`/api/do/droplets/${id}`, { method: 'DELETE' })
      setDroplets(prev => prev.filter(d => d.id !== id))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '刪除失敗')
    }
  }

  const selectedSize = sizes.find(s => s.slug === form.size)

  return (
    <div className="h-full flex gap-4 overflow-hidden">
      {/* Left: Create form */}
      <div className="w-80 shrink-0 flex flex-col gap-3 overflow-y-auto pr-1">
        {/* Account info */}
        {account && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3">
            <div className="text-[10px] text-slate-600 uppercase tracking-wider mb-2">DO 帳戶</div>
            <div className="text-xs text-slate-400 font-mono truncate">{account.email}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] font-mono ${account.status === 'active' ? 'text-emerald-400' : 'text-red-400'}`}>{account.status}</span>
              <span className="text-[10px] text-slate-600">· 限額: {account.dropletLimit} 台主機</span>
            </div>
          </div>
        )}

        <div className="text-[11px] text-slate-600 uppercase tracking-[3px] font-mono border-b border-slate-800 pb-2">
          部署盾牌 VPS
        </div>

        {error && (
          <div className="bg-red-950/30 border border-red-900/40 rounded-xl px-3 py-2 text-[11px] text-red-400 font-mono break-all">
            ❌ {error}
          </div>
        )}

        {/* Name */}
        <div className="space-y-1">
          <label className="text-[10px] text-slate-500">主機名稱</label>
          <input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full bg-black/40 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 outline-none focus:border-cyan-700 transition-colors"
          />
        </div>

        {/* Region */}
        <div className="space-y-1">
          <label className="text-[10px] text-slate-500">地區</label>
          <div className="grid grid-cols-2 gap-1.5">
            {regions.map(r => (
              <button
                key={r.slug}
                onClick={() => setForm(f => ({ ...f, region: r.slug }))}
                className={`px-2 py-1.5 rounded-lg text-[10px] font-mono border transition-all text-left ${
                  form.region === r.slug
                    ? 'border-cyan-800/60 bg-cyan-950/40 text-cyan-300'
                    : 'border-slate-800 text-slate-600 hover:text-slate-400 hover:border-slate-700'
                }`}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>

        {/* Size */}
        <div className="space-y-1">
          <label className="text-[10px] text-slate-500">規格（廉價機型）</label>
          <div className="space-y-1">
            {sizes.length === 0 && (
              <div className="text-[10px] text-slate-700 font-mono">載入中…</div>
            )}
            {sizes.map(s => (
              <button
                key={s.slug}
                onClick={() => setForm(f => ({ ...f, size: s.slug }))}
                className={`w-full px-3 py-2 rounded-lg text-[10px] font-mono border transition-all flex justify-between ${
                  form.size === s.slug
                    ? 'border-cyan-800/60 bg-cyan-950/40 text-cyan-300'
                    : 'border-slate-800 text-slate-600 hover:text-slate-400'
                }`}
              >
                <span>{s.vcpus}vCPU / {s.memory}MB / {s.disk}GB</span>
                <span className="text-emerald-500">${s.price_monthly}/mo</span>
              </button>
            ))}
          </div>
        </div>

        {/* Target IP (optional reverse proxy) */}
        <div className="space-y-1">
          <label className="text-[10px] text-slate-500">反代目標 IP（可選）</label>
          <div className="flex gap-2">
            <input
              value={form.targetIp}
              onChange={e => setForm(f => ({ ...f, targetIp: e.target.value }))}
              placeholder="留空 = 純盾牌"
              className="flex-1 bg-black/40 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 outline-none focus:border-cyan-700 transition-colors placeholder:text-slate-700"
            />
            <input
              value={form.targetPort}
              onChange={e => setForm(f => ({ ...f, targetPort: e.target.value }))}
              placeholder="80"
              className="w-16 bg-black/40 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 outline-none focus:border-cyan-700 transition-colors"
            />
          </div>
          <div className="text-[9px] text-slate-700">填入後 Nginx 自動設定反代，不填則作純 DDoS 前置盾</div>
        </div>

        {/* SSH Key */}
        {sshKeys.length > 0 && (
          <div className="space-y-1">
            <label className="text-[10px] text-slate-500">SSH Key（可選）</label>
            <select
              value={form.sshKeyId}
              onChange={e => setForm(f => ({ ...f, sshKeyId: e.target.value }))}
              className="w-full bg-black/40 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-300 outline-none focus:border-cyan-700 transition-colors"
            >
              <option value="">不添加 SSH Key</option>
              {sshKeys.map(k => (
                <option key={k.id} value={k.id}>{k.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Cost preview */}
        {selectedSize && (
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl px-3 py-2 text-[10px] font-mono text-slate-500">
            預估費用：<span className="text-emerald-400">${selectedSize.price_monthly}/月</span> ·
            約 <span className="text-emerald-400">${(selectedSize.price_monthly / 720).toFixed(4)}/小時</span>
          </div>
        )}

        {/* Create button */}
        <button
          onClick={createDroplet}
          disabled={creating || loading}
          className="w-full py-3 rounded-xl text-sm font-mono border border-cyan-800/60 bg-cyan-950/30 text-cyan-400 hover:border-cyan-600 hover:bg-cyan-900/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {creating ? (
            <><div className="w-4 h-4 border-2 border-cyan-700 border-t-transparent rounded-full animate-spin" />部署中…</>
          ) : (
            <><span>🚀</span>一鍵部署盾牌 VPS</>
          )}
        </button>
        <div className="text-[9px] text-slate-700 text-center -mt-1">
          自動安裝：UFW 防火牆 · Nginx 限速 · Fail2ban CC 防禦
        </div>
      </div>

      {/* Right: Droplet list */}
      <div className="flex-1 min-w-0 flex flex-col gap-3 overflow-hidden">
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-[11px] text-slate-600 uppercase tracking-[3px] font-mono">
            盾牌 VPS 列表
          </div>
          <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">{droplets.length}</span>
          <div className="flex-1" />
          <button
            onClick={fetchAll}
            disabled={loading}
            className="text-[10px] text-slate-600 hover:text-slate-400 border border-slate-800 rounded px-2 py-1 transition-colors disabled:opacity-40"
          >
            {loading ? '載入中…' : '↻ 刷新'}
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
          {droplets.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-700">
              <span className="text-4xl">🛡</span>
              <span className="text-sm">尚無盾牌 VPS</span>
              <span className="text-xs">在左側填寫表單，一鍵部署</span>
            </div>
          )}
          {droplets.map(d => (
            <DropletCard key={d.id} d={d} onDestroy={destroyDroplet} onRefresh={refreshDroplet} />
          ))}
        </div>

        {/* Info box */}
        <div className="shrink-0 bg-slate-900/40 border border-slate-800 rounded-xl px-4 py-3 text-[10px] text-slate-600 space-y-1">
          <div className="text-slate-500 font-medium mb-1">🛡 盾牌 VPS 防護機制</div>
          <div>• <span className="text-slate-500">UFW</span> — 僅開放 22/80/443，封鎖所有其他流量</div>
          <div>• <span className="text-slate-500">Nginx 限速</span> — 每 IP 30 req/min，burst=20，DDoS/CC 自動限流</div>
          <div>• <span className="text-slate-500">Fail2ban</span> — 超過閾值自動封禁 IP，ban 時間 1 小時</div>
          <div>• <span className="text-slate-500">反代模式</span> — 填入目標 IP 後作透明反代，隱藏真實 IP</div>
        </div>
      </div>
    </div>
  )
}
