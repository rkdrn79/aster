import assert from 'node:assert/strict'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  createWandbPythonFinder,
  readWandbSettings,
  wandbChildEnvironment,
  wandbProjectSlug,
  wandbRunId,
  wandbSettingsFromCatalog
} from './research-wandb.mjs'

async function temporaryDirectory(task) {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'aster-wandb-')))
  try {
    await task(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

test('a catalog without wandb, or with it off, mirrors nothing', () => {
  assert.equal(wandbSettingsFromCatalog({ schemaVersion: 2 }, '/p/demo'), null)
  assert.equal(wandbSettingsFromCatalog({ wandb: { enabled: false, project: 'x' } }, '/p'), null)
  assert.equal(wandbSettingsFromCatalog({ wandb: 'yes' }, '/p'), null)
  assert.equal(wandbSettingsFromCatalog({ wandb: { enabled: 'true' } }, '/p'), null)
})

test('an enabled section is trimmed, and the project defaults to the folder name', () => {
  assert.deepEqual(
    wandbSettingsFromCatalog(
      { wandb: { enabled: true, entity: ' PoV_JEPA ', project: 'reusable-jepa' } },
      '/p/demo'
    ),
    { enabled: true, entity: 'PoV_JEPA', project: 'reusable-jepa', python: null }
  )
  assert.deepEqual(
    wandbSettingsFromCatalog(
      { wandb: { enabled: true, python: '~/envs/a/bin/python' } },
      '/x/My Repo'
    ),
    { enabled: true, entity: null, project: 'my-repo', python: '~/envs/a/bin/python' }
  )
})

test('names W&B would refuse are reported instead of used', () => {
  assert.match(
    wandbSettingsFromCatalog({ wandb: { enabled: true, project: 'a/b' } }, '/p').error,
    /W&B project/
  )
  assert.match(
    wandbSettingsFromCatalog({ wandb: { enabled: true, project: 'ok', entity: 'a:b' } }, '/p')
      .error,
    /W&B entity/
  )
})

test('settings are read from the stored catalog of an .aster or legacy project', async () => {
  await temporaryDirectory(async (directory) => {
    assert.equal(await readWandbSettings(directory), null)
    await mkdir(path.join(directory, '.aster'))
    await writeFile(
      path.join(directory, '.aster', 'project.json'),
      JSON.stringify({ schemaVersion: 2, wandb: { enabled: true, project: 'demo' } })
    )
    assert.equal((await readWandbSettings(directory)).project, 'demo')
  })
})

test('the W&B run ID is stable per project, Experiment and Run', () => {
  const id = wandbRunId({ project: 'demo', experiment: 'main', run: 'seed-1' })
  assert.match(id, /^aster-[0-9a-f]{16}$/u)
  assert.equal(id, wandbRunId({ project: 'demo', experiment: 'main', run: 'seed-1' }))
  assert.notEqual(id, wandbRunId({ project: 'demo', experiment: 'main', run: 'seed-2' }))
  assert.notEqual(id, wandbRunId({ project: 'demo', experiment: 'other', run: 'seed-1' }))
  assert.notEqual(id, wandbRunId({ project: 'other', experiment: 'main', run: 'seed-1' }))
})

test('the command gets project, entity, group and tags but never a run ID or name', () => {
  const env = wandbChildEnvironment({ project: 'demo', entity: 'team' }, 'main')
  assert.deepEqual(env, {
    WANDB_PROJECT: 'demo',
    WANDB_ENTITY: 'team',
    WANDB_RUN_GROUP: 'main',
    WANDB_TAGS: 'aster'
  })
  assert.equal(
    'WANDB_ENTITY' in wandbChildEnvironment({ project: 'demo', entity: null }, 'm'),
    false
  )
})

test('project slugs keep W&B-safe characters', () => {
  assert.equal(wandbProjectSlug('Reusable JEPA (v2)'), 'reusable-jepa-v2')
  assert.equal(wandbProjectSlug('한국어'), 'aster')
})

test('Python discovery tries the catalog, PATH, then conda envs, and caches the answer', async () => {
  const probed = []
  const usable = new Set(['/home/u/.conda/envs/b/bin/python'])
  const find = createWandbPythonFinder({
    home: '/home/u',
    platform: 'linux',
    probe: async (candidate) => {
      probed.push(candidate)
      return usable.has(candidate)
    },
    listCondaPythons: async () => [
      '/home/u/.conda/envs/a/bin/python',
      '/home/u/.conda/envs/b/bin/python'
    ]
  })
  assert.equal(await find('~/missing/python'), '/home/u/.conda/envs/b/bin/python')
  assert.deepEqual(probed, [
    '/home/u/missing/python',
    'python3',
    'python',
    '/home/u/.conda/envs/a/bin/python',
    '/home/u/.conda/envs/b/bin/python'
  ])
  await find('~/missing/python')
  assert.equal(probed.length, 5)

  usable.add('python3')
  const fresh = createWandbPythonFinder({
    home: '/home/u',
    platform: 'linux',
    probe: async (candidate) => usable.has(candidate),
    listCondaPythons: async () => assert.fail('conda envs are not scanned once PATH has wandb')
  })
  assert.equal(await fresh(), 'python3')
  assert.equal(await fresh('/opt/py/bin/python'), 'python3')
})

test('no Python with wandb resolves to null', async () => {
  const find = createWandbPythonFinder({
    probe: async () => false,
    listCondaPythons: async () => []
  })
  assert.equal(await find(), null)
})

test('conda envs are listed from the usual roots in name order', async () => {
  await temporaryDirectory(async (home) => {
    for (const env of ['zeta', 'alpha']) {
      await mkdir(path.join(home, '.conda', 'envs', env, 'bin'), { recursive: true })
    }
    await mkdir(path.join(home, 'miniconda3', 'envs', 'mid'), { recursive: true })
    const probed = []
    const find = createWandbPythonFinder({
      home,
      platform: 'linux',
      probe: async (candidate) => {
        probed.push(candidate)
        return false
      }
    })
    assert.equal(await find(), null)
    assert.deepEqual(probed.slice(2), [
      path.join(home, '.conda', 'envs', 'alpha', 'bin', 'python'),
      path.join(home, '.conda', 'envs', 'zeta', 'bin', 'python'),
      path.join(home, 'miniconda3', 'envs', 'mid', 'bin', 'python')
    ])
  })
})
