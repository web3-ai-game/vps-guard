interface Tool {
  id: string
  label: string
  icon: string
  color: string
}

interface RadialMenuProps {
  tools: Tool[]
  onSelect: (id: string) => void
  running: boolean
  activeTool: string | null
  connected: boolean
}

const RADIUS = 148
const CENTER = 200

function polarToXY(angleDeg: number, r: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return {
    x: CENTER + r * Math.cos(rad),
    y: CENTER + r * Math.sin(rad),
  }
}

export default function RadialMenu({ tools, onSelect, running, activeTool, connected }: RadialMenuProps) {
  const count = tools.length
  const angleStep = 360 / count

  return (
    <div className="relative flex items-center justify-center">
      <svg width={400} height={400} className="overflow-visible">
        {/* Outer decorative rings */}
        <circle cx={CENTER} cy={CENTER} r={185} fill="none" stroke="#0f2a4a" strokeWidth="1" strokeDasharray="4 6" className="spin-slow" />
        <circle cx={CENTER} cy={CENTER} r={170} fill="none" stroke="#0a1f38" strokeWidth="0.5" />

        {/* Orbit ring */}
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="#0d2d50" strokeWidth="1.5" />

        {/* Connector lines to nodes */}
        {tools.map((tool, i) => {
          const angle = i * angleStep
          const pos = polarToXY(angle, RADIUS)
          const isActive = activeTool === tool.id
          return (
            <line
              key={`line-${tool.id}`}
              x1={CENTER} y1={CENTER}
              x2={pos.x} y2={pos.y}
              stroke={isActive ? '#22d3ee' : '#0d2d50'}
              strokeWidth={isActive ? 1.5 : 0.5}
              strokeDasharray={isActive ? '0' : '3 4'}
              style={{ transition: 'stroke 0.3s, stroke-width 0.3s' }}
            />
          )
        })}

        {/* Tool nodes */}
        {tools.map((tool, i) => {
          const angle = i * angleStep
          const pos = polarToXY(angle, RADIUS)
          const isActive = activeTool === tool.id
          const labelPos = polarToXY(angle, RADIUS + 34)

          return (
            <g key={tool.id} onClick={() => !running && onSelect(tool.id)} style={{ cursor: running ? 'not-allowed' : 'pointer' }}>
              {isActive && (
                <circle cx={pos.x} cy={pos.y} r={26} fill={tool.color} opacity={0.15} className="pulse-ring" />
              )}
              <circle
                cx={pos.x} cy={pos.y} r={20}
                fill={isActive ? '#0f172a' : '#07111f'}
                stroke={isActive ? '#22d3ee' : tool.color}
                strokeWidth={isActive ? 2 : 1}
                style={{ transition: 'all 0.25s' }}
              />
              <text
                x={pos.x} y={pos.y + 1}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={14} fill={isActive ? '#22d3ee' : tool.color}
                style={{ userSelect: 'none', transition: 'fill 0.25s' }}
              >
                {tool.icon}
              </text>
              <text
                x={labelPos.x} y={labelPos.y}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={8.5}
                fill={isActive ? '#22d3ee' : '#4a7fa5'}
                style={{ userSelect: 'none', transition: 'fill 0.25s' }}
              >
                {tool.label.toUpperCase()}
              </text>
            </g>
          )
        })}

        {/* Center hub */}
        <circle cx={CENTER} cy={CENTER} r={60} fill="#050a12" stroke="#0d2d50" strokeWidth="1.5" />
        <circle cx={CENTER} cy={CENTER} r={52} fill="none" stroke={connected ? '#0e4a2a' : '#4a1f1f'} strokeWidth="1" />

        {/* Pulse ring on center */}
        <circle cx={CENTER} cy={CENTER} r={55} fill="none"
          stroke={connected ? '#22d3ee' : '#ef4444'} strokeWidth="1" opacity={0.3}
          className="pulse-ring"
        />

        {/* Status dot */}
        <circle cx={CENTER} cy={CENTER - 18} r={4}
          fill={connected ? '#22d3ee' : '#ef4444'}
          className={connected ? 'blink' : ''}
        />

        {/* Center text */}
        <text x={CENTER} y={CENTER + 2} textAnchor="middle" dominantBaseline="middle"
          fontSize={9} fill={connected ? '#7dd3fc' : '#f87171'} letterSpacing="2"
          style={{ userSelect: 'none' }}
        >
          {connected ? 'CONNECTED' : 'OFFLINE'}
        </text>
        <text x={CENTER} y={CENTER + 15} textAnchor="middle" dominantBaseline="middle"
          fontSize={7.5} fill="#1e4a72" letterSpacing="1"
          style={{ userSelect: 'none' }}
        >
          BLUE TEAM
        </text>
      </svg>
    </div>
  )
}
