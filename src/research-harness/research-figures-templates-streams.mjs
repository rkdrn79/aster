// A two-stream transformer block (MM-DiT-like joint attention): two token streams (text and
// image, two modalities, two agents) keep their own weights, norms, modulation and MLPs, and meet
// at one attention over both sequences, then split back. The joint attention is the contribution,
// so it spans both columns in the accent; each stream keeps one hue; a conditioning input
// modulates every norm from the gap between the columns; residuals run on the outer sides.
import { warnKit } from './research-figures-cards.mjs'

/**
 * `fig.template('two-stream', { id, x, y, w: 300, h: 340, streams: ['c', 'x'], colors: ['d',
 * 'b'], cond: 'y', attention: 'Joint attention', mlp: 'MLP', norm: 'LN + mod', proj: 'Linear',
 * outputs: ["c'", "x'"], title })`. Parts: <id>-<side>-<part> with side l | r and part in, norm1,
 * qkv, proj, add1, norm2, mlp, add2, out; <id>-attn.
 */
function twoStream(fig, spec) {
  const { id } = spec
  const x = spec.x ?? 0
  const y = spec.y ?? 0
  const names = [spec.norm ?? 'LN + mod', spec.proj ?? 'Linear', spec.mlp ?? 'MLP']
  const widest = Math.max(...names.map((label) => fig.measure('box', { label, w: 8, h: 8 }).width))
  // Why it grows: every arrow between two parts needs 16 units and every label its box; a block
  // squeezed below that printed stub arrows and overflowing labels, so it takes the room it needs.
  const titleH = spec.title === false ? 0 : 22
  const needW = Math.ceil(2 * widest + 64 + 56)
  const needH = Math.ceil(166 + 9 * 16 + 56 + titleH)
  const w = Math.max(spec.w ?? 300, needW)
  const h = Math.max(spec.h ?? 340, needH)
  if (w > (spec.w ?? 300) || h > (spec.h ?? 340)) {
    warnKit([
      `template two-stream ${id}: grew to w ${w}, h ${h} so its labels fit and every arrow has 16 units; give that size, or shorter labels (norm, proj, mlp)`
    ])
  }
  const [inL, inR] = spec.streams ?? ['c', 'x']
  const [outL, outR] = spec.outputs ?? [`${inL}'`, `${inR}'`]
  const [colorL, colorR] = spec.colors ?? ['d', 'b']
  const cond = spec.cond === false ? null : (spec.cond ?? 'y')
  const title = spec.title === false ? null : (spec.title ?? 'Two-stream block')
  // Why 30 at the top and 26 at the bottom: the outputs and the inputs, as math, outside the panel.
  const top = y + 30 + (title ? 22 : 0)
  const bottom = y + h - 26
  const gutter = Math.max(56, w * 0.2)
  const boxW = Math.max(widest, Math.min(130, (w - gutter - 64) / 2))
  const cxL = x + 32 + boxW / 2
  const cxR = x + w - 32 - boxW / 2
  // Bottom to top: norm, QKV projection, the joint attention, output projection, ⊕, norm, MLP, ⊕.
  const rows = ['norm1', 'qkv', 'attn', 'proj', 'add1', 'norm2', 'mlp', 'add2']
  const tall = { norm1: 20, qkv: 22, attn: 26, proj: 22, add1: 16, norm2: 20, mlp: 24, add2: 16 }
  const used = rows.reduce((sum, row) => sum + tall[row], 0)
  const gap = Math.max(10, (bottom - top - used) / (rows.length + 1))
  const ys = {}
  let cursor = bottom - gap
  for (const row of rows) {
    ys[row] = cursor - tall[row]
    cursor = ys[row] - gap
  }
  const labelOf = {
    norm1: spec.norm ?? 'LN + mod',
    qkv: spec.proj ?? 'Linear',
    proj: spec.proj ?? 'Linear',
    norm2: spec.norm ?? 'LN + mod',
    mlp: spec.mlp ?? 'MLP'
  }
  const ids = {}
  for (const [side, cx, color] of [
    ['l', cxL, colorL],
    ['r', cxR, colorR]
  ]) {
    for (const row of rows.filter((name) => name !== 'attn')) {
      const part = `${id}-${side}-${row}`
      ids[`${side}-${row}`] = part
      if (row.startsWith('add')) {
        fig.node({ id: part, symbol: 'plus', cx, cy: ys[row] + tall[row] / 2 })
      } else {
        fig.box({
          id: part,
          label: labelOf[row],
          x: cx - boxW / 2,
          y: ys[row],
          w: boxW,
          h: tall[row],
          exact: true,
          intentional: true,
          color: row === 'norm1' || row === 'norm2' ? 'block' : color
        })
      }
    }
  }
  // Why one box over both columns: the two sequences are concatenated for one attention.
  ids.attn = `${id}-attn`
  fig.box({
    id: ids.attn,
    label: spec.attention ?? 'Joint attention',
    x: cxL - boxW / 2,
    y: ys.attn,
    w: cxR - cxL + boxW,
    h: tall.attn,
    exact: true,
    color: 'a'
  })
  for (const [side, cx, input, output] of [
    ['l', cxL, inL, outL],
    ['r', cxR, inR, outR]
  ]) {
    const at = (row) => `${id}-${side}-${row}`
    fig.math({ id: `${id}-${side}-in`, tex: input, cx, y: bottom + 6, size: 16 })
    fig.math({ id: `${id}-${side}-out`, tex: output, cx, y: y + (title ? 22 : 0), size: 16 })
    fig.arrow({ id: `${id}-${side}-a0`, from: `${id}-${side}-in`, to: at('norm1') })
    fig.arrow({ id: `${id}-${side}-a1`, from: at('norm1'), to: at('qkv') })
    fig.arrow({
      id: `${id}-${side}-a2`,
      from: at('qkv'),
      to: ids.attn,
      toAt: { x: cx },
      label: spec.qkvLabel ?? 'Q, K, V',
      labelSide: side === 'l' ? 'right' : 'left'
    })
    fig.arrow({ id: `${id}-${side}-a3`, from: ids.attn, fromAt: { x: cx }, to: at('proj') })
    fig.arrow({ id: `${id}-${side}-a4`, from: at('proj'), to: at('add1') })
    fig.arrow({ id: `${id}-${side}-a5`, from: at('add1'), to: at('norm2') })
    fig.arrow({ id: `${id}-${side}-a6`, from: at('norm2'), to: at('mlp') })
    fig.arrow({ id: `${id}-${side}-a7`, from: at('mlp'), to: at('add2') })
    fig.arrow({ id: `${id}-${side}-a8`, from: at('add2'), to: `${id}-${side}-out` })
    // Residuals on the outer side: around the attention, then around the MLP.
    const outer = side === 'l' ? 'left' : 'right'
    fig.skip({
      id: `${id}-${side}-res1`,
      from: `${id}-${side}-a0`,
      to: at('add1'),
      side: outer,
      gap: 14
    })
    fig.skip({
      id: `${id}-${side}-res2`,
      from: `${id}-${side}-a5`,
      to: at('add2'),
      side: outer,
      gap: 14
    })
  }
  if (cond) {
    // Why from the gap: the same conditioning modulates both streams' norms, at every norm.
    for (const row of ['norm1', 'norm2']) {
      const cy = ys[row] + tall[row] / 2
      const tag = `${id}-cond-${row}`
      fig.math({ id: tag, tex: cond, cx: (cxL + cxR) / 2, cy, size: 14 })
      fig.arrow({ id: `${tag}-l`, from: tag, to: `${id}-l-${row}`, role: 'cond' })
      fig.arrow({ id: `${tag}-r`, from: tag, to: `${id}-r-${row}`, role: 'cond' })
    }
  }
  if (title) {
    fig.text({ id: `${id}-title`, text: title, cx: x + w / 2, y, size: 16 })
  }
  return {
    ids,
    in: [`${id}-l-in`, `${id}-r-in`],
    out: [`${id}-l-out`, `${id}-r-out`],
    width: w,
    height: h,
    handled: []
  }
}

export const STREAM_TEMPLATES = {
  'two-stream': [
    twoStream,
    'two token streams (text and image) with their own norms, projections and MLPs meeting at one joint attention (MM-DiT, SD3); conditioning modulates every norm, residuals on the outer sides',
    "{ id, x, y, w: 300, h: 340, streams: ['c', 'x'], outputs, colors: ['d', 'b'], cond: 'y' | false, attention: 'Joint attention', mlp: 'MLP', norm: 'LN + mod', proj: 'Linear', qkvLabel: 'Q, K, V', title: 'Two-stream block' | false }"
  ]
}
