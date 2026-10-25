import assert from 'node:assert/strict'
import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { readCatalog } from './research-catalog.mjs'
import { addClaim, auditClaims, refreshClaim, scanUnbackedNumbers } from './research-claims.mjs'
import { createExperiment, createRun } from './research-project.mjs'
import { validateResearchProject } from './research-validation.mjs'

const manuscript = String.raw`\documentclass{article}
\usepackage{graphicx}
\newcommand{\gap}{0.25}
\begin{document}
Our model reaches 88.1\% validation accuracy.
\begin{equation} \lambda = 0.5 \end{equation}
\begin{table}
\begin{tabular}{lc}
Baseline & 0.731 \\[2pt]
Ours & 0.881 \\
\end{tabular}
\caption{Main results.}\label{tab:main}
\end{table}
\includegraphics[width=0.48\linewidth]{curve.pdf}
We use PyTorch 2.1 as described in Section~3.2 \cite{lora2.1}.
% 0.999 is commented out
\end{document}
`

async function fixtureProject(task) {
  const project = await mkdtemp(path.join(os.tmpdir(), 'aster-claims-'))
  try {
    await createExperiment(project, 'Main')
    const run = await createRun(project, {
      experiment: 'main',
      name: 'seed 1',
      id: 'seed-1',
      metricDefinitions: ['loss:minimize']
    })
    const events = [
      { step: 1, split: 'val', metrics: { acc: 0.85, loss: 0.6 } },
      { step: 2, split: 'val', metrics: { acc: 0.8812, loss: 0.4 } },
      { step: 3, split: 'val', metrics: { acc: 0.87, loss: 0.45 } },
      { step: 3, split: 'train', metrics: { loss: 0.2 } }
    ]
    await writeFile(
      run.paths.metrics,
      events
        .map((event) => `${JSON.stringify({ schemaVersion: 1, runId: 'seed-1', ...event })}\n`)
        .join('')
    )
    await writeFile(path.join(project, 'paper', 'main.tex'), manuscript)
    await task(project, run)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}

test('claims compute evidence from metrics and verify the number in the manuscript', async () => {
  await fixtureProject(async (project) => {
    const { claim, audit } = await addClaim(project, {
      text: 'Our model reaches 88.1% validation accuracy',
      evidence: { run: 'main/seed-1', metric: 'acc', split: 'val', select: 'step', step: 2 },
      manuscript: { line: 5 }
    })
    assert.equal(claim.id, 'claim-1')
    assert.equal(claim.evidence[0].value, 0.8812)
    assert.equal(claim.manuscript.file, 'paper/main.tex')
    assert.equal(audit.status, 'verified')
    assert.equal(audit.manuscript.values[0].text, '88.1\\%')
    const best = await addClaim(project, {
      text: 'Best validation loss',
      evidence: { run: 'seed-1', metric: 'loss', split: 'val', select: 'best' },
      manuscript: { anchor: 'tab:main' }
    })
    assert.equal(best.claim.evidence[0].value, 0.4)
    assert.equal(best.claim.evidence[0].direction, 'minimize')
    // 0.4 is not printed near the table, so the paper does not state the claimed value.
    assert.equal(best.audit.status, 'mismatch')
    assert.match(best.audit.reasons[0], /does not state 0.4 near the claim anchor/)
    assert.equal((await readCatalog(project)).claims, '.aster/claims.json')
  })
})

test('claim add refuses numbers the metrics do not support', async () => {
  await fixtureProject(async (project) => {
    await assert.rejects(
      addClaim(project, {
        text: 'x',
        evidence: { run: 'main/seed-1', metric: 'acc', split: 'val', value: 0.9 }
      }),
      { code: 'value_mismatch' }
    )
    await assert.rejects(
      addClaim(project, { text: 'x', evidence: { run: 'main/seed-1', metric: 'loss' } }),
      { code: 'missing_evidence', message: /several splits/ }
    )
    await assert.rejects(
      addClaim(project, { text: 'x', evidence: { run: 'main/seed-1', metric: 'f1' } }),
      { code: 'missing_evidence' }
    )
  })
})

test('audit separates stale, mismatch, and missing evidence', async () => {
  await fixtureProject(async (project, run) => {
    await addClaim(project, {
      id: 'final-acc',
      text: 'Final accuracy 0.87',
      evidence: { run: 'main/seed-1', metric: 'acc', split: 'val' }
    })
    await addClaim(project, {
      id: 'train-loss',
      text: 'Train loss 0.2',
      evidence: { run: 'main/seed-1', metric: 'loss', split: 'train', select: 'last' }
    })
    assert.deepEqual((await auditClaims(project)).summary, {
      total: 2,
      verified: 0,
      mismatch: 2,
      missingEvidence: 0,
      stale: 0
    })
    await writeFile(
      path.join(project, 'paper', 'main.tex'),
      manuscript.replace('Ours & 0.881', 'Ours & 0.870 & 0.2')
    )
    assert.equal((await auditClaims(project)).summary.verified, 2)

    await appendFile(
      run.paths.metrics,
      `${JSON.stringify({ schemaVersion: 1, runId: 'seed-1', step: 4, split: 'test', metrics: { acc: 0.5 } })}\n`
    )
    const stale = await auditClaims(project, { id: 'final-acc' })
    assert.equal(stale.claims[0].status, 'stale')

    await appendFile(
      run.paths.metrics,
      `${JSON.stringify({ schemaVersion: 1, runId: 'seed-1', step: 5, split: 'val', metrics: { acc: 0.9 } })}\n`
    )
    const changed = await auditClaims(project, { id: 'final-acc' })
    assert.equal(changed.claims[0].status, 'mismatch')
    assert.equal(changed.claims[0].evidence[0].currentValue, 0.9)
    assert(
      (await validateResearchProject(project)).issues.some((issue) =>
        issue.startsWith('Claim final-acc mismatch')
      )
    )
    const refreshed = await refreshClaim(project, 'final-acc')
    assert.deepEqual(refreshed.changes[0], {
      run: 'main/seed-1',
      metric: 'acc',
      from: 0.87,
      to: 0.9
    })

    // Why remove the folders: .aster lists Runs from their folders, not from project.json.
    await rm(path.join(project, '.aster', 'experiments', 'main', 'runs'), { recursive: true })
    const missing = await auditClaims(project)
    assert.equal(missing.summary.missingEvidence, 2)
    const ledger = JSON.parse(await readFile(path.join(project, '.aster', 'claims.json'), 'utf8'))
    assert.equal(ledger.claims.length, 2)
  })
})

test('scan lists result-like numbers without a backing claim and skips layout and references', async () => {
  await fixtureProject(async (project) => {
    const before = await scanUnbackedNumbers(project)
    assert.deepEqual(
      before.unbacked.map((item) => [item.line, item.text, item.where]),
      [
        [5, '88.1\\%', 'text'],
        [9, '0.731', 'table'],
        [10, '0.881', 'table']
      ]
    )
    await addClaim(project, {
      text: 'Accuracy',
      evidence: { run: 'main/seed-1', metric: 'acc', split: 'val', select: 'step', step: 2 },
      manuscript: { line: 5 }
    })
    const after = await scanUnbackedNumbers(project)
    assert.deepEqual(
      after.unbacked.map((item) => item.text),
      ['0.731']
    )
    assert.deepEqual(after.backed, 2)
  })
})
