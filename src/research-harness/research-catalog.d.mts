/**
 * The catalog in its v1 shape, wherever the project's layout keeps it; `unknown` because callers
 * validate it. Throws a HarnessError with code `project_not_found` when the project has none.
 */
export function readCatalog(project: string): Promise<unknown>
