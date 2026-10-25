#!/usr/bin/env node
// Seeds the demo's quality layer (Experiment briefs, agent findings, rerun proposals, sample
// ratings, Run notes, summaries) and the "Denoiser samples" media Experiment on a copy of the base
// demo (the four original Experiments), using only the Aster harness CLI. Zero dependencies; needs
// git and tar for --fresh and uses ffmpeg for the rollout videos when it is on PATH.
//
//   node scripts/seed-quality-demo.mjs --fresh DIR [--base-ref REF]
//       Export the base demo from git into DIR (REF defaults to the parent of the commit that
//       added this script, or HEAD while it is uncommitted), add this checkout's scripts/,
//       configs/, and base train.log files, commit DIR as a throwaway git repo so new Runs record
//       a clean commit, then seed it.
//   node scripts/seed-quality-demo.mjs --project DIR
//       Seed DIR in place; it must be a copy of the base demo.
//   --harness PATH   harness CLI (default: $ASTER_HARNESS, else ../../src/research-harness/cli.mjs)
//
// The story itself is in seed-quality-demo-story.mjs; harness calls in seed-quality-demo-harness.mjs.
import { spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import {
  catalog,
  catalogRunDirectories,
  claude,
  cli,
  step,
  targetProject,
  user
} from './seed-quality-demo-harness.mjs'
import { DENOISER, LORA, LR, SCAFFOLD, seedStory, WARMUP } from './seed-quality-demo-story.mjs'
import { seedAnalyses } from './seed-quality-demo-analyses.mjs'

const demo = resolve(import.meta.dirname, '..')
const BASE_EXPERIMENTS = {
  [SCAFFOLD]: 'Demo ablation',
  [LR]: 'Learning-rate sweep',
  [LORA]: 'LoRA rank ablation',
  [WARMUP]: 'Warmup schedule'
}

try {
  const options = parseOptions(process.argv.slice(2))
  if (Boolean(options.fresh) === Boolean(options.project)) {
    throw new Error('usage: --fresh DIR [--base-ref REF] | --project DIR, plus [--harness PATH]')
  }
  const harness = resolve(
    options.harness ?? process.env.ASTER_HARNESS ?? join(demo, '../../src/research-harness/cli.mjs')
  )
  if (!existsSync(harness)) {
    throw new Error(`harness CLI not found: ${harness} (pass --harness PATH)`)
  }
  const project = resolve(options.fresh ?? options.project)
  if (options.fresh) {
    prepareFreshCopy(project, options['base-ref'])
  }
  targetProject(project, harness)
  checkBase(project)
  repairBaseLayout(project)
  seedStory()
  seedAnalyses()
  for (const slug of [SCAFFOLD, LR, LORA, WARMUP, DENOISER]) {
    step(`organize ${slug}: ${cli(claude, ['organize', '--experiment', slug]).organized} Runs`)
  }
  keepEmptyFolders(project)
  const issues = cli(user, ['validate'], { allowFailure: true }).issues ?? []
  console.log(`\nSeeded ${project}\nvalidate: ${issues.length} issue(s)`)
  for (const issue of issues) {
    console.log(`  ${issue}`)
  }
  if (options.fresh) {
    console.log(
      `To replace the committed demo data:\n  rsync -a --delete --exclude 'library/papers/*.pdf' ${project}/.aster/ ${demo}/.aster/`
    )
  }
} catch (error) {
  console.error(`seed-quality-demo: ${error.message}`)
  process.exit(1)
}

function parseOptions(argv) {
  const parsed = {}
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index].startsWith('--') || index + 1 >= argv.length) {
      throw new Error(`unexpected argument: ${argv[index]}`)
    }
    parsed[argv[index].slice(2)] = argv[index + 1]
  }
  return parsed
}

