import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { parse } from 'yaml'
import { compileAggregateExpression } from './pr-aggregate-gate-context.mjs'

const workflow = parse(readFileSync('.github/workflows/node-server-tests.yml', 'utf8'))
const persistence = workflow.jobs.persistence
const shouldPersist = compileAggregateExpression(persistence.if, ['needs', 'github'])

function context({ qualification, event = 'pull_request', draft = false }) {
  return {
    github: { event_name: event, event: { pull_request: { draft } } },
    needs: { changes: { outputs: { qualification } } }
  }
}

it.each([
  { qualification: 'true', expected: true },
  { qualification: '', expected: true },
  { qualification: 'false', expected: true },
  { qualification: 'false', draft: true, expected: false },
  { event: 'workflow_dispatch', expected: true },
  { event: 'schedule', expected: true }
])('runs persistence for qualification and test-only selections: %j', (scenario) => {
  const ctx = context(scenario)
  expect(persistence.needs).toBe('changes')
  expect(shouldPersist(ctx).coerceString()).toBe(String(scenario.expected))
  expect(shouldPersist(ctx, true).coerceString()).toBe('false')
})

it('starts independent Linux qualification without waiting for another platform', () => {
  for (const name of ['linux_glibc_floor', 'linux_glibc217_compat', 'linux_musl']) {
    const job = workflow.jobs[name]
    expect([job.needs].flat()).not.toContain('persistence')
    expect(job.if).not.toContain('needs.persistence')
    const evaluate = compileAggregateExpression(job.if, ['needs', 'github', 'inputs'])
    const ctx = { ...context({ qualification: 'true' }), inputs: { build_template: true } }
    expect(evaluate(ctx).coerceString()).toBe('true')
    expect(evaluate(ctx, true).coerceString()).toBe('false')
    const draft = {
      ...context({ qualification: '', draft: true }),
      inputs: { build_template: false }
    }
    expect(evaluate(draft).coerceString()).toBe('false')
  }
})

it('prepares template dependencies before waiting for every qualification lane', () => {
  const template = workflow.jobs.desktop_template
  expect(template.needs).toBe('changes')
  expect(template.permissions).toEqual({ contents: 'read', actions: 'read' })
  const evaluate = compileAggregateExpression(template.if, ['inputs'])
  expect(evaluate({ inputs: { build_template: true } }).coerceString()).toBe('true')
  expect(evaluate({ inputs: { build_template: false } }).coerceString()).toBe('false')
  expect(evaluate({ inputs: { build_template: true } }, true).coerceString()).toBe('false')
  const wait = template.steps.findIndex(
    (step) => step.name === 'Wait for every template qualification lane'
  )
  expect(
    template.steps.findIndex((step) => step.uses?.includes('install-node-dependencies'))
  ).toBeLessThan(wait)
  expect(
    template.steps.findIndex((step) => step.name === "Collect every lane's slot")
  ).toBeGreaterThan(wait)
})

it('avoids template download-cache transfers while retaining native and verification caches', () => {
  const install = persistence.steps.find((step) => step.id === 'dependencies')
  expect(install.with['native-runtime']).toContain("runner.os == 'Windows' && 'node'")
  expect(install.with['cache-pnpm-verification']).toBeUndefined()
  expect(install.with['persist-native-cache']).toBeUndefined()
  const source = install.with['cache-pnpm-store'].slice(3, -2)
  for (const os of ['Linux', 'macOS', 'Windows']) {
    for (const buildTemplate of [true, false]) {
      expect(
        runInNewContext(source, {
          inputs: { build_template: buildTemplate, fast_runners: false },
          matrix: { os: '' },
          runner: { os }
        })
      ).toBe(!buildTemplate && os !== 'Windows')
    }
  }
})

it.each(['persistence', 'linux_glibc_floor', 'linux_musl'])(
  '%s waits through the dependency graph without polling the Actions API',
  (name) => {
    const job = workflow.jobs[name]
    expect(job.needs).toBe('changes')
    expect(job.steps.some((step) => step.uses?.includes('github-script'))).toBe(false)
    const evaluate = compileAggregateExpression(job.if, ['needs', 'github', 'inputs'])
    const ctx = { ...context({ qualification: 'true' }), inputs: { build_template: true } }
    expect(evaluate(ctx).coerceString()).toBe('true')
  }
)

it('prepares every native lane before building the server', () => {
  for (const name of ['persistence', 'linux_glibc_floor', 'linux_musl']) {
    const job = workflow.jobs[name]
    const build = job.steps.findIndex(
      (step) => step.run === 'pnpm build:orcad' || step.run?.includes('pnpm build:orcad\n')
    )
    const prepare = job.steps.findIndex(
      (step) =>
        step.uses?.includes('prepare-orcad-prebuilds') ||
        step.run?.includes('pnpm build:orcad-prebuilds')
    )
    expect(job.needs).toBe('changes')
    expect(prepare).toBeGreaterThan(-1)
    expect(prepare).toBeLessThan(build)
    expect(job.permissions).toEqual({ contents: 'read' })
  }
  const alpine = workflow.jobs.linux_musl.steps
  const prepare = alpine.find((step) => step.name === 'Prepare native Alpine artifact')
  const verify = alpine.find(
    (step) => step.name === 'Verify native Alpine artifact and persistence'
  )
  const cleanup = alpine.find((step) => step.name === 'Clean up the Alpine qualification container')
  expect(prepare.run).toContain('--detach --name orcad-alpine')
  expect(prepare.run).toContain('docker exec -i orcad-alpine')
  expect(prepare.run).not.toContain('pnpm build:orcad\n')
  expect(verify.run).toContain('docker exec -i orcad-alpine')
  expect(verify.run).toContain('pnpm build:orcad\n')
  expect(verify.run).toContain('pnpm test:node-server --artifact')
  expect(cleanup.if).toBe('always()')
})
