export type DropIndicator = 'left' | 'right' | null

// Why: the theme's accent color is too subtle for a drag-and-drop insertion
// cue. A vivid blue matches VS Code's tab.dragAndDropBorder and is immediately
// visible against all tab backgrounds. Pseudo-elements sit above the tab's
// own border so the indicator does not shift layout.
export function getDropIndicatorClasses(dropIndicator: DropIndicator): string {
  if (dropIndicator === 'left') {
    return "before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:bg-blue-500 before:z-10 before:content-['']"
  }
  if (dropIndicator === 'right') {
    return "after:absolute after:inset-y-0 after:right-0 after:w-[2px] after:bg-blue-500 after:z-10 after:content-['']"
  }
  return ''
}

// Why: each tab is a rounded chip inset in the strip; the active one is filled by this chip, which
// ActiveTabIndicator slides in from the previously active tab. A color-mix wash (uniform in light
// and dark, unlike `accent` whose contrast against `card` is lopsided across themes). -z-10 inside
// the tab's own stacking context (`isolate`) keeps it under the label and above the strip.
// Horizontal inset is 0: negative insets on the last tab bleed into the strip's scrollWidth, so
// clicking between active tabs would flip the strip between fitting and overflowing by 1px.
export const ACTIVE_TAB_INDICATOR_CLASSES =
  'pointer-events-none absolute inset-0 -z-10 rounded-[8px] bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)]'

export function getTabRootStateClasses(isActive: boolean): string {
  return isActive
    ? 'isolate text-foreground'
    : 'isolate text-muted-foreground transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)] hover:text-foreground'
}

/**
 * Tabs used to be boxes joined by hairlines; as chips they stand apart on the strip, so no tab
 * draws a border in either strip (docked or floating panel). Kept as the one place to change that.
 */
export function getTabStripBorderClasses(
  _hasTabsToRight: boolean,
  _options?: { includeTopBorder?: boolean }
): string {
  return ''
}
