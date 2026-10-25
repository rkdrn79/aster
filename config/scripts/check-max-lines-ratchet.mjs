import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { readTrackedSources, runEntryRatchet } from './ratchet-baseline.mjs'

// Ratchet gate for the oxlint `max-lines` rule.
//
// oxlint already fails any file that exceeds max-lines WITHOUT a suppression, so
// the only way a file grows past the budget is by adding an `eslint/oxlint-disable
// max-lines` comment. This check freezes the set of files currently allowed to do that (the baseline) and
// fails CI when a NEW bypass appears — the existing over-limit files are
// grandfathered; new ones must split instead. The baseline may only shrink.

const BASELINE_PATH = 'config/max-lines-baseline.txt'
// These two files legitimately contain the directive text as data (regex, fixtures),
// so scanning them would self-flag. The ratchet does not police itself.
const SELF_FILES = new Set([
  'config/scripts/check-max-lines-ratchet.mjs',
  'config/scripts/check-max-lines-ratchet.test.mjs'
])

// Default max-lines budgets from .oxlintrc.json (counted lines).
export function defaultLimitForPath(p) {
  if (/\.(test|spec)\.(ts|tsx|mts|cts)$/.test(p)) {
    return 800
  }
  if (p.endsWith('.tsx')) {
    return 400
  }
  if (p.endsWith('.mjs')) {
    return 600
  }
  return 300
}

// True if the source contains an eslint/oxlint disable directive listing `max-lines`
// (block or line, bare or compound, with or without a `-- Why:` reason).
export function hasMaxLinesDisable(sourceText) {
  const re = /(?:eslint|oxlint)-disable(?:-next-line|-line)?\b([^\n]*)/g
  let m
  while ((m = re.exec(sourceText)) !== null) {
    let rules = m[1]
    rules = rules.split('--')[0] // strip the reason
    const close = rules.indexOf('*/')
    if (close !== -1) {
      rules = rules.slice(0, close) // strip block-comment tail
    }
    if (/\bmax-lines\b/.test(rules)) {
      return true
    }
  }
  return false
}

// Collect every current suppression entry from the tracked tree.
export function collectCurrentSuppressions(root = process.cwd()) {
  const sources = readTrackedSources(
    root,
    ['*.ts', '*.tsx', '*.mts', '*.cts', '*.mjs'],
    (rel) => !SELF_FILES.has(rel)
  )
  return [...sources]
    .filter(([, src]) => hasMaxLinesDisable(src))
    .map(([rel]) => `inline ${rel}`)
    .sort()
}

const RATCHET = {
  name: 'max-lines',
  baselinePath: BASELINE_PATH,
  header: [
    '# Files/globs currently allowed to exceed the oxlint `max-lines` budget.',
    '# This is a RATCHET: the list may only SHRINK. Do NOT add entries to get CI green —',
    '# split the oversized file instead.',
    '# Regenerate/prune: pnpm check:max-lines-ratchet --prune   (removes stale entries only)'
  ],
  collect: collectCurrentSuppressions,
  fix: [
    'An `inline` entry added an eslint/oxlint-disable max-lines comment. Orca caps file size (300',
    '.ts/.mts/.cts / 400 .tsx / 600 .mjs / 800 test — non-blank, non-comment lines).',
    'Fix it: SPLIT the file into focused modules — do NOT suppress the rule.'
  ]
}

export function main(root = process.cwd(), arg = undefined) {
  return runEntryRatchet(RATCHET, root, arg)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.cwd(), process.argv[2]))
}
