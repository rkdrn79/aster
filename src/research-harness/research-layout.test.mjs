import assert from 'node:assert/strict'
import { cp, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  initialCatalog,
  readCatalog,
  recordPathsOutsideCode,
  resolveProjectRoot
} from './research-catalog.mjs'
import { addClaim } from './research-claims.mjs'
import { projectLayout } from './research-layout.mjs'
import { migrateProjectLayout } from './research-migrate.mjs'
import { createExperiment, createRun, initializeResearchProject } from './research-project.mjs'
import { validateResearchProject } from './research-validation.mjs'

async function temporaryProject(work) {
  // Why realpath: macOS tmpdir is a symlink, and the harness reports resolved paths.
  const project = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-layout-')))
  try {
    await work(project)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

async function exists(target) {
  return lstat(target).then(
    () => true,
    () => false
  )
}

/** A project as the harness set it up before ADR-004. */
async function legacyProject(project) {
  await mkdir(path.join(project, 'research', 'experiments'), { recursive: true })
  await mkdir(path.join(project, 'research', 'manuscript'), { recursive: true })
  await mkdir(path.join(project, 'research', 'references', 'papers'), { recursive: true })
  await writeFile(
    path.join(project, 'research', 'project.json'),
    `${JSON.stringify(initialCatalog, null, 2)}\n`
  )
  await writeFile(path.join(project, 'research', 'references', 'library.bib'), '')
  await writeFile(
    path.join(project, 'research', 'manuscript', 'main.tex'),
    String.raw`\documentclass{article}
\begin{document}
Ours reaches 0.75 accuracy.
\includegraphics[width=0.5\linewidth]{../experiments/main/analysis/curve.png}
\bibliographystyle{plain}
\bibliography{../references/library}
\end{document}
`
  )
}

async function metricRun(project, id, value) {
  const run = await createRun(project, { experiment: 'main', name: `seed ${id}`, id })
  await writeFile(
    run.paths.metrics,
    `${JSON.stringify({ schemaVersion: 1, runId: id, step: 1, metrics: { acc: value } })}\n`
  )
  return run
}

test('a new project gets .aster/ and paper/, and project.json lists no Runs', async () => {
  await temporaryProject(async (project) => {
    const result = await initializeResearchProject(project)
    assert.equal(result.layout, 'aster')
    assert.equal(result.files.manuscriptSource, path.join(project, 'paper', 'main.tex'))
    assert(await exists(path.join(project, '.aster', '.gitignore')))
    assert(await exists(path.join(project, '.aster', 'library', 'papers')))
    assert.equal(await exists(path.join(project, 'research')), false)
    await createExperiment(project, 'Main')
    const run = await metricRun(project, 'seed-1', 0.7)
    const stored = JSON.parse(await readFile(path.join(project, '.aster', 'project.json'), 'utf8'))
    assert.equal(stored.schemaVersion, 2)
    assert.equal(stored.experiments, undefined)
    const catalog = await readCatalog(project)
    assert.deepEqual(
      catalog.experiments.map((experiment) => [experiment.slug, experiment.path]),
      [['main', '.aster/experiments/main']]
    )
    assert.equal(
      catalog.experiments[0].runs[0].manifest,
      '.aster/experiments/main/runs/seed-1/run.json'
    )
    assert.deepEqual((await validateResearchProject(project)).issues, [])
    await rm(run.paths.log, { force: true })
    await rm(run.paths.artifacts, { recursive: true, force: true })
    await rm(path.join(project, '.aster', 'experiments', 'main', 'analysis'), {
      recursive: true,
      force: true
    })
    assert.deepEqual((await validateResearchProject(project)).issues, [])
  })
})

test('Runs recorded in another clone appear by folder without touching project.json', async () => {
  await temporaryProject(async (project) => {
    await createExperiment(project, 'Main')
    const local = await metricRun(project, 'local-1', 0.7)
    const before = await readFile(path.join(project, '.aster', 'project.json'), 'utf8')
    // A Run made on a cluster checkout arrives as a new folder, as a git merge would bring it.
    await temporaryProject(async (cluster) => {
      await createExperiment(cluster, 'Main')
      const remote = await metricRun(cluster, 'cluster-1', 0.8)
      await cp(remote.paths.run, path.join(path.dirname(local.paths.run), 'cluster-1'), {
        recursive: true
      })
    })
    assert.equal(await readFile(path.join(project, '.aster', 'project.json'), 'utf8'), before)
    const runs = (await readCatalog(project)).experiments[0].runs.map((run) => run.id)
    assert.deepEqual(runs.sort(), ['cluster-1', 'local-1'])
    assert.deepEqual((await validateResearchProject(project)).issues, [])
  })
})

test('a pre-ADR-004 research/ project keeps its tree and catalog', async () => {
  await temporaryProject(async (project) => {
    await legacyProject(project)
    assert.equal(projectLayout(project).kind, 'legacy')
    const result = await initializeResearchProject(project)
    assert.equal(result.layout, 'legacy')
    assert.equal(await exists(path.join(project, '.aster')), false)
    await createExperiment(project, 'Main')
    await metricRun(project, 'seed-1', 0.75)
    const stored = JSON.parse(
      await readFile(path.join(project, 'research', 'project.json'), 'utf8')
    )
    assert.equal(
      stored.experiments[0].runs[0].manifest,
      'research/experiments/main/runs/seed-1/run.json'
    )
    await mkdir(path.join(project, 'research', 'experiments', 'main', 'analysis'), {
      recursive: true
    })
    assert.deepEqual((await validateResearchProject(project)).issues, [])
    const nested = path.join(project, 'src', 'models')
    await mkdir(nested, { recursive: true })
    assert.equal(await resolveProjectRoot(null, nested), project)
  })
})

test('migrate moves research/ to .aster/ and paper/, fixing TeX and claim paths', async () => {
  await temporaryProject(async (project) => {
    await legacyProject(project)
    await createExperiment(project, 'Main')
    await metricRun(project, 'seed-1', 0.75)
    await addClaim(project, {
      text: 'Ours reaches 0.75',
      evidence: { run: 'main/seed-1', metric: 'acc' },
      manuscript: { line: 3 }
    })
    const before = await readCatalog(project)

    const plan = await migrateProjectLayout(project, { dryRun: true })
    assert(plan.moved.some((move) => move.from === 'research/manuscript' && move.to === 'paper'))
    assert(await exists(path.join(project, 'research', 'project.json')))

    const result = await migrateProjectLayout(project)
    assert.deepEqual(result.leftovers, [])
    assert.equal(await exists(path.join(project, 'research')), false)
    assert.equal(projectLayout(project).kind, 'aster')
    assert(await exists(path.join(project, '.aster', 'local', 'research-project.v1.json')))
    const tex = await readFile(path.join(project, 'paper', 'main.tex'), 'utf8')
    assert.match(tex, /\\bibliography\{library\}/u)
    assert.match(tex, /\{\.\.\/\.aster\/experiments\/main\/analysis\/curve\.png\}/u)
    const claims = JSON.parse(await readFile(path.join(project, '.aster', 'claims.json'), 'utf8'))
    assert.equal(claims.claims[0].manuscript.file, 'paper/main.tex')

    const after = await readCatalog(project)
    assert.equal(after.manuscript.source, 'paper/main.tex')
    assert.equal(after.references.bibliography, 'paper/library.bib')
    assert.equal(after.references.papers, '.aster/library/papers')
    assert.deepEqual(
      after.experiments.map((experiment) => [
        experiment.slug,
        experiment.runs.map((run) => run.id)
      ]),
      before.experiments.map((experiment) => [
        experiment.slug,
        experiment.runs.map((run) => run.id)
      ])
    )
    const validation = await validateResearchProject(project)
    assert.deepEqual(validation.issues, [])
    assert.equal(validation.claims.verified, 1)
    await assert.rejects(migrateProjectLayout(project), { code: 'already_exists' })
  })
})

test('Run code capture leaves out the record tree and the manuscript folder, never the root', async () => {
  await temporaryProject(async (project) => {
    await initializeResearchProject(project)
    assert.deepEqual(await recordPathsOutsideCode(project), [
      { path: '.aster', directory: true },
      { path: 'paper', directory: true }
    ])
    const stored = JSON.parse(await readFile(path.join(project, '.aster', 'project.json'), 'utf8'))
    stored.manuscript.source = 'main.tex'
    stored.references.bibliography = 'refs/library.bib'
    await writeFile(path.join(project, '.aster', 'project.json'), JSON.stringify(stored))
    assert.deepEqual(await recordPathsOutsideCode(project), [
      { path: '.aster', directory: true },
      { path: 'refs/library.bib', directory: false }
    ])
  })
})
