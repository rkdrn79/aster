import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { Flame, Lock, Snowflake } from 'lucide-react'
import {
  BADGES,
  addBadgeFiles,
  badgeFiles,
  badgeOf,
  withBadges,
  type BadgeKind
} from './research-figure-badges'
import { selectionUnits } from './research-figure-geometry-edit'
import type { InspectorContext } from './research-figure-inspector-registry'
import {
  arrowRoles,
  figureLoss,
  kindOf,
  paintRole,
  roleOf,
  shapeRoles,
  textRoles,
  type ElementKind,
  type RoleChoice
} from './research-figure-roles'
import { InspectorChip, InspectorHeading } from './ResearchFigureInspectorParts'

const OWNER_TYPES = new Set(['rectangle', 'ellipse', 'diamond', 'image'])

function ofKind(context: InspectorContext, kind: ElementKind): ExcalidrawElement[] {
  return context.selected.filter((element) => kindOf(element) === kind)
}

/** The shapes a badge belongs on: each selected unit's main shape. */
export function badgeOwners(context: InspectorContext): ExcalidrawElement[] {
  return selectionUnits(context.selected, context.elements)
    .map((unit) => unit.primary)
    .filter((element) => OWNER_TYPES.has(element.type) && !element.customData?.asterMath)
}

async function setBadge(
  context: InspectorContext,
  kind: BadgeKind | null,
  base?: readonly ExcalidrawElement[]
) {
  const api = context.api()
  const owners = badgeOwners(context)
  if (!api || !owners.length) {
    return
  }
  const files = await badgeFiles(context.style)
  addBadgeFiles(api, files)
  context.commit(withBadges(base ?? api.getSceneElementsIncludingDeleted(), owners, kind, files))
}

function Swatch({
  fill,
  stroke,
  dashed,
  line
}: {
  fill: string
  stroke: string
  dashed?: boolean
  line?: number
}) {
  if (line) {
    return (
      <svg aria-hidden width="16" height="10" viewBox="0 0 16 10" className="shrink-0">
        <line
          x1="1"
          y1="5"
          x2="15"
          y2="5"
          stroke={stroke}
          strokeWidth={line}
          strokeDasharray={dashed ? '3 2' : undefined}
        />
      </svg>
    )
  }
  return (
    <span
      aria-hidden
      className="size-3.5 shrink-0 rounded-[3px] border"
      style={{
        backgroundColor: fill === 'transparent' ? undefined : fill,
        borderColor: stroke === 'transparent' ? fill : stroke,
        borderStyle: dashed ? 'dashed' : 'solid'
      }}
    />
  )
}

function RoleChips({ context, kind }: { context: InspectorContext; kind: ElementKind }) {
  const targets = ofKind(context, kind)
  const roles = new Set(targets.map((element) => roleOf(element, context.style)))
  const current = roles.size === 1 ? [...roles][0] : null
  const loss = figureLoss(context.style, context.elements)
  const choices: RoleChoice<string>[] =
    kind === 'arrow'
      ? arrowRoles(context.style, loss)
      : kind === 'text'
        ? textRoles(context.style)
        : shapeRoles(context.style, loss)
  const apply = (role: string): void => {
    const api = context.api()
    if (!api) {
      return
    }
    const ids = new Set(targets.map((element) => element.id))
    const painted = paintRole(
      api.getSceneElementsIncludingDeleted(),
      ids,
      kind,
      role,
      context.style,
      loss
    )
    if (kind === 'shape' && role === 'frozen') {
      void setBadge(context, 'frozen', painted)
      return
    }
    context.commit(painted)
  }
  return (
    <div className="grid grid-cols-2 gap-1 px-3" role="group" aria-label={`${kind} role`}>
      {choices.map((choice) => (
        <InspectorChip
          key={choice.role}
          pressed={current === choice.role}
          label={choice.label}
          title={`${choice.label} ${kind === 'shape' ? 'box' : kind}`}
          onClick={() => apply(choice.role)}
        >
          <Swatch
            fill={choice.paint.fill}
            stroke={choice.paint.stroke}
            dashed={choice.paint.dashed}
            line={kind === 'arrow' ? choice.paint.strokeWidth : undefined}
          />
        </InspectorChip>
      ))}
    </div>
  )
}

/** Role chips for what is selected: box roles, line roles, text sizes. */
export function InspectorRoleSection({
  context
}: {
  context: InspectorContext
}): React.JSX.Element {
  const kinds = (['shape', 'arrow', 'text'] as const).filter((kind) => ofKind(context, kind).length)
  return (
    <>
      {kinds.map((kind) => (
        <div key={kind}>
          <InspectorHeading>
            {kind === 'shape' ? 'Box role' : kind === 'arrow' ? 'Line role' : 'Text'}
          </InspectorHeading>
          <RoleChips context={context} kind={kind} />
        </div>
      ))}
    </>
  )
}

const BADGE_ICONS: Record<BadgeKind, typeof Flame> = {
  trainable: Flame,
  frozen: Snowflake,
  locked: Lock
}

/** None / trained (flame) / frozen (snowflake) / fixed (lock) on the boxes' top-right corner. */
export function InspectorBadgeSection({
  context
}: {
  context: InspectorContext
}): React.JSX.Element {
  const owners = badgeOwners(context)
  const kinds = new Set(owners.map((owner) => badgeOf(context.elements, owner.id)))
  const current = kinds.size === 1 ? [...kinds][0] : undefined
  return (
    <div>
      <InspectorHeading>Badge</InspectorHeading>
      <div className="grid grid-cols-4 gap-1 px-3" role="group" aria-label="Badge">
        <InspectorChip
          pressed={current === null}
          label="None"
          title="No badge"
          onClick={() => void setBadge(context, null)}
        />
        {BADGES.map((badge) => {
          const Icon = BADGE_ICONS[badge.kind]
          return (
            <InspectorChip
              key={badge.kind}
              pressed={current === badge.kind}
              label=""
              title={`${badge.label} badge`}
              onClick={() => void setBadge(context, badge.kind)}
            >
              <Icon aria-hidden className="mx-auto size-3.5" />
            </InspectorChip>
          )
        })}
      </div>
    </div>
  )
}
