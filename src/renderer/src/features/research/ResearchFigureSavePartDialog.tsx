import { useState } from 'react'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { toast } from 'sonner'
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
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { saveFigurePart, type FigurePartScope } from './research-figure-saved-parts'
import type { ProjectFileOwner } from './research-project-files'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  api: () => ExcalidrawImperativeAPI | null
  owner: ProjectFileOwner
  folder: string
}

/** Saves the selection as a named part the library panel and the Figure agent can reuse. */
export function ResearchFigureSavePartDialog(props: Props): React.JSX.Element {
  const [name, setName] = useState('')
  const [scope, setScope] = useState<FigurePartScope>('project')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    const api = props.api()
    if (!api || !name.trim()) {
      return
    }
    setSaving(true)
    try {
      const file = await saveFigurePart(api, props, name.trim(), scope)
      toast.success(`Saved "${name.trim()}" to ${file}.`)
      setName('')
      setError(null)
      props.onOpenChange(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save as part</DialogTitle>
          <DialogDescription>
            The selection becomes a reusable part in the library panel. The Figure agent can place
            it too (figures kit library).
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <div className="space-y-1.5">
            <Label htmlFor="figure-part-name">Name</Label>
            <Input
              id="figure-part-name"
              value={name}
              placeholder="Encoder with frozen badge"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <RadioGroup
            aria-label="Where to save it"
            value={scope}
            onValueChange={(value) => setScope(value === 'user' ? 'user' : 'project')}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem id="figure-part-project" value="project" />
              <Label htmlFor="figure-part-project">This project (committed with the figures)</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem id="figure-part-user" value="user" />
              <Label htmlFor="figure-part-user">All my projects (on this computer)</Label>
            </div>
          </RadioGroup>
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" size="sm" disabled={saving || !name.trim()}>
              {saving ? 'Saving…' : 'Save part'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
