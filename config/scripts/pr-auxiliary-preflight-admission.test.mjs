import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it } from 'vitest'
import { runProcessSync } from '@orca/process-host'
import { parse } from 'yaml'
import { classifyPrJobs } from './pr-code-change-scope.mjs'

const workflow = parse(readFileSync('.github/workflows/pr.yml', 'utf8'))
const unit = parse(readFileSync('.github/workflows/unit-tests.yml', 'utf8'))
const relaySteps = unit.jobs.relay_integration.steps
const chrome = relaySteps.find((step) => step.name === 'Resolve Chrome for the browser provider')
const browser = relaySteps.find((step) => step.name === 'Test external Chromium browser provider')
const routes = [
  ['git_compatibility', 'src/shared/git-capability-cache.ts'],
  ['codex_index_heal_contract', 'src/main/codex/codex-session-index-heal.ts'],
  ['xterm_patch_sync', 'config/patches/xterm-upstream.json'],
  ['shell_contracts', 'src/main/pty/pty-manager.ts'],
  ['orcad_browser', 'src/main/orcad/orcad-browser-provider.ts'],
  ['cross-version-wire', 'src/shared/orchestration-rpc-contract.ts'],
  ['managed_hook_node18', 'src/shared/agent-hook-status.ts']
]

function evaluate(expression, context) {
  return runInNewContext(
    expression
      .replace(/^\$\{\{\s*|\s*\}\}$/g, '')
      .replaceAll('.cross-version-wire', '["cross-version-wire"]'),
    context
  )
}

function routedOutputs(files, reused, options) {
  const scope = classifyPrJobs(files, options)
  const context = {
    steps: {
      readiness: { outputs: { reused } },
      filter: {
        outputs: Object.fromEntries(
          Object.entries(scope).map(([key, value]) => [key, String(value)])
        )
      }
    }
  }
  return Object.fromEntries(
    ['test', 'static_analysis', 'typecheck', ...routes.map(([job]) => job)].map((name) => [
      name,
      String(evaluate(workflow.jobs.code_paths.outputs[name], context))
    ])
  )
}

describe.each(routes)('%s preflight admission', (jobName, changedFile) => {
  const job = workflow.jobs[jobName === 'orcad_browser' ? 'test' : jobName]
  const condition =
    jobName === 'orcad_browser' ? `(${job.if}) && (${chrome.if}) && (${browser.if})` : job.if

  it('waits for the detector and physical preflight job', () => {
    expect(job.needs).toEqual(['code_paths', 'preflight'])
    expect(job.if).toContain('!cancelled()')
    expect(job['continue-on-error']).toBeUndefined()
  })

  it.each([
    { name: 'all prerequisites pass', admitted: true },
    { name: 'preflight fails', preflight: 'failure', admitted: false },
    { name: 'preflight is cancelled', preflight: 'cancelled', admitted: false },
    { name: 'preflight skips', preflight: 'skipped', admitted: false },
    { name: 'preflight result is missing', preflight: '', admitted: false },
    { name: 'preflight is unfinished', preflight: null, admitted: false },
    { name: 'detector fails', detector: 'failure', admitted: false },
    { name: 'detector is cancelled', detector: 'cancelled', admitted: false },
    { name: 'detector skips', detector: 'skipped', admitted: false },
    { name: 'detector result is missing', detector: '', admitted: false },
    { name: 'detector is unfinished', detector: null, admitted: false },
    { name: 'route is unselected', selected: 'false', admitted: false },
    { name: 'route is missing', selected: '', admitted: false },
    { name: 'route is absent', selected: null, admitted: false },
    { name: 'route is unknown', selected: 'unknown', admitted: false },
    { name: 'workflow is cancelled', cancelled: true, admitted: false }
  ])('evaluates the actual workflow condition: $name', (scenario) => {
    const context = {
      cancelled: () => scenario.cancelled ?? false,
      success: () => true,
      inputs: {},
      needs: {
        code_paths: {
          result: scenario.detector === undefined ? 'success' : (scenario.detector ?? undefined),
          outputs: {
            test: 'true',
            [jobName]: scenario.selected === undefined ? 'true' : (scenario.selected ?? undefined)
          }
        },
        preflight: {
          result: scenario.preflight === undefined ? 'success' : (scenario.preflight ?? undefined)
        }
      }
    }
    if (jobName === 'orcad_browser') {
      context.inputs.browser_contract = evaluate(job.with.browser_contract, context)
    }
    expect(evaluate(condition, context)).toBe(scenario.admitted)
  })

  it.each([
    { files: [] },
    { files: ['package.json'] },
    { files: ['.github/workflows/pr.yml'] },
    { files: [changedFile] }
  ])(
    'requires unit work and preflight whenever the real classifier selects $files',
    ({ files }) => {
      const selected = routedOutputs(files, 'false')
      expect(selected[jobName]).toBe('true')
      expect(selected.test).toBe('true')
      expect(selected.static_analysis).toBe('true')
      expect(selected.typecheck).toBe('true')
    }
  )

  it.each(['true', 'false', undefined])(
    'honors the actual readiness-masked output when reuse is %s',
    (reused) => {
      const outputs = routedOutputs([changedFile], reused)
      expect(outputs[jobName]).toBe(String(reused !== 'true'))
      expect(outputs.test).toBe(String(reused !== 'true'))
      const context = {
        cancelled: () => false,
        success: () => true,
        inputs: {},
        needs: { code_paths: { result: 'success', outputs }, preflight: { result: 'success' } }
      }
      if (jobName === 'orcad_browser') {
        context.inputs.browser_contract = evaluate(job.with.browser_contract, context)
      }
      expect(evaluate(condition, context)).toBe(reused !== 'true')
    }
  )
})

