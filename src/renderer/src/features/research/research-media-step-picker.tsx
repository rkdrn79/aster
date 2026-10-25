import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { mediaStepText, type MediaStep } from './research-media-groups'

const MAX_STEP_BUTTONS = 8

/** Buttons for a few steps, a slider for many; nothing when there is only one. */
export function ResearchMediaStepPicker({
  steps,
  value,
  onChange,
  label
}: {
  steps: readonly MediaStep[]
  value: MediaStep
  onChange: (step: MediaStep) => void
  label: string
}): React.JSX.Element | null {
  if (steps.length < 2) {
    return null
  }
  if (steps.length <= MAX_STEP_BUTTONS) {
    return (
      <div role="group" aria-label={label} className="flex flex-wrap gap-1">
        {steps.map((step) => (
          <Button
            key={String(step)}
            size="xs"
            variant={step === value ? 'secondary' : 'ghost'}
            aria-pressed={step === value}
            onClick={() => onChange(step)}
          >
            {step === null ? 'No step' : step}
          </Button>
        ))}
      </div>
    )
  }
  const index = Math.max(0, steps.indexOf(value))
  const move = (delta: number): void => onChange(steps[index + delta] ?? value)
  return (
    <div className="flex items-center gap-2">
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Previous step"
        disabled={index === 0}
        onClick={() => move(-1)}
      >
        <ChevronLeft />
      </Button>
      <Slider
        className="min-w-32 flex-1"
        min={0}
        max={steps.length - 1}
        step={1}
        value={[index]}
        onValueChange={([next]) => onChange(steps[next ?? index] ?? value)}
        thumbLabels={[label]}
        thumbValueLabels={[mediaStepText(value)]}
      />
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Next step"
        disabled={index === steps.length - 1}
        onClick={() => move(1)}
      >
        <ChevronRight />
      </Button>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {mediaStepText(value)} · {index + 1} of {steps.length}
      </span>
    </div>
  )
}
