import { z } from 'zod'
import {
  researchVerificationSummarySchema,
  type ResearchVerificationSummary
} from './research-harness-results'

const harnessResultSchema = z.object({
  checkedAt: z.string(),
  scope: z.object({ experiment: z.string().nullable() }),
  verdict: researchVerificationSummarySchema.shape.verdict,
  runCount: z.number().int().nonnegative(),
  projectValidation: z.object({
    issues: z.array(z.string()),
    warnings: z.array(z.string())
  }),
  briefGaps: z.array(z.object({ experiment: z.string(), missing: z.array(z.string()) })),
  unfinished: z.array(z.object({ run: z.string(), state: z.string() })),
  executionEvidence: z.array(z.object({ reportedBy: z.string() })),
  findings: z.object({
    counts: z.object({ fail: z.number(), warn: z.number(), info: z.number() }),
    open: z.array(z.object({ severity: z.string(), text: z.string() }))
  })
})

/** Keep the full machine-readable audit in the harness; bound what crosses into the UI. */
export function verificationSummary(raw: unknown): ResearchVerificationSummary {
  const result = harnessResultSchema.parse(raw)
  return researchVerificationSummarySchema.parse({
    checkedAt: result.checkedAt,
    experiment: result.scope.experiment,
    verdict: result.verdict,
    runCount: result.runCount,
    validation: {
      issueCount: result.projectValidation.issues.length,
      warningCount: result.projectValidation.warnings.length,
      issues: result.projectValidation.issues.slice(0, 3),
      warnings: result.projectValidation.warnings.slice(0, 3)
    },
    briefGaps: result.briefGaps.slice(0, 3),
    unfinished: {
      count: result.unfinished.length,
      runs: result.unfinished.slice(0, 3)
    },
    userReportedCount: result.executionEvidence.filter((item) => item.reportedBy === 'user').length,
    findings: {
      ...result.findings.counts,
      open: result.findings.open.slice(0, 3).map(({ severity, text }) => ({ severity, text }))
    }
  })
}
