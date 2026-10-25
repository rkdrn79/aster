import { expect, it } from 'vitest'
import { classifyPrJobs } from './pr-code-change-scope.mjs'

it.each([
  'src/packages/process-host/package.json',
  'src/packages/process-host/src/run-process.ts',
  'src/packages/process-host/src/growing-byte-buffer.ts'
])('runs the packaged surfaces for %s', (file) => {
  expect(classifyPrJobs([file])).toMatchObject({
    should_run: true,
    test: true,
    typecheck: true,
    package: true,
    package_windows: true
  })
})

it.each([
  'src/packages/process-host/src/run-process.ts',
  'config/scripts/smoke-process-host-node18.mjs',
  'config/scripts/packaged-process-host-fixture.mjs'
])('qualifies the Node 18 package floor for %s', (file) => {
  expect(classifyPrJobs([file]).managed_hook_node18).toBe(true)
})
