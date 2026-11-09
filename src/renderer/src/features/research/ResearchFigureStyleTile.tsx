import {
  styleColor,
  type FigureStyle
} from '../../../../research-harness/research-figures-style.mjs'

type Rect = { x: number; y: number; w: number; h: number }

/** The printed page under every preset, and the text on a solid highlight. */
const PAPER_WHITE = '#ffffff'

/** A short name for a preset: its label up to the colon, without the bracketed extra. */
export function presetName(label: string): string {
  return label
    .split(':')[0]
    .replace(/\s*\(.*\)\s*$/, '')
    .trim()
}

function Arrow({ points, color }: { points: [number, number][]; color: string }) {
  const [x, y] = points.at(-1) ?? [0, 0]
  const [px, py] = points.at(-2) ?? [0, 0]
  const angle = Math.atan2(y - py, x - px)
  const head = (turn: number): string =>
    `${x - 3.2 * Math.cos(angle + turn)},${y - 3.2 * Math.sin(angle + turn)}`
  return (
    <g>
      <polyline
        points={points.map((point) => point.join(',')).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={0.9}
      />
      <polygon points={`${x},${y} ${head(0.45)} ${head(-0.45)}`} fill={color} />
    </g>
  )
}

function Box({
  at,
  paint,
  radius,
  outline,
  bar
}: {
  at: Rect
  paint: { fill: string; stroke: string }
  radius: number
  outline: number
  bar: string
}) {
  const stroked = paint.stroke !== 'transparent'
  return (
    <g>
      <rect
        x={at.x}
        y={at.y}
        width={at.w}
        height={at.h}
        rx={radius}
        fill={paint.fill}
        stroke={stroked ? paint.stroke : 'none'}
        strokeWidth={stroked ? outline : 0}
      />
      <rect x={at.x + at.w / 2 - 6} y={at.y + at.h / 2 - 1} width={12} height={2} fill={bar} />
    </g>
  )
}

/** The illustrative style: tinted rounded panels, white modules, a coloured key phrase. */
function Illustrative({ style }: { style: FigureStyle }) {
  const [left, right] = style.panels
  const white = styleColor(style, 'block')
  const accent = styleColor(style, 'accent')
  return (
    <>
      <rect x={2} y={2} width={47} height={56} rx={7} fill={left?.fill ?? style.panel} />
      <rect x={51} y={2} width={47} height={56} rx={7} fill={right?.fill ?? style.panel} />
      <rect x={8} y={8} width={24} height={3} rx={1.5} fill={left?.ink ?? style.ink} />
      <rect x={57} y={8} width={20} height={3} rx={1.5} fill={right?.ink ?? style.ink} />
      <Box
        at={{ x: 8, y: 18, w: 34, h: 13 }}
        paint={white}
        radius={4}
        outline={0}
        bar={style.ink}
      />
      <Box
        at={{ x: 8, y: 39, w: 34, h: 13 }}
        paint={white}
        radius={4}
        outline={0}
        bar={style.ink}
      />
      <Box
        at={{ x: 57, y: 18, w: 34, h: 13 }}
        paint={accent}
        radius={4}
        outline={0}
        bar={style.ink}
      />
      {[62, 72, 82].map((cx, index) => (
        <circle key={cx} cx={cx} cy={45} r={index === 1 ? 4 : 3} fill={style.accents[0].strong} />
      ))}
      <Arrow
        points={[
          [25, 31],
          [25, 39]
        ]}
        color={style.line}
      />
      <Arrow
        points={[
          [42, 24.5],
          [57, 24.5]
        ]}
        color={style.line}
      />
    </>
  )
}

/** A block diagram: given and own modules, a plain one, a side input and the loss. */
function Blocks({ style }: { style: FigureStyle }) {
  const radius = Math.max(1, style.radius / 2)
  const outline = style.outlineWidth ? style.outlineWidth / 2 : 0.8
  const given = styleColor(style, style.accents[1] ? 'accent2' : 'strong')
  const own = styleColor(style, style.accents[0].highlight ? 'highlight' : 'accent')
  const side = styleColor(style, style.accents[2] ? 'accent3' : 'block')
  const block = styleColor(style, 'block')
  const loss = style.loss
  return (
    <>
      <rect x={34} y={4} width={64} height={24} rx={radius + 1} fill={style.panel} />
      <Box
        at={{ x: 4, y: 8, w: 25, h: 16 }}
        paint={given}
        radius={radius}
        outline={outline}
        bar={style.ink}
      />
      <Box
        at={{ x: 38, y: 8, w: 25, h: 16 }}
        paint={own}
        radius={radius}
        outline={outline}
        bar={style.accents[0].highlight ? PAPER_WHITE : style.ink}
      />
      <Box
        at={{ x: 70, y: 8, w: 25, h: 16 }}
        paint={block}
        radius={radius}
        outline={outline}
        bar={style.ink}
      />
      <Box
        at={{ x: 4, y: 37, w: 25, h: 16 }}
        paint={side}
        radius={radius}
        outline={outline}
        bar={style.ink}
      />
      <rect
        x={70}
        y={38}
        width={25}
        height={14}
        rx={7}
        fill={loss.fill}
        stroke={loss.stroke}
        strokeWidth={0.6}
      />
      <rect x={78.5} y={44} width={8} height={2} fill={loss.text} />
      <Arrow
        points={[
          [29, 16],
          [38, 16]
        ]}
        color={style.line}
      />
      <Arrow
        points={[
          [63, 16],
          [70, 16]
        ]}
        color={style.line}
      />
      <Arrow
        points={[
          [82.5, 24],
          [82.5, 38]
        ]}
        color={loss.link}
      />
      <Arrow
        points={[
          [29, 45],
          [50.5, 45],
          [50.5, 24]
        ]}
        color={style.muted}
      />
    </>
  )
}

/** A preset drawn small: the same roles in the same places, so presets compare at a glance. */
export function ResearchFigureStyleTile({ style }: { style: FigureStyle }): React.JSX.Element {
  return (
    <svg aria-hidden viewBox="0 0 100 60" className="h-full w-full">
      <rect width="100" height="60" fill={PAPER_WHITE} />
      {style.panels.length ? <Illustrative style={style} /> : <Blocks style={style} />}
    </svg>
  )
}
