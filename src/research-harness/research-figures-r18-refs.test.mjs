// Round 18 reference-guided drawing: `figures refs` picks the closest reference figures with our
// recipes and the local image to look at, never the figure's own paper.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import { encodePng } from './research-figures-png.mjs'
import {
  RECIPES,
  STYLE_DNA,
  excludedReferences,
  namesPaper,
  pickReferences,
  textNamesPaper
} from './research-figures-refs.mjs'

const run = promisify(execFile)
const CLI = new URL('./cli.mjs', import.meta.url).pathname

async function withProject(work) {
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-figures-r18-')))
  try {
    await mkdir(path.join(project, '.aster/figures'), { recursive: true })
    await writeFile(
      path.join(project, '.aster/project.json'),
      JSON.stringify({ schemaVersion: 2, manuscript: { source: 'paper/main.tex', pdf: null } })
    )
    await work(project)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

test('every recipe is complete text, and the style DNA has the shared rules', () => {
  assert.equal(RECIPES.length, 15)
  assert.equal(new Set(RECIPES.map((recipe) => recipe.id)).size, 15)
  for (const recipe of RECIPES) {
    for (const key of ['title', 'arxiv', 'summary', 'layout', 'emphasis', 'type', 'avoid']) {
      assert.ok(String(recipe[key]).length > 4, `${recipe.id} has ${key}`)
    }
    assert.ok(
      recipe.glyphs.length >= 4 && recipe.glyphs.every((glyph) => glyph.includes('→')),
      recipe.id
    )
    assert.ok(recipe.keywords.length >= 5, recipe.id)
  }
  assert.ok(STYLE_DNA.length >= 5 && STYLE_DNA.length <= 7)
})

test('a request about rays and volume rendering picks 3D references; the paper it names is left out', async () => {
  await withProject(async (project) => {
    const text =
      'NeRF 논문(Mildenhall et al., Representing Scenes as Neural Radiance Fields for View Synthesis)의 Figure 2: camera rays through image planes, samples, volume rendering, loss'
    const picked = await pickReferences(project, { text, library: '/nonexistent' })
    const ids = picked.picked.map((entry) => entry.recipe.id)
    assert.equal(picked.excluded.get('nerf'), 'the request names that paper')
    assert.ok(!ids.includes('nerf'))
    assert.equal(ids.length, 3)
    assert.ok(
      ids.every((id) => RECIPES.find((recipe) => recipe.id === id).genre === '3d-vision'),
      ids.join()
    )
  })
})

test('the figure page, --exclude, the environment and the manuscript leave a paper out', async () => {
  await withProject(async (project) => {
    const page = { paper: { id: 'rt-2', arxiv: '2307.15818' } }
    const fromPage = await excludedReferences(project, { page })
    assert.equal(fromPage.get('rt-2'), "this figure's own paper")
    const asked = await excludedReferences(project, { exclude: ['2312.00752', 'DenseNet'] })
    assert.ok(asked.has('mamba') && asked.has('densenet'))
    process.env.ASTER_FIGURE_REFS_EXCLUDE = 'var'
    try {
      assert.ok((await excludedReferences(project, {})).has('var'))
    } finally {
      delete process.env.ASTER_FIGURE_REFS_EXCLUDE
    }
    await mkdir(path.join(project, 'paper'), { recursive: true })
    await writeFile(
      path.join(project, 'paper/main.tex'),
      '\\title{FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness}'
    )
    const byTitle = await excludedReferences(project, { manuscript: 'paper/main.tex' })
    assert.equal(byTitle.get('flashattention'), 'the manuscript is that paper')
    // A request that only mentions a method in passing does not leave its paper out.
    const recipe = RECIPES.find((item) => item.id === 'nerf')
    assert.ok(!textNamesPaper(recipe, '출발점은 처음부터 학습하는 NeRF이고, MLP가 density를 낸다'))
    assert.ok(textNamesPaper(recipe, 'the NeRF paper, Fig. 2'))
    assert.ok(namesPaper(recipe, 'arXiv:2003.08934'))
  })
})

test('--kind filters by genre or figure kind, and an unknown kind lists the kinds', async () => {
  await withProject(async (project) => {
    const systems = await pickReferences(project, { kind: 'systems', text: 'memory tiles kernel' })
    assert.ok(systems.picked.some((entry) => entry.recipe.id === 'flashattention'))
    await assert.rejects(pickReferences(project, { kind: 'cooking' }), /Genres: 3d-vision/)
  })
})

test('figures refs prints recipes with the local image path, from the project settings', async () => {
  await withProject(async (project) => {
    const library = path.join(project, 'refs-library')
    await mkdir(path.join(library, 'img'), { recursive: true })
    for (const id of ['var', 'densenet', 'nerf']) {
      await writeFile(path.join(library, 'img', `${id}.png`), encodePng(1, 1, [255, 255, 255]))
    }
    await writeFile(
      path.join(project, '.aster/figures/references.json'),
      JSON.stringify({ library: 'refs-library' })
    )
    await run('node', [CLI, 'figures', 'new', '--name', 'scales', '--size', 'double'], {
      cwd: project
    })
    const { stdout } = await run(
      'node',
      [
        CLI,
        'figures',
        'refs',
        '--figure',
        'scales',
        '--for',
        'multi-scale token maps, resolution grows',
        '--exclude',
        'nerf'
      ],
      { cwd: project, env: { ...process.env, ASTER_FIGURE_REFERENCES: '' } }
    )
    assert.match(stdout, /1\. var: /)
    assert.match(
      stdout,
      new RegExp(`Look at: ${path.join(library, 'img/var.png').replace(/[/.]/g, '\\$&')}`)
    )
    assert.match(stdout, /Left out: nerf \(asked to leave out\)/)
    assert.match(stdout, /Style DNA/)
    assert.match(stdout, /Following <id>|Pick ONE recipe/)
    const refused = await run('node', [CLI, 'figures', 'refs', 'nerf', '--exclude', 'nerf'], {
      cwd: project
    }).catch((error) => error)
    assert.match(String(refused.stderr), /left out for this figure/)
  })
})

test('a request in its own words finds the concept: a hierarchy of windows is multi-scale', async () => {
  await withProject(async (project) => {
    const swin = await pickReferences(project, {
      text: 'hierarchical feature map, patches merge into larger patches, local windows, Swin vs ViT'
    })
    assert.equal(swin.picked[0].recipe.id, 'var')
    const { stdout } = await run(
      'node',
      [CLI, 'figures', 'refs', '--for', 'two streams with joint attention and modulation'],
      { cwd: project }
    )
    assert.match(stdout, /loose matches/)
  })
})
