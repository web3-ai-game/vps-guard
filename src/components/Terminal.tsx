import { useEffect, useRef } from 'react'

interface LogLine {
  id: number
  type: 'stdout' | 'stderr' | 'info' | 'error' | 'start' | 'done'
  text: string
}

interface TerminalProps {
  lines: LogLine[]
  running: boolean
  activeLabel: string | null
}

const lineColor: Record<LogLine['type'], string> = {
  stdout: 'text-cyan-300',
  stderr: 'text-yellow-400',
  info: 'text-slate-400',
  error: 'text-red-400',
  start: 'text-emerald-400',
  done: 'text-blue-400',
}

export default function Terminal({ lines, running, activeLabel }: TerminalProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  return (
    <div className="flex flex-col h-full bg-black/60 rounded-2xl border border-slate-800 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800 bg-slate-900/60">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500/70" />
          <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
          <span className="w-3 h-3 rounded-full bg-emerald-500/70" />
        </div>
        <span className="text-xs text-slate-400 ml-2 flex-1 truncate">
          {activeLabel ?? 'BLUE TEAM TERMINAL'}
        </span>
        {running && (
          <span className="flex items-center gap-1 text-xs text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 blink" />
            RUNNING
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed space-y-0.5">
        {lines.length === 0 && (
          <div className="text-slate-600 text-center mt-8">
            — select a tool from the radial menu —
          </div>
        )}
        {lines.map((line) => (
          <div key={line.id} className={`terminal-line whitespace-pre-wrap break-all ${lineColor[line.type]}`}>
            {line.type === 'start' && (
              <span className="text-slate-500 mr-2">▶</span>
            )}
            {line.type === 'done' && (
              <span className="text-slate-500 mr-2">■</span>
            )}
            {line.text}
          </div>
        ))}
        {running && (
          <div className="text-emerald-400 text-xs">
            <span className="blink">█</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