it.each([{ files: ['README.md'] }, { files: ['docs/reference/git-workflow.md'] }])(
  'does not add preflight consumers to a no-unit diff: $files',
  ({ files }) => {
    const outputs = routedOutputs(files, 'false')
    expect(outputs.test).toBe('false')
    for (const [name] of routes) {
      expect(outputs[name], name).toBe('false')
    }
  }
)

it('keeps the browser contract job and its steps blocking', () => {
  expect(unit.jobs.relay_integration['continue-on-error']).toBeUndefined()
  expect(chrome['continue-on-error']).toBeUndefined()
  expect(browser['continue-on-error']).toBeUndefined()
  expect(workflow.jobs.verify.needs).toContain('test')
})

it('guards both browser steps after setup or discovery failure and for default callers', () => {
  const context = {
    inputs: { browser_contract: true },
    success: () => true
  }
  expect(evaluate(chrome.if, context)).toBe(true)
  expect(evaluate(browser.if, context)).toBe(true)
  context.success = () => false
  expect(evaluate(chrome.if, context)).toBe(false)
  expect(evaluate(browser.if, context)).toBe(false)
  context.success = () => true
  context.inputs.browser_contract = unit.on.workflow_call.inputs.browser_contract.default
  expect(evaluate(chrome.if, context)).toBe(false)
  expect(evaluate(browser.if, context)).toBe(false)
})

describe('browser contract job admission', () => {
  const admitted = (files) => {
    const outputs = routedOutputs(files, 'false')
    const runRelay = evaluate(workflow.jobs.test.with.run_relay_integration, {
      needs: { code_paths: { outputs } }
    })
    return evaluate(unit.jobs.relay_integration.if, {
      inputs: { run_relay_integration: runRelay }
    })
  }

  it('starts the job only when the browser contract is selected', () => {
    expect(admitted(['src/main/orcad/orcad-browser-provider.ts'])).toBe(true)
    expect(admitted(['src/main/runtime/orca-runtime.ts'])).toBe(false)
    expect(admitted(['src/renderer/src/components/right-sidebar/FileExplorer.tsx'])).toBe(false)
  })

  it('stays off for callers that do not opt in', () => {
    const relayDefault = unit.on.workflow_call.inputs.run_relay_integration.default
    expect(relayDefault).toBe(false)
    expect(
      evaluate(unit.jobs.relay_integration.if, { inputs: { run_relay_integration: relayDefault } })
    ).toBe(false)
    expect(unit.jobs.relay_integration.needs).toBeUndefined()
    expect(unit.jobs.test.if).toBeUndefined()
  })
})