function run(command, args, settings = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    ...settings
  })
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args[0]} failed: ${result.error?.message ?? result.stderr}`)
  }
  return result.stdout
}

function prepareFreshCopy(target, baseRef) {
  if (existsSync(target) && readdirSync(target).length) {
    throw new Error(`${target} is not empty`)
  }
  mkdirSync(target, { recursive: true })
  const root = run('git', ['-C', demo, 'rev-parse', '--show-toplevel']).trim()
  const demoPath = relative(root, demo).split('\\').join('/')
  const script = `${demoPath}/scripts/seed-quality-demo.mjs`
  const added = run('git', [
    '-C',
    root,
    'log',
    '--diff-filter=A',
    '--format=%H',
    '-1',
    '--',
    script
  ])
  const ref = baseRef ?? (added.trim() ? `${added.trim()}^` : 'HEAD')
  const archive = run('git', ['-C', root, 'archive', '--format=tar', ref, demoPath], {
    encoding: 'buffer'
  })
  const depth = String(demoPath.split('/').length)
  run('tar', ['-x', '-f', '-', '-C', target, '--strip-components', depth], { input: archive })
  cpSync(join(demo, 'scripts'), join(target, 'scripts'), { recursive: true })
  cpSync(join(demo, 'configs'), join(target, 'configs'), { recursive: true })
  // Why: the repository ignores *.log, so older commits carry no train.log for the base Runs.
  for (const directory of catalogRunDirectories(target)) {
    const log = join(directory, 'train.log')
    const original = join(demo, relative(target, log))
    if (!existsSync(log) && existsSync(original)) {
      copyFileSync(original, log)
    }
  }
  const author = ['-c', 'user.email=demo@example.com', '-c', 'user.name=Aster Demo']
  run('git', ['init', '-q'], { cwd: target })
  run('git', [...author, 'add', '-A'], { cwd: target })
  run('git', [...author, 'commit', '-q', '-m', 'demo: training and rendering scripts'], {
    cwd: target
  })
  console.log(`Base demo from ${ref} in ${target}`)
}

function checkBase(project) {
  if (!existsSync(join(project, '.aster/project.json'))) {
    throw new Error(`${project} has no .aster/project.json`)
  }
  const slugs = catalog().experiments.map((experiment) => experiment.slug)
  const missing = Object.keys(BASE_EXPERIMENTS).filter((slug) => !slugs.includes(slug))
  if (missing.length) {
    throw new Error(`${project} is not the base demo: no ${missing.join(', ')}`)
  }
  const ledgers = ['quality.jsonl', 'proposals.jsonl', 'ratings.jsonl']
  const seeded =
    slugs.includes(DENOISER) ||
    slugs.some((slug) =>
      ledgers.some((file) => existsSync(join(project, '.aster/experiments', slug, file)))
    )
  if (seeded) {
    throw new Error(`${project} already has the quality layer; seed a fresh copy (--fresh DIR)`)
  }
}

// Git keeps no empty folders, and older revisions wrote outputs.jsonl under artifacts/.
function repairBaseLayout(project) {
  for (const name of Object.values(BASE_EXPERIMENTS)) {
    cli(user, ['experiment', '--name', name])
  }
  for (const directory of catalogRunDirectories()) {
    mkdirSync(join(directory, 'artifacts'), { recursive: true })
    const original = join(directory, 'artifacts/outputs.jsonl')
    const linked = join(directory, 'outputs.jsonl')
    // Why a copy: rank-16 attaches the original by reference, so it stays where it was written.
    if (existsSync(original) && !existsSync(linked)) {
      copyFileSync(original, linked)
      step(`outputs.jsonl placed in ${relative(project, directory)}`)
    }
  }
}

// Validate needs each Experiment's analysis/ and each Run's artifacts/; git keeps no empty folder.
function keepEmptyFolders(project) {
  const folders = [
    ...catalog().experiments.map((experiment) => join(project, experiment.path, 'analysis')),
    ...catalogRunDirectories().map((directory) => join(directory, 'artifacts'))
  ]
  for (const folder of folders) {
    if (existsSync(folder) && readdirSync(folder).length === 0) {
      writeFileSync(join(folder, '.gitkeep'), '')
    }
  }
}
