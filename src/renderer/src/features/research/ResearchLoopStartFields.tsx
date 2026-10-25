import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

export function Field({
  label,
  htmlFor,
  required,
  children
}: {
  label: string
  htmlFor?: string
  required?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="text-xs font-normal text-muted-foreground">Required</span>
        ) : null}
      </Label>
      {children}
    </div>
  )
}

/** The loop's budget: run and hour caps and how many agents run at once. */
export function LoopBudgetFields({
  idPrefix,
  maxRuns,
  maxHours,
  parallel,
  runsValid,
  hoursValid,
  onMaxRuns,
  onMaxHours,
  onParallel
}: {
  idPrefix: string
  maxRuns: string
  maxHours: string
  parallel: string
  runsValid: boolean
  hoursValid: boolean
  onMaxRuns: (value: string) => void
  onMaxHours: (value: string) => void
  onParallel: (value: string) => void
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Field label="Max runs" htmlFor={`${idPrefix}-runs`}>
        <Input
          id={`${idPrefix}-runs`}
          type="number"
          min={1}
          max={1000}
          value={maxRuns}
          aria-invalid={!runsValid}
          onChange={(event) => onMaxRuns(event.target.value)}
        />
      </Field>
      <Field label="Max hours" htmlFor={`${idPrefix}-hours`}>
        <Input
          id={`${idPrefix}-hours`}
          type="number"
          min={0.5}
          max={720}
          step={0.5}
          value={maxHours}
          aria-invalid={!hoursValid}
          onChange={(event) => onMaxHours(event.target.value)}
        />
      </Field>
      <Field label="Parallel agents">
        <Select value={parallel} onValueChange={onParallel}>
          <SelectTrigger className="w-full" aria-label="Parallel agents">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {['1', '2', '3', '4'].map((count) => (
              <SelectItem key={count} value={count}>
                {count}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  )
}
