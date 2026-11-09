import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { openFigure } from './research-figures-kit.mjs'
import { newFigureScene } from './research-figures-model.mjs'
import { fitStack } from './research-figures-templates-stack.mjs'

async function withFigure(run, size = { widthIn: 6.75, heightIn: 4 }) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-tpl-')))
  try {
    await mkdir(path.join(project, '.aster'), { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    await mkdir(path.join(project, 'paper/figures'), { recursive: true })
    const file = path.join(project, 'paper/figures/fig.excalidraw')
    await writeFile(file, JSON.stringify(newFigureScene(size)))
    await run(file)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

const texOf = (fig, id) =>
  fig.elements
    .filter((element) => element.customData?.asterKit === id)
    .map((element) => element.customData?.asterMath ?? element.text)
    .join(' ')

test('reflexion: an agent loop with memories, its inner loop in the accent, filling its box', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const drawn = fig.template('reflexion', {
      id: 'rx',
      x: 20,
      y: 20,
      fit: { w: 460, h: 340 },
      names: { actor: 'Actor (LLM)' }
    })
    for (const part of ['actor', 'evaluator', 'reflection', 'trajectory', 'experience']) {
      assert.ok(fig.get(drawn.ids[part]), part)
    }
    assert.equal(fig.get('rx-panel').width, 460)
    assert.equal(drawn.width, 460)
    const inner = ['rx-feedback', 'rx-reflect', 'rx-recall'].map((id) => fig.get(id))
    assert.ok(inner.every((arrow) => arrow.strokeWidth === 2))
    assert.ok(inner.every((arrow) => arrow.strokeColor !== fig.get('rx-act').strokeColor))
    assert.equal(fig.get('rx-recall').endBinding.elementId, 'rx-actor')
    assert.equal(fig.get('rx-observe').endBinding.elementId, 'rx-trajectory')
    const reflection = fig.bounds('rx-reflection')
    const experience = fig.bounds('rx-experience')
    assert.equal(
      reflection.x + reflection.width / 2,
      experience.x + experience.width / 2,
      'a column shares its centre, so the arrow runs straight'
    )
  })
})

test('prompting: IO, CoT, CoT-SC and a tree of evaluated thoughts side by side', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const drawn = fig.template('prompting', { id: 'pr', x: 12, y: 12, fit: { w: 940, h: 300 } })
    assert.deepEqual(Object.keys(drawn.ids), ['io', 'cot', 'cot-sc', 'tot'])
    assert.ok(fig.get('pr-cot-sc-vote'))
    const kept = fig.get('pr-tot-l0n0')
    const pruned = fig.get('pr-tot-l0n1')
    assert.notEqual(kept.backgroundColor, pruned.backgroundColor)
    assert.equal(
      fig.get('pr-tot-l1n2').backgroundColor,
      kept.backgroundColor,
      'the kept path moves'
    )
    const input = fig.bounds('pr-cot-sc-in')
    assert.equal(fig.bounds('pr-cot-sc-p0t0').x, input.x, 'outer chains meet the input edges')
    assert.equal(Math.round(fig.bounds('pr-cot-sc-p2t0').right), Math.round(input.right))
    assert.ok(fig.get('pr-legend'))
    const right = Math.max(
      ...fig.elements
        .filter((e) => e.customData?.asterKit?.startsWith('pr-'))
        .map((e) => e.x + e.width)
    )
    assert.ok(right <= 12 + 940 + 1, `inside its box (${right})`)
    assert.throws(
      () => fig.template('prompting', { id: 'q', strategies: ['got'] }),
      /strategies are/
    )
  })
})

