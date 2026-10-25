export function initializeResearchProject(
  projectPath: string,
  /** Project-relative paths to existing files; the catalog points there instead of `paper/`. */
  paths?: { manuscript?: string; pdf?: string; bibliography?: string; papers?: string },
  /** `createPaper: false` registers paths without writing a template manuscript or bibliography. */
  options?: { createPaper?: boolean }
): Promise<{
  project: string
  /** `aster` for `.aster/` (ADR-004); `legacy` for a project that already had `research/`. */
  layout: 'aster' | 'legacy'
  paths: { root: string; experiments: string; manuscript: string; references: string }
  /** Absolute paths of the catalog and of the files the catalog points at. */
  files: { catalog: string; manuscriptSource: string; bibliography: string; papers: string }
  status: Record<string, 'created' | 'existing'>
}>

export function createExperiment(
  projectPath: string,
  name: string,
  options?: { createPaper?: boolean }
): Promise<{
  project: string
  slug: string
  status: 'created' | 'existing'
}>
