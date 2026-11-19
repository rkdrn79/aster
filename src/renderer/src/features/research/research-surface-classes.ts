/**
 * Surfaces shared by the research pages (STYLEGUIDE → Surfaces): depth comes from surface steps and
 * one soft shadow, not hairlines. Radius steps down by size: floating panel 18, card 14, well 10,
 * tag 4. Compose these with cn(); each names where it belongs.
 */

/** A card one step up from the canvas: a concern and its reply, a project, readiness, a host. */
export const RAISED_CARD =
  'rounded-xl bg-card text-card-foreground shadow-raised ring-1 ring-foreground/3 dark:ring-0'

/** A card that opens something steps its surface up under the pointer; nothing moves. */
export const STEP_ON_HOVER =
  'transition-colors duration-(--duration-fast) ease-out-quint hover:bg-accent/40 dark:hover:bg-accent/35'

/** One step down inside a card, for what someone else wrote or what changed: no edge. */
export const INSET_WELL = 'rounded-lg bg-muted/70 dark:bg-muted/55'

/** A note or suggestion that waits on the person, on the page between cards. */
export const NOTICE_CARD = 'rounded-xl bg-muted/60 dark:bg-muted/45'

/** A small tag: concern IDs and kinds. Reads on cards and wells alike; counts stay plain text. */
export const TAG_CHIP =
  'inline-flex shrink-0 items-center gap-1 rounded bg-foreground/6 px-2 py-px text-3xs font-medium text-muted-foreground'

/** Section heading inside a page (STYLEGUIDE type scale: 13/500). */
export const SECTION_TITLE = 'text-[13px] font-medium'

/** Something that opens in place (a diff, a list) fades in and settles down a few pixels. */
export const REVEAL =
  'animate-in fade-in-0 slide-in-from-top-1 duration-(--duration-base) ease-out-quint motion-reduce:slide-in-from-top-0'

/** The title row of a Home card that opens its page; the arrow nudges toward it on hover. */
export const HOME_CARD_HEADER =
  'group/home-card flex w-full items-center gap-2 px-4 pt-3 pb-3 text-left transition-colors duration-(--duration-fast) hover:bg-foreground/3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'

export const HOME_CARD_ARROW =
  'size-4 text-muted-foreground transition-transform duration-(--duration-fast) ease-out-quint group-hover/home-card:translate-x-0.5 motion-reduce:transition-none'
