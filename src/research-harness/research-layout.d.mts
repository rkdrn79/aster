export const ASTER_DIRECTORY: '.aster'
export const LEGACY_RESEARCH_DIRECTORY: 'research'
export const RESEARCH_DIRECTORY: 'research'
export const ASTER_GITIGNORE: string

export type ProjectLayout = {
  kind: 'aster' | 'legacy'
  root: '.aster' | 'research'
  manuscriptSource: string
  manuscriptPdf: string
  bibliography: string
  papers: string
}

export function projectLayout(projectPath: string): ProjectLayout

/** Normalizes an Experiment name into its folder slug; throws a HarnessError on an unusable name. */
export function experimentSlug(name: string): string

/** Returns `value` when it is a Run ID (1-64 lowercase letters, digits, hyphens); throws otherwise. */
export function safeIdentifier(value: unknown, label: string): string

/** Returns `value` when it is an Experiment folder slug; throws otherwise. */
export function safeExperimentSlug(value: unknown): string

export function researchPaths(projectPath: string): {
  root: string
  experiments: string
  manuscript: string
  references: string
}

export function experimentPaths(
  projectPath: string,
  slug: string
): { experiment: string; runs: string }

export function runPaths(
  projectPath: string,
  experiment: string,
  runId: string
): {
  run: string
  manifest: string
  metrics: string
  log: string
  config: string
  artifacts: string
}

export function claimsLedgerPath(projectPath: string): string

export function loopLedgerPath(projectPath: string, slug: string): string

export function runReference(experiment: string, runId: string): string

/** Project-relative `/` paths of the record tree, for API results and messages. */
export function layoutRelativePaths(projectPath: string): {
  kind: ProjectLayout['kind']
  root: ProjectLayout['root']
  catalog: string
  claims: string
  experiments: string
  manuscriptSource: string
  manuscriptPdf: string
  bibliography: string
  papers: string
}

/** The Experiment's folder, project-relative with `/`; throws on an unsafe slug. */
export function experimentRelativePath(projectPath: string, slug: string): string

/** The Run's folder, project-relative with `/`; throws on an unsafe slug or Run ID. */
export function runRelativePath(projectPath: string, slug: string, runId: string): string

/** The project Library: paper list, highlights and imported PDFs. The .bib is the catalog's. */
export function libraryPaths(projectPath: string): {
  root: string
  library: string
  annotations: string
  papers: string
}

/** Per-machine records (session IDs, absolute paths) that stay out of git. */
export function localStatePaths(projectPath: string): {
  root: string
  workbench: string
  attachments: string
}