test('trajectory: tagged steps with a hanging indent, every highlight and a mark', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const drawn = fig.template('trajectory', {
      id: 'tr',
      x: 20,
      y: 20,
      w: 300,
      title: 'Question: which device controls Front Row?',
      steps: [
        {
          kind: 'thought',
          text: 'Front Row is controlled by the Apple Remote, and Front Row also takes keys.',
          highlights: [{ text: 'Front Row', color: 'good' }]
        },
        { kind: 'act', text: 'Search[Front Row]' },
        { kind: 'obs', text: 'Front Row is a media center.' },
        { kind: 'thought', text: 'So the answer is keys.' },
        { kind: 'act', text: 'Finish[keys]', mark: 'check' }
      ]
    })
    assert.equal(drawn.ids.steps.length, 5)
    assert.equal(fig.get('tr-s3-tag').text, 'Thought 2:')
    assert.equal(fig.get('tr-s4-tag').text, 'Act 2:')
    assert.equal(fig.get('tr-s0-t1').x, fig.get('tr-s0-t0').x, 'continuation lines hang')
    assert.ok(fig.get('tr-s0-t0').x > fig.get('tr-s0-tag').x + fig.get('tr-s0-tag').width)
    const spans = fig.elements.filter((e) => e.id.startsWith('tr-s0-h'))
    assert.equal(spans.length, 2, 'both occurrences')
    assert.ok(fig.get('tr-s4-mark'))
    assert.equal(fig.get('tr-frame').height, drawn.height)
  })
})

test('diffusion takes any number of steps or the DDPM row with ellipses, and fits a box', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const row = fig.template('diffusion', {
      id: 'd',
      x: 12,
      y: 12,
      ellipsis: true,
      fit: { w: 900, h: 160 }
    })
    assert.equal(row.ids.steps.length, 4)
    assert.equal(fig.get('d-dots1').customData.asterGlyph ?? 'ellipsis', 'ellipsis')
    assert.ok(Math.abs(row.width - 900) < 8, `${row.width}`)
    assert.ok(texOf(fig, 'd-l1').includes('x_t'))
    const six = fig.template('diffusion', { id: 'e', x: 12, y: 220, steps: 6 })
    assert.equal(six.ids.steps.length, 6)
  })
})

test('moe routes several tokens, each by its own router to its expert', async () => {
  await withFigure(async (file) => {
    const fig = await openFigure(file)
    const drawn = fig.template('moe', {
      id: 'm',
      x: 20,
      y: 20,
      w: 420,
      tokens: [
        { label: 'x_1', expert: 2, gate: 0.65 },
        { label: 'x_2', expert: 4, gate: 0.8 }
      ]
    })
    assert.equal(drawn.ids.routers.length, 2)
    assert.equal(fig.get('m-route1').endBinding.elementId, 'm-e2')
    assert.equal(fig.get('m-route2').endBinding.elementId, 'm-e4')
    assert.equal(fig.get('m-out2').endBinding.elementId, 'm-y2')
    assert.throws(
      () => fig.template('moe', { id: 'n', tokens: [{ label: 'x', expert: 9 }] }),
      /experts are 1–4/
    )
  })
})

test('dit: fit sets the whole module, rows are renamed, Σ only for the last block; lora fits', async () => {
  await withFigure(
    async (file) => {
      const fig = await openFigure(file)
      const block = fig.template('dit', {
        id: 'd',
        x: 12,
        y: 12,
        tokens: 4,
        fit: { w: 444 },
        labels: { zt: 'h_\\ell', eps: 'h_{\\ell+1}', norm1: 'LN' }
      })
      assert.ok(Math.abs(block.width - 444) <= 8, `${block.width}`)
      assert.equal(texOf(fig, 'd-ztl'), 'h_\\ell')
      assert.equal(texOf(fig, 'd-epsl'), 'h_{\\ell+1}')
      const plain = fig.template('dit', { id: 'e', x: 500, y: 12, tokens: 2 })
      assert.ok(!texOf(fig, 'e-epsl').includes('Sigma'), 'one block outputs ε_θ only')
      assert.ok(plain.width > 200)
      const lora = fig.template('lora', { id: 'l', x: 12, y: 700, fit: { w: 444, h: 250 } })
      assert.equal(lora.width, 444)
      assert.ok(lora.height <= 250)
    },
    { widthIn: 6.75, heightIn: 8 }
  )
})

test('a stack fills the height asked for: gaps of 20–32 first, then the blocks', () => {
  const { k, gap } = fitStack({ h: 694 }, { fixed: 144, boxes: [96, 96], gaps: 10 })
  assert.equal(gap, 32)
  assert.ok(Math.abs(144 + 192 * k + 10 * gap - 694) < 2)
  assert.deepEqual(fitStack({}, { fixed: 10, boxes: [20], gaps: 1 }), { k: 1, gap: 20 })
})
