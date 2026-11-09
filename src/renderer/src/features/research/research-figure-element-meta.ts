/**
 * The marks Aster keeps on figure elements (`customData`), shared by the canvas, the agent and
 * the shell: what an element is for (role), what it follows (attach), how a connector routes, and
 * the TeX behind a math image. Until the kit writes them, ownership is read from its id rules.
 */

export const ASTER_SHAPE_ROLES = ['block', 'emphasis', 'frozen', 'loss', 'panel', 'note'] as const
export const ASTER_ARROW_ROLES = ['main', 'side', 'aux', 'loss-link', 'data'] as const
export const ASTER_TEXT_ROLES = ['label', 'small'] as const
export type AsterShapeRole = (typeof ASTER_SHAPE_ROLES)[number]
export type AsterArrowRole = (typeof ASTER_ARROW_ROLES)[number]
export type AsterTextRole = (typeof ASTER_TEXT_ROLES)[number]
export type AsterRole = AsterShapeRole | AsterArrowRole | AsterTextRole

export type AsterAttachAnchor = 'top-right' | 'top-left' | 'arrow-mid' | 'offset'
/** `dx`/`dy` run from the anchor on the owner to the follower's centre, in scene units. */
export type AsterAttach = { to: string; anchor: AsterAttachAnchor; dx: number; dy: number }
export type AsterRoute = 'hv' | 'vh' | 'auto'
export type AsterMath = { tex: string; size: number; color: string }

/** The few element fields these marks need; Excalidraw elements and plain test objects fit. */
export type MetaElement = {
  readonly id: string
  readonly type: string
  readonly customData?: Readonly<Record<string, unknown>> | null
  readonly groupIds?: readonly string[]
  readonly isDeleted?: boolean
}

const ROLES = new Set<string>([...ASTER_SHAPE_ROLES, ...ASTER_ARROW_ROLES, ...ASTER_TEXT_ROLES])
const ANCHORS = new Set<string>(['top-right', 'top-left', 'arrow-mid', 'offset'])
const ROUTES = new Set<string>(['hv', 'vh', 'auto'])
const BADGE_SUFFIXES = ['-trainable', '-frozen', '-locked'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRole(value: unknown): value is AsterRole {
  return typeof value === 'string' && ROLES.has(value)
}

function isAnchor(value: unknown): value is AsterAttachAnchor {
  return typeof value === 'string' && ANCHORS.has(value)
}

function isRoute(value: unknown): value is AsterRoute {
  return typeof value === 'string' && ROUTES.has(value)
}

export function readAsterRole(element: MetaElement): AsterRole | null {
  const role = element.customData?.asterRole
  return isRole(role) ? role : null
}

export function readAsterAttach(element: MetaElement): AsterAttach | null {
  const attach = element.customData?.asterAttach
  if (!isRecord(attach) || typeof attach.to !== 'string' || !isAnchor(attach.anchor)) {
    return null
  }
  const dx = typeof attach.dx === 'number' && Number.isFinite(attach.dx) ? attach.dx : 0
  const dy = typeof attach.dy === 'number' && Number.isFinite(attach.dy) ? attach.dy : 0
  return { to: attach.to, anchor: attach.anchor, dx, dy }
}

export function readAsterRoute(element: MetaElement): AsterRoute | null {
  const route = element.customData?.asterRoute
  return isRoute(route) ? route : null
}

/**
 * The TeX of a math image. The kit stores the source alone (a string); the shared contract adds
 * size (scene units) and colour, which are null here when the element does not record them.
 */
export function readAsterMath(
  element: MetaElement
): { tex: string; size: number | null; color: string | null } | null {
  const math = element.customData?.asterMath
  if (typeof math === 'string') {
    return { tex: math, size: null, color: null }
  }
  if (isRecord(math) && typeof math.tex === 'string') {
    return {
      tex: math.tex,
      size: typeof math.size === 'number' ? math.size : null,
      color: typeof math.color === 'string' ? math.color : null
    }
  }
  return null
}

/** True for a math image (the TeX lives in its customData), the only kind the popover edits. */
export function isAsterMathImage(element: MetaElement): boolean {
  return element.type === 'image' && readAsterMath(element) !== null
}

export type FollowerKind = 'badge' | 'box-label' | 'arrow-label' | 'title' | 'other'
export type Attachment = { to: string; anchor: AsterAttachAnchor; kind: FollowerKind }

function badgeOwner(id: string): string | null {
  const suffix = BADGE_SUFFIXES.find((item) => id.endsWith(item))
  return suffix ? id.slice(0, -suffix.length) : null
}

/** `X-label`, `X-label-0`, `X-label-1-0` → X. */
function labelOwner(element: MetaElement): string | null {
  const group = element.groupIds?.find((id) => id.endsWith('-label-group'))
  if (group) {
    return group.slice(0, -'-label-group'.length)
  }
  const match = /^(.+)-label(?:-[\d-]+)?$/.exec(element.id)
  return match ? match[1] : null
}

/** `X-title`, `X-title-0` → X (a panel's heading). */
function titleOwner(element: MetaElement): string | null {
  const match = /^(.+)-title(?:-\d+)?$/.exec(element.id)
  return match ? match[1] : null
}

/**
 * What an element follows: its `asterAttach`, else the kit's id rules (`X-trainable` and
 * `X-frozen` badges sit on X's top-right corner, `X-label…` labels follow arrow or box X).
 */
export function attachmentOf(
  element: MetaElement,
  byId: ReadonlyMap<string, MetaElement>
): Attachment | null {
  if (element.type === 'frame') {
    return null
  }
  const live = (id: string | null): MetaElement | null => {
    const owner = id === null || id === element.id ? null : byId.get(id)
    return owner && !owner.isDeleted ? owner : null
  }
  const explicit = readAsterAttach(element)
  if (explicit) {
    const owner = live(explicit.to)
    if (!owner) {
      return null
    }
    const kind: FollowerKind =
      explicit.anchor === 'arrow-mid'
        ? 'arrow-label'
        : explicit.anchor === 'offset'
          ? 'box-label'
          : 'badge'
    return { to: owner.id, anchor: explicit.anchor, kind }
  }
  if (element.type === 'arrow' || element.type === 'line') {
    return null
  }
  const badge = live(badgeOwner(element.id))
  if (badge && element.type === 'image') {
    return { to: badge.id, anchor: 'top-right', kind: 'badge' }
  }
  const label = live(labelOwner(element))
  if (label) {
    return label.type === 'arrow'
      ? { to: label.id, anchor: 'arrow-mid', kind: 'arrow-label' }
      : { to: label.id, anchor: 'offset', kind: 'box-label' }
  }
  const title = live(titleOwner(element))
  if (title && title.type !== 'arrow') {
    return { to: title.id, anchor: 'top-left', kind: 'title' }
  }
  return null
}