const scopeDirectories = []
afterEach(() => {
  for (const directory of scopeDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function createScopeRepository(withTool, toolPath, companionPaths = []) {
  const directory = mkdtempSync(join(tmpdir(), 'orca-pr-scope-'))
  scopeDirectories.push(directory)
  const root = resolve(import.meta.dirname, '../..')
  for (const file of [
    'package.json',
    'config/scripts/pr-code-change-scope.mjs',
    'config/scripts/pr-package-test-paths.mjs',
    'config/scripts/pr-layout-oracle-route.mjs',
    'config/scripts/git-pull-request-diff-base.mjs',
    'config/scripts/pr-e2e-source-routing.mjs',
    'config/scripts/ci-e2e-job-selection.mjs'
  ]) {
    mkdirSync(dirname(join(directory, file)), { recursive: true })
    copyFileSync(join(root, file), join(directory, file))
  }
  const git = (...args) => {
    const result = runProcessSync({ program: 'git', args, cwd: directory })
    expect(result.code, result.stderr).toBe(0)
    return result.stdout.trim()
  }
  const commit = () => {
    git('add', '-A')
    git(
      '-c',
      'commit.gpgsign=false',
      '-c',
      'core.hooksPath=/dev/null',
      'commit',
      '-qm',
      'scope input'
    )
    return git('rev-parse', 'HEAD')
  }
  git('init', '--quiet')
  git('config', 'user.name', 'Scope control')
  git('config', 'user.email', 'scope@example.invalid')
  const tool = join(directory, toolPath)
  mkdirSync(dirname(tool), { recursive: true })
  if (withTool) {
    writeFileSync(tool, 'export const revision = 1\n')
  }
  for (const file of companionPaths) {
    mkdirSync(dirname(join(directory, file)), { recursive: true })
    writeFileSync(join(directory, file), 'export const revision = 1\n')
  }
  const base = commit()
  const detect = (stepId = 'filter') => {
    const output = join(
      directory,
      stepId === 'filter' ? 'github-output' : `github-output-${stepId}`
    )
    const step = workflow.jobs.code_paths.steps.find((candidate) => candidate.id === stepId)
    const result = runProcessSync({
      program: 'bash',
      args: [
        '-e',
        '-c',
        step.run.replace('${{ github.event.pull_request.base.sha }}', '$BASE_SHA')
      ],
      cwd: directory,
      env: {
        ...process.env,
        BASE_SHA: base,
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_OUTPUT: output,
        ORCA_BACKGROUND_LAUNCH: '1'
      }
    })
    return { result, output }
  }
  return { directory, tool, git, commit, detect }
}

describe.skipIf(process.platform === 'win32')('Daemon mock complete Git change evidence', () => {
  const helper = 'src/main/daemon/daemon-init-dependency-mocks.ts'
  it('keeps real unit and type contracts while omitting unrelated packages for a modification', () => {
    const repo = createScopeRepository(true, helper)
    writeFileSync(repo.tool, 'export const revision = 2\n')
    repo.commit()
    const { result, output } = repo.detect()
    expect(result.code, result.stderr).toBe(0)
    const flags = readFileSync(output, 'utf8')
    expect(flags).toContain('package=false\n')
    expect(flags).toContain('package_windows=false\n')
    expect(flags).toContain('test=true\n')
    expect(flags).toContain('typecheck=true\n')
  })
  it('routes the complete four-file modification through the real detector', () => {
    const companions = [
      'src/main/native-chat/agent-session-wire/structured-agent-session-claude-queued-stop.test.ts',
      'config/scripts/process-host-build-dist.test.mjs',
      'src/main/codex/codex-app-server-connection.test.ts'
    ]
    const repo = createScopeRepository(true, helper, companions)
    for (const file of [helper, ...companions]) {
      writeFileSync(join(repo.directory, file), 'export const revision = 2\n')
    }
    repo.commit()
    const { result, output } = repo.detect()
    expect(result.code, result.stderr).toBe(0)
    const flags = readFileSync(output, 'utf8')
    for (const name of ['package', 'package_windows']) {
      expect(classifyPrJobs([helper, ...companions])[name]).toBe(true)
      expect(flags).toContain(`${name}=false\n`)
    }
    for (const name of ['test', 'static_analysis', 'typecheck', 'cross-version-wire']) {
      expect(flags).toContain(`${name}=true\n`)
    }
    const e2e = repo.detect('e2e_filter')
    expect(e2e.result.code, e2e.result.stderr).toBe(0)
    const routes = readFileSync(e2e.output, 'utf8')
    expect(routes).toContain('test_files=[]\n')
    expect(routes).toContain('should_run=false\n')
  })
  it.each(['addition', 'deletion', 'rename', 'type change'])(
    'keeps platform packages for an actual %s',
    (change) => {
      const repo = createScopeRepository(change !== 'addition', helper)
      if (change === 'addition') {
        writeFileSync(repo.tool, 'export const revision = 1\n')
      } else if (change === 'deletion') {
        rmSync(repo.tool)
      } else if (change === 'rename') {
        repo.git('mv', helper, helper.replace('.ts', '-renamed.ts'))
      } else {
        rmSync(repo.tool)
        symlinkSync('../../../config/scripts/pr-code-change-scope.mjs', repo.tool)
      }
      repo.commit()
      const { result, output } = repo.detect()
      expect(result.code, result.stderr).toBe(0)
      expect(readFileSync(output, 'utf8')).toContain('package=true\n')
      expect(readFileSync(output, 'utf8')).toContain('package_windows=true\n')
    }
  )
})
