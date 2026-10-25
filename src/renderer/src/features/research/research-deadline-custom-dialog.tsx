import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { resolveDeadlineInstant } from '../../../../shared/research/conference-deadline-time'
import type { CustomConferenceDeadline } from '../../../../shared/research/conference-deadlines'
import {
  formatDeadlineDateTime,
  formatZoneOffset,
  systemTimeZone
} from './research-deadline-format'

export type CustomDeadlineDraft = Pick<
  CustomConferenceDeadline,
  'title' | 'label' | 'date' | 'timezone' | 'link' | 'editionId' | 'stage'
>

/** Starting values when the dialog fills in a date the sources lack for a tracked paper. */
export type CustomDeadlinePrefill = Pick<
  CustomConferenceDeadline,
  'title' | 'label' | 'timezone' | 'editionId' | 'stage'
>

const STATED_ZONES = [
  { value: 'AoE', label: 'AoE (Anywhere on Earth, UTC-12)' },
  { value: 'UTC', label: 'UTC' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'Europe/Paris', label: 'Central European Time (CET)' },
  { value: 'Asia/Shanghai', label: 'China (UTC+8)' }
]

function DialogBody({
  displayTimeZone,
  locale,
  prefill,
  onSave,
  onClose
}: {
  displayTimeZone: string
  locale: string
  prefill: CustomDeadlinePrefill | null
  onSave: (draft: CustomDeadlineDraft) => Promise<void>
  onClose: () => void
}): React.JSX.Element {
  const system = systemTimeZone()
  const extraZones = [system, prefill?.timezone].filter(
    (zone): zone is string => Boolean(zone) && !STATED_ZONES.some((entry) => entry.value === zone)
  )
  const zones = [
    ...STATED_ZONES,
    ...[...new Set(extraZones)].map((zone) => ({
      value: zone,
      label: zone === system ? `This computer (${zone.replace(/_/g, ' ')})` : zone
    }))
  ]
  const [title, setTitle] = useState(prefill?.title ?? '')
  const [label, setLabel] = useState(prefill?.label ?? 'Paper submission')
  const [day, setDay] = useState('')
  const [time, setTime] = useState('23:59')
  const [timezone, setTimezone] = useState(prefill?.timezone ?? 'AoE')
  const [link, setLink] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const date = day ? `${day} ${time || '23:59'}` : ''
  const preview = date ? resolveDeadlineInstant(date, timezone) : null

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    const trimmedLink = link.trim()
    if (!title.trim() || !label.trim() || !preview) {
      setError('Enter a conference name, milestone and date.')
      return
    }
    if (trimmedLink && !/^https?:\/\/\S+$/i.test(trimmedLink)) {
      setError('Links must start with http:// or https://.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave({
        title: title.trim(),
        label: label.trim(),
        date,
        timezone,
        ...(trimmedLink ? { link: trimmedLink } : {}),
        ...(prefill?.editionId ? { editionId: prefill.editionId } : {}),
        ...(prefill?.stage ? { stage: prefill.stage } : {})
      })
      onClose()
    } catch (cause) {
      setError(`Deadline was not saved. ${String(cause)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <form onSubmit={(event) => void submit(event)}>
        <DialogHeader>
          <DialogTitle>{prefill ? `Add ${prefill.title} date` : 'Add a deadline'}</DialogTitle>
          <DialogDescription>
            {prefill
              ? 'Neither data source lists this date yet. '
              : 'For workshops or venues missing from the list. '}
            Enter the time as the call for papers states it; it is converted to your time zone.
          </DialogDescription>
        </DialogHeader>
        <div className="my-4 space-y-3 text-xs">
          <label className="block space-y-1 font-medium text-foreground">
            Conference or workshop
            <Input
              autoFocus={!prefill}
              disabled={Boolean(prefill)}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="ICLR 2027 Workshop on …"
              maxLength={120}
              className="mt-1"
            />
          </label>
          <label className="block space-y-1 font-medium text-foreground">
            Milestone
            <Input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              maxLength={160}
              className="mt-1"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1 font-medium text-foreground">
              Date
              <Input
                type="date"
                value={day}
                onChange={(event) => setDay(event.target.value)}
                className="mt-1"
              />
            </label>
            <label className="block space-y-1 font-medium text-foreground">
              Time
              <Input
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                className="mt-1"
              />
            </label>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Stated time zone</p>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger className="w-full" aria-label="Stated time zone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {zones.map((zone) => (
                  <SelectItem key={zone.value} value={zone.value}>
                    {zone.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="block space-y-1 font-medium text-foreground">
            Link (optional)
            <Input
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="https://…"
              className="mt-1"
            />
          </label>
          {preview ? (
            <p className="rounded-md bg-muted px-3 py-2 text-muted-foreground">
              Your time: {formatDeadlineDateTime(preview.epochMs, displayTimeZone, locale)}{' '}
              {formatZoneOffset(preview.epochMs, displayTimeZone, locale)}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            Add deadline
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}

export function ResearchDeadlineCustomDialog({
  open,
  onClose,
  ...props
}: {
  open: boolean
  displayTimeZone: string
  locale: string
  prefill: CustomDeadlinePrefill | null
  onSave: (draft: CustomDeadlineDraft) => Promise<void>
  onClose: () => void
}): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {open ? <DialogBody {...props} onClose={onClose} /> : null}
    </Dialog>
  )
}
