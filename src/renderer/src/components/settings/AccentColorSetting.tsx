import type React from 'react'
import { useRef, useState } from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { normalizeAccentColor } from '../../../../shared/accent-color-tokens'
import { applyDocumentAccentColor } from '@/lib/document-accent-color'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { SearchableSetting } from './SearchableSetting'
import { SettingsRow } from './SettingsFormControls'
import { getAccentColorEntries } from './appearance-accent-color-search'

type AccentSwatch = { label: string; color: string | null; fill: string }

// Why these values: mid-tones that clear 3:1 on both the paper and ink canvases unadjusted.
function getAccentSwatches(): AccentSwatch[] {
  const preset = (label: string, color: string): AccentSwatch => ({ label, color, fill: color })
  return [
    {
      label: translate('settings.appearance.accentColor.ink', 'Ink (default)'),
      color: null,
      fill: 'linear-gradient(135deg, var(--foreground) 50%, var(--background) 50%)'
    },
    preset(translate('settings.appearance.accentColor.blue', 'Graphite blue'), '#4a6fa5'),
    preset(translate('settings.appearance.accentColor.teal', 'Teal'), '#0f766e'),
    preset(translate('settings.appearance.accentColor.green', 'Green'), '#2f7d4f'),
    preset(translate('settings.appearance.accentColor.amber', 'Amber'), '#b45309'),
    preset(translate('settings.appearance.accentColor.rose', 'Rose'), '#be3455'),
    preset(translate('settings.appearance.accentColor.violet', 'Violet'), '#6d4bd1')
  ]
}

const CUSTOM_FILL =
  'conic-gradient(from 180deg, #e5484d, #f5a524, #46a758, #12a594, #3e63dd, #8e4ec6, #e5484d)'
const SWATCH_CLASS =
  'block size-6 shrink-0 rounded-full border border-border/70 outline-none transition-shadow'
const SELECTED_CLASS = 'ring-2 ring-foreground ring-offset-2 ring-offset-background'
const UNSELECTED_CLASS =
  'hover:ring-1 hover:ring-muted-foreground hover:ring-offset-2 hover:ring-offset-background'
const FULL_HEX_INPUT = /^#?[0-9a-fA-F]{6}$/
const PICKER_COMMIT_DELAY_MS = 150

type AccentColorSettingProps = {
  accentColor: string | null | undefined
  updateSettings: (updates: Partial<GlobalSettings>) => void
  forceVisible?: boolean
}

export function AccentColorSetting({
  accentColor,
  updateSettings,
  forceVisible
}: AccentColorSettingProps): React.JSX.Element {
  const entry = getAccentColorEntries()[0]
  const swatches = getAccentSwatches()
  // Why a draft: the native panel streams colors while dragging; preview them live and persist
  // once settled. A pending timer still fires after unmount, so closing Settings keeps the pick.
  const [pickerDraft, setPickerDraft] = useState<string | null>(null)
  const [hexDraft, setHexDraft] = useState<string | null>(null)
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selected = pickerDraft ?? normalizeAccentColor(accentColor)
  const isCustom = selected !== null && !swatches.some((swatch) => swatch.color === selected)
  const hexInvalid =
    hexDraft !== null && hexDraft.trim() !== '' && normalizeAccentColor(hexDraft) === null

  const commit = (color: string | null): void => {
    if (commitTimer.current !== null) {
      clearTimeout(commitTimer.current)
      commitTimer.current = null
    }
    setPickerDraft(null)
    updateSettings({ accentColor: color })
  }

  const pickCustom = (value: string): void => {
    const color = normalizeAccentColor(value)
    if (!color) {
      return
    }
    setPickerDraft(color)
    setHexDraft(null)
    applyDocumentAccentColor(color)
    if (commitTimer.current !== null) {
      clearTimeout(commitTimer.current)
    }
    commitTimer.current = setTimeout(() => commit(color), PICKER_COMMIT_DELAY_MS)
  }

  const commitHexDraft = (): void => {
    const color = hexDraft === null ? null : normalizeAccentColor(hexDraft)
    if (color && color !== selected) {
      commit(color)
    }
    setHexDraft(null)
  }

  return (
    <SearchableSetting {...entry} forceVisible={forceVisible}>
      <SettingsRow
        alignTop
        label={entry.title}
        description={entry.description}
        control={
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <div role="radiogroup" aria-label={entry.title} className="flex items-center gap-2">
                {swatches.map((swatch) => {
                  const active = swatch.color === selected
                  return (
                    <Tooltip key={swatch.label}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={active}
                          aria-label={swatch.label}
                          onClick={() => commit(swatch.color)}
                          className={cn(
                            SWATCH_CLASS,
                            'focus-visible:ring-[3px] focus-visible:ring-ring/50',
                            active ? SELECTED_CLASS : UNSELECTED_CLASS
                          )}
                          style={{ background: swatch.fill }}
                        />
                      </TooltipTrigger>
                      <TooltipContent>{swatch.label}</TooltipContent>
                    </Tooltip>
                  )
                })}
              </div>
              <span aria-hidden="true" className="h-4 w-px bg-border" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="relative block size-6 shrink-0">
                    <input
                      type="color"
                      value={selected ?? '#161921'}
                      onChange={(event) => pickCustom(event.target.value)}
                      aria-label={translate(
                        'settings.appearance.accentColor.custom',
                        'Custom accent color'
                      )}
                      className="peer absolute inset-0 size-full cursor-pointer opacity-0"
                    />
                    <span
                      aria-hidden="true"
                      className={cn(
                        SWATCH_CLASS,
                        'peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50',
                        isCustom ? SELECTED_CLASS : UNSELECTED_CLASS
                      )}
                      style={{ background: isCustom ? selected : CUSTOM_FILL }}
                    />
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {translate('settings.appearance.accentColor.customTooltip', 'Custom color…')}
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-center gap-2">
              <Input
                density="compact"
                value={hexDraft ?? selected ?? ''}
                placeholder="#rrggbb"
                spellCheck={false}
                aria-label={translate('settings.appearance.accentColor.hex', 'Accent hex color')}
                aria-invalid={hexInvalid}
                onChange={(event) => {
                  const next = event.target.value
                  setHexDraft(next)
                  if (FULL_HEX_INPUT.test(next.trim())) {
                    commit(normalizeAccentColor(next))
                  }
                }}
                onBlur={commitHexDraft}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                    commitHexDraft()
                  }
                }}
                className="w-24"
              />
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={selected === null}
                aria-label={translate(
                  'settings.appearance.accentColor.resetLabel',
                  'Reset accent color'
                )}
                onClick={() => {
                  setHexDraft(null)
                  commit(null)
                }}
              >
                {translate('settings.appearance.accentColor.reset', 'Reset')}
              </Button>
            </div>
          </div>
        }
      />
    </SearchableSetting>
  )
}
