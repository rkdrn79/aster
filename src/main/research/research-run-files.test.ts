import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildRemoteResearchRunReadCommand,
  parseRemoteResearchRunRead,
  type ResearchRunReadRequest
} from './research-run-files'

const location = {
  targetId: 'ssh-gpu',
  projectPath: "/data/me/it's here",
  experiment: 'lora-r16',
  runId: 'seed-42'
}
const request: ResearchRunReadRequest = { metricsFrom: 10, logFrom: 'tail', maxBytes: 64 }
const nonce = 'abc123'
const mark = `@@aster-${nonce}`

describe('SSH Run reads', () => {
  it('quotes the project path and asks for each file once', () => {
    const command = buildRemoteResearchRunReadCommand(
      { ...location, recordRoot: 'research' },
      request,
      nonce
    )
    expect(command).toContain(
      `'/data/me/it'\\''s here/research/experiments/lora-r16/runs/seed-42/run.json'`
    )
    expect(command).toContain('o=10;')
    expect(command).toContain('tail -c 64 ')
  })

  it('finds the record tree on the host when the location does not know it', () => {
    const command = buildRemoteResearchRunReadCommand(location, request, nonce)
    expect(command).toContain(
      `'/data/me/it'\\''s here'/"$R"/experiments/'lora-r16'/runs/'seed-42'/run.json`
    )
    // The prelude alone runs in any POSIX shell; check it picks each layout.
    const prelude = command.split('; printf')[0]
    const project = mkdtempSync(join(tmpdir(), 'aster-run-root-'))
    try {
      const root = (): string =>
        execFileSync(
          'sh',
          [
            '-c',
            `${prelude.replaceAll(location.projectPath.replaceAll("'", "'\\''"), project)}; printf %s "$R"`
          ],
          {
            encoding: 'utf8'
          }
        )
      expect(root()).toBe('.aster')
      mkdirSync(join(project, 'research'))
      writeFileSync(join(project, 'research', 'project.json'), '{}')
      expect(root()).toBe('research')
      mkdirSync(join(project, '.aster'))
      writeFileSync(join(project, '.aster', 'project.json'), '{}')
      expect(root()).toBe('.aster')
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
    const read = parseRemoteResearchRunRead(`${mark}-root\tresearch\n`, request, nonce)
    expect(read.recordRoot).toBe('research')
  })

  it('keeps whole lines and resumes where the last complete line ended', () => {
    const stdout = [
      `${mark}-stat\tmanifest\t42\t1761264000`,
      `${mark}-stat\tmetrics\t40\t1761264001`,
      `${mark}-stat\tlog\t100\t1761264002`,
      `${mark}-file\tmanifest`,
      '{"schemaVersion":1,"externalRunId":"seed-42"}',
      `${mark}-end`,
      `${mark}-file\tmetrics`,
      '{"step":2,"metrics":{"loss":1}}\n{"step":3,"met',
      `${mark}-end`,
      `${mark}-file\tlog`,
      `${'x'.repeat(46)}\nepoch 4\nCUDA OOM\n`,
      `${mark}-end`
    ].join('\n')
    const read = parseRemoteResearchRunRead(stdout, request, nonce)
    expect(read.manifest?.content).toBe('{"schemaVersion":1,"externalRunId":"seed-42"}')
    expect(read.manifest?.stat).toEqual({ size: 42, mtimeMs: 1761264000000 })
    expect(read.metrics.text).toBe('{"step":2,"metrics":{"loss":1}}\n')
    expect(read.metrics.nextOffset).toBe(
      10 + Buffer.byteLength('{"step":2,"metrics":{"loss":1}}\n')
    )
    // A tail read starts mid-line; the cut first line is dropped.
    expect(read.log.text).toBe('epoch 4\nCUDA OOM\n')
    expect(read.log.nextOffset).toBe(100)
  })

  it('reports missing files as absent', () => {
    const read = parseRemoteResearchRunRead(
      [
        `${mark}-stat\tmanifest\t-\t-`,
        `${mark}-stat\tmetrics\t-\t-`,
        `${mark}-stat\tlog\t-\t-`,
        `${mark}-file\tmanifest`,
        '',
        `${mark}-end`
      ].join('\n'),
      request,
      nonce
    )
    expect(read.manifest).toBeNull()
    expect(read.metrics.stat).toBeNull()
  })
})
