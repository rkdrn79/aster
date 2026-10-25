import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { parse } from 'yaml'
import { classifyPrJobs } from './pr-code-change-scope.mjs'

// The formatting check reads the whole tree, so a diff that skipped it would land drift that then
// fails every later PR's merge ref.
it.each(['README.md', '.github/ISSUE_TEMPLATE/bug.yml', '.github/pull_request_template.md'])(
  'runs static analysis, and only it, for a %s diff the formatter reads',
  (file) => {
    expect(classifyPrJobs([file])).toMatchObject({
      should_run: false,
      static_analysis: true,
      typecheck: false,
      test: false
    })
  }
)

it('leaves paths the formatter skips out of static analysis', () => {
  expect(classifyPrJobs(['docs/assets/logo.png']).static_analysis).toBe(false)
})

it('checks out the formatter config the detector reads its ignores from', () => {
  const workflow = parse(readFileSync('.github/workflows/pr.yml', 'utf8'))
  expect(workflow.jobs.code_paths.steps[0].with['sparse-checkout']).toContain('/.oxfmtrc.json')
})
