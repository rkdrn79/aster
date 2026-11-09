import { z } from 'zod'

export const WANDB_ORIGIN = 'https://wandb.ai'
const MAX_NAME_LENGTH = 128
// Why: W&B refuses these in entity and project names, and they would break the run URL.
const FORBIDDEN_NAME_CHARACTERS = /[/\\#?%:\s]/u

const optionalName = z.string().trim().min(1).max(MAX_NAME_LENGTH).nullable().optional()

/**
 * The catalog's optional `wandb` section (.aster/project.json). Older catalogs have none, and
 * older Aster versions drop it as an unknown key, so it stays additive.
 */
export const researchProjectWandbSchema = z.object({
  enabled: z.boolean().catch(false),
  entity: optionalName.catch(null),
  project: optionalName.catch(null),
  /** A Python that can `import wandb` on the host; found automatically when absent. */
  python: z.string().trim().min(1).max(4096).nullable().optional().catch(null)
})
export type ResearchProjectWandb = z.infer<typeof researchProjectWandbSchema>

/** What `run exec` recorded in run.json about the Run's W&B mirror. */
export const researchRunWandbSchema = z.object({
  entity: optionalName.catch(null),
  project: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  group: z.string().trim().min(1).max(MAX_NAME_LENGTH).nullable().optional().catch(null),
  runId: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  url: z.url().nullable().optional().catch(null),
  status: z.enum(['mirroring', 'synced', 'uploading', 'failed']).catch('mirroring'),
  warning: z.string().max(1000).nullable().optional().catch(null)
})
export type ResearchRunWandb = z.infer<typeof researchRunWandbSchema>

/** Null when W&B would accept `value` as an entity or project name. */
export function wandbNameProblem(value: string, label: string): string | null {
  const name = value.trim()
  if (!name) {
    return `${label} is required.`
  }
  if (name.length > MAX_NAME_LENGTH || FORBIDDEN_NAME_CHARACTERS.test(name)) {
    return `${label} cannot contain spaces or / \\ # ? % :`
  }
  return null
}

/** `Reusable JEPA (v2)` → `reusable-jepa-v2`, the W&B project name the dialog suggests. */
export function wandbProjectSlug(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^[-.]+|[-.]+$/gu, '')
    .slice(0, 64)
}

function segment(value: string): string {
  return encodeURIComponent(value.trim())
}

/** The Experiment's W&B group view; needs an entity, since W&B URLs always name one. */
export function wandbGroupUrl(
  settings: ResearchProjectWandb | null | undefined,
  experimentSlug: string
): string | null {
  if (!settings?.enabled || !settings.entity || !settings.project) {
    return null
  }
  return `${WANDB_ORIGIN}/${segment(settings.entity)}/${segment(settings.project)}/groups/${segment(experimentSlug)}`
}

/**
 * The Run's W&B page: the URL the mirror reported, else one built from what it recorded. Null
 * when the project's W&B setting is off, or the mirror never created the W&B run.
 */
export function wandbRunUrl(
  settings: ResearchProjectWandb | null | undefined,
  record: ResearchRunWandb | null | undefined
): string | null {
  if (!settings?.enabled || !record) {
    return null
  }
  if (record.url?.startsWith(`${WANDB_ORIGIN}/`)) {
    return record.url
  }
  const entity = record.entity ?? settings.entity
  if (record.status === 'failed' || !entity) {
    return null
  }
  return `${WANDB_ORIGIN}/${segment(entity)}/${segment(record.project)}/runs/${segment(record.runId)}`
}

/** The catalog text with its `wandb` section replaced; every other key is kept as written. */
export function catalogTextWithWandb(text: string, settings: ResearchProjectWandb): string {
  const catalog: unknown = JSON.parse(text)
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
    throw new Error('The project catalog is not a JSON object.')
  }
  const section = {
    enabled: settings.enabled,
    ...(settings.entity?.trim() ? { entity: settings.entity.trim() } : {}),
    ...(settings.project?.trim() ? { project: settings.project.trim() } : {}),
    ...(settings.python?.trim() ? { python: settings.python.trim() } : {})
  }
  return `${JSON.stringify({ ...catalog, wandb: section }, null, 2)}\n`
}
