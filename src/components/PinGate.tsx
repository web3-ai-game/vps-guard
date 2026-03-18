import { useState, useRef, useEffect } from 'react'

interface PinGateProps {
  onUnlock: () => void
}

const PIN_LENGTH = 6

export default function PinGate({ onUnlock }: PinGateProps) {
  const [digits, setDigits] = useState<string[]>(Array(PIN_LENGTH).fill(''))
  const [error, setError] = useState(false)
  const [checking, setChecking] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    const char = value.slice(-1)
    const next = [...digits]
    next[index] = char
    setDigits(next)
    setError(false)

    if (char && index < PIN_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }

    if (index === PIN_LENGTH - 1 && char) {
      const pin = next.join('')
      if (pin.length === PIN_LENGTH) verify(pin)
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
      const next = [...digits]
      next[index - 1] = ''
      setDigits(next)
    }
    if (e.key === 'Enter') {
      const pin = digits.join('')
      if (pin.length === PIN_LENGTH) verify(pin)
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, PIN_LENGTH)
    if (!text) return
    const next = Array(PIN_LENGTH).fill('')
    text.split('').forEach((c, i) => { next[i] = c })
    setDigits(next)
    if (text.length === PIN_LENGTH) verify(text)
    else inputRefs.current[text.length]?.focus()
  }

  const verify = async (pin: string) => {
    setChecking(true)
    try {
      const r = await fetch('/api/pin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      const data = await r.json()
      if (data.ok) {
        sessionStorage.setItem('bt-pin-token', data.token)
        onUnlock()
      } else {
        setError(true)
        setDigits(Array(PIN_LENGTH).fill(''))
        setTimeout(() => inputRefs.current[0]?.focus(), 200)
      }
    } catch {
      setError(true)
    }
    setChecking(false)
  }

  return (
    <div
      className="h-screen w-screen flex flex-col items-center justify-center text-slate-300"
      style={{ background: 'radial-gradient(ellipse at 30% 40%, #030d1c 0%, #010306 100%)' }}
    >
      <div className="flex flex-col items-center gap-8 max-w-sm w-full px-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-cyan-950/60 border border-cyan-800/40 flex items-center justify-center">
            <span className="text-3xl">🛡</span>
          </div>
          <div className="text-center">
            <h1 className="text-lg font-bold tracking-[6px] text-slate-300 uppercase">Blue Team</h1>
            <p className="text-[10px] tracking-[4px] text-slate-600 uppercase mt-1">Security Dashboard</p>
          </div>
        </div>

        {/* PIN Input */}
        <div className="flex flex-col items-center gap-4 w-full">
          <p className="text-xs text-slate-500">輸入 PIN 碼進入控制台</p>

          <div className="flex gap-3" onPaste={handlePaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={el => { inputRefs.current[i] = el }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={e => handleChange(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                className={`w-12 h-14 text-center text-xl font-mono rounded-xl border-2 outline-none transition-all
                  bg-black/40 text-cyan-300
                  ${error
                    ? 'border-red-500/80 animate-shake'
                    : d
                      ? 'border-cyan-700/80'
                      : 'border-slate-700/60 focus:border-cyan-600/80'
                  }
                `}
                disabled={checking}
              />
            ))}
          </div>

          {error && (
            <p className="text-xs text-red-400 animate-pulse">PIN 碼錯誤，請重試</p>
          )}

          {checking && (
            <div className="flex items-center gap-2 text-xs text-cyan-500">
              <div className="w-3 h-3 border-2 border-cyan-600 border-t-transparent rounded-full animate-spin" />
              驗證中…
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-[9px] text-slate-700 space-y-1 mt-8">
          <p>零信任訪問控制 — 所有連線需要驗證</p>
          <p>Blue Team Security Dashboard v2</p>
        </div>
      </div>
    </div>
  )
}
