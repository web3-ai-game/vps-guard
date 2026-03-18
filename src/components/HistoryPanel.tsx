interface HistoryEntry {
  id: number
  tool: string
  label: string
  startedAt: string
  exitCode: number | null
  lineCount: number
}

interface HistoryPanelProps {
  entries: HistoryEntry[]
  onReplay: (id: number) => void
}

export default function HistoryPanel({ entries, onReplay }: HistoryPanelProps) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-600 text-xs gap-2">
        <span className="text-2xl">🕐</span>
        <span>No runs yet</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
        {[...entries].reverse().map((e) => (
          <div
            key={e.id}
            className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 flex items-center gap-3 hover:border-slate-700 transition-colors group"
          >
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${
                e.exitCode === 0 ? 'bg-emerald-500' : e.exitCode === null ? 'bg-yellow-500' : 'bg-red-500'
              }`}
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-slate-300 font-mono truncate">{e.label}</div>
              <div className="text-[10px] text-slate-600 mt-0.5 flex gap-3">
                <span>{e.startedAt}</span>
                <span>{e.lineCount} lines</span>
                <span className={e.exitCode === 0 ? 'text-emerald-600' : 'text-red-600'}>
                  exit {e.exitCode ?? '—'}
                </span>
              </div>
            </div>
            <button
              onClick={() => onReplay(e.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-cyan-600 hover:text-cyan-400 px-2 py-1 rounded border border-slate-800 hover:border-cyan-900"
            >
              VIEW
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
