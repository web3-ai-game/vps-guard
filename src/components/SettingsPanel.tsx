import { useState, useEffect } from 'react'

interface Settings {
  TELEGRAM_BOT_TOKEN: string
  TELEGRAM_CHAT_ID: string
  XAI_API_KEY: string
  TEAMMATE_IP: string
  botRunning: boolean
}

export default function SettingsPanel() {
  const [settings, setSettings] = useState<Settings>({
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_CHAT_ID: '',
    XAI_API_KEY: '',
    TEAMMATE_IP: '',
    botRunning: false,
  })
  const [inputs, setInputs] = useState({
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_CHAT_ID: '',
    XAI_API_KEY: '',
    TEAMMATE_IP: '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then((d: Settings) => {
        setSettings(d)
        setInputs({
          TELEGRAM_BOT_TOKEN: '',
          TELEGRAM_CHAT_ID: d.TELEGRAM_CHAT_ID || '',
          XAI_API_KEY: '',
          TEAMMATE_IP: d.TEAMMATE_IP || '',
        })
      })
      .catch(() => {})
  }, [])

  const save = async () => {
    setSaving(true)
    const body: Record<string, string> = {}
    for (const [k, v] of Object.entries(inputs)) {
      if (v.trim()) body[k] = v.trim()
    }
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      const r = await fetch('/api/settings')
      const d = await r.json()
      setSettings(d)
    } catch {}
    setSaving(false)
  }

  const Field = ({
    label, envKey, placeholder, secret = false, hint,
  }: {
    label: string
    envKey: keyof typeof inputs
    placeholder: string
    secret?: boolean
    hint?: string
  }) => (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 font-medium">{label}</label>
        {settings[envKey as keyof Settings] && typeof settings[envKey as keyof Settings] === 'string' && (settings[envKey as keyof Settings] as string).includes('***') && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-900/40 text-emerald-500">已設定</span>
        )}
      </div>
      <input
        type={secret ? 'password' : 'text'}
        placeholder={
          settings[envKey as keyof Settings] && typeof settings[envKey as keyof Settings] === 'string' && (settings[envKey as keyof Settings] as string).includes('***')
            ? `已設定 (${settings[envKey as keyof Settings]}) — 留空保持不變`
            : placeholder
        }
        value={inputs[envKey]}
        onChange={e => setInputs(p => ({ ...p, [envKey]: e.target.value }))}
        className="w-full bg-black/40 border border-slate-700 rounded-xl px-3 py-2.5 text-sm font-mono text-slate-300 placeholder:text-slate-700 outline-none focus:border-cyan-700 transition-colors"
      />
      {hint && <div className="text-[10px] text-slate-700">{hint}</div>}
    </div>
  )

  return (
    <div className="h-full flex flex-col gap-6 overflow-y-auto pr-1">
      {/* Bot status */}
      <div className={`shrink-0 rounded-xl border px-4 py-3 flex items-center gap-3 ${settings.botRunning ? 'border-emerald-800/40 bg-emerald-950/20' : 'border-slate-800 bg-slate-900/30'}`}>
        <span className={`w-2 h-2 rounded-full ${settings.botRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
        <span className={`text-sm ${settings.botRunning ? 'text-emerald-400' : 'text-slate-500'}`}>
          {settings.botRunning ? 'Telegram Bot 已啟動運行' : 'Telegram Bot 未啟動 — 填入 Token 後保存即自動啟動'}
        </span>
      </div>

      {/* Telegram section */}
      <div className="space-y-4">
        <div className="text-[11px] text-slate-600 uppercase tracking-[3px] font-mono border-b border-slate-800 pb-2">
          Telegram Bot 設定
        </div>
        <Field
          label="Bot HTTP Token"
          envKey="TELEGRAM_BOT_TOKEN"
          placeholder="123456789:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          secret
          hint="從 @BotFather 取得 → /mybots → 選擇 @svs_pve_bot → API Token"
        />
        <Field
          label="Chat ID（群組）"
          envKey="TELEGRAM_CHAT_ID"
          placeholder="-1001234567890"
          hint="群組 ID 為負數。取得方式：將 bot 加群後訪問 api.telegram.org/bot<TOKEN>/getUpdates"
        />
      </div>

      {/* xAI section */}
      <div className="space-y-4">
        <div className="text-[11px] text-slate-600 uppercase tracking-[3px] font-mono border-b border-slate-800 pb-2">
          xAI Grok API
        </div>
        <Field
          label="xAI API Key"
          envKey="XAI_API_KEY"
          placeholder="xai-xxxxxxxxxxxxxxxxxxxxxxxx"
          secret
          hint="Key 已預設填入 .env，留空則保持不變"
        />
      </div>

      {/* Teammate section */}
      <div className="space-y-4">
        <div className="text-[11px] text-slate-600 uppercase tracking-[3px] font-mono border-b border-slate-800 pb-2">
          隊友設備
        </div>
        <Field
          label="隊友 IP（可選）"
          envKey="TEAMMATE_IP"
          placeholder="192.168.1.xxx"
          hint="填入後會在 TEAMMATE 面板顯示，也可通過 Bot !status 指令自動取得"
        />
      </div>

      {/* Save button */}
      <div className="shrink-0">
        <button
          onClick={save}
          disabled={saving}
          className="w-full py-3 rounded-xl text-sm font-mono border border-cyan-800/60 bg-cyan-950/30 text-cyan-400 hover:border-cyan-600 hover:bg-cyan-900/40 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {saving ? (
            <><div className="w-4 h-4 border-2 border-cyan-700 border-t-transparent rounded-full animate-spin" />保存中…</>
          ) : saved ? (
            <><span>✅</span>已保存</>
          ) : (
            <><span>💾</span>保存設定</>
          )}
        </button>
        <div className="text-[10px] text-slate-700 text-center mt-2">設定保存到 .env 文件，不會寫入代碼</div>
      </div>

      {/* Help section */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 space-y-2">
        <div className="text-xs text-slate-400 font-medium">📋 快速設定指南</div>
        <div className="space-y-1 text-[11px] text-slate-600">
          <div>1. 打開 Telegram → 搜索 <span className="text-slate-400 font-mono">@BotFather</span></div>
          <div>2. 發送 <span className="text-slate-400 font-mono">/mybots</span> → 選擇 <span className="text-slate-400 font-mono">@svs_pve_bot</span> → API Token</div>
          <div>3. 將 Bot 加入你們的群組（讓 Bot 能發送訊息）</div>
          <div>4. 訪問 <span className="text-slate-400 font-mono break-all">api.telegram.org/bot{'<TOKEN>'}/getUpdates</span> 取得 Chat ID</div>
          <div>5. 將以上填入並保存 → Bot 自動啟動</div>
          <div className="pt-2 text-slate-700">隊友需在 Windows 11 運行 <span className="text-slate-500 font-mono">agent/blue-team-agent.py</span></div>
        </div>
      </div>
    </div>
  )
}
