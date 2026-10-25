export type ResearchLayoutMigration = {
  project: string
  dryRun: boolean
  moved: { from: string; to: string; kind: 'file' | 'directory' }[]
  created: string[]
  rewritten: { file: string; count: number }[]
  /** Files under research/ that the move does not know; left in place. */
  leftovers: string[]
  catalog: {
    schemaVersion: 2
    manuscript: { source: string; pdf: string | null }
    references: { bibliography: string; papers: string }
  }
}

/** Moves a pre-ADR-004 research/ tree to .aster/ and paper/; nothing is deleted. */
export function migrateProjectLayout(
  projectPath: string,
  options?: { paperDirectory?: string; dryRun?: boolean }
): Promise<ResearchLayoutMigration>
