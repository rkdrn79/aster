import { FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type ManuscriptFileFormProps = {
  sourcePath: string
  hostId: string
  choosing: 'source' | null
  saving: boolean
  hasManuscript: boolean
  formError: string | null
  recordsError: string | null
  onSourcePathChange: (path: string) => void
  onChoose: () => void
  onSave: () => void
  onCancel: () => void
}

export function ResearchWritingFileForm({
  sourcePath,
  hostId,
  choosing,
  saving,
  hasManuscript,
  formError,
  recordsError,
  onSourcePathChange,
  onChoose,
  onSave,
  onCancel
}: ManuscriptFileFormProps): React.JSX.Element {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-medium">Main TeX file</h2>
      <div className="flex gap-2">
        <Input
          value={sourcePath}
          onChange={(event) => onSourcePathChange(event.target.value)}
          placeholder="paper/main.tex"
          aria-label="Main TeX file path"
        />
        {hostId === 'local' ? (
          <Button
            size="sm"
            variant="outline"
            disabled={choosing !== null}
            onClick={onChoose}
            aria-label="Choose local main TeX file"
          >
            <FolderOpen aria-hidden />
          </Button>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!sourcePath.trim() || saving} onClick={onSave}>
          {saving ? 'Saving…' : 'Set main file'}
        </Button>
        {hasManuscript ? (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
      {formError ? (
        <p role="alert" className="text-xs text-destructive">
          {formError}
        </p>
      ) : null}
      {recordsError ? (
        <p role="alert" className="text-xs text-destructive">
          {recordsError}
        </p>
      ) : null}
    </div>
  )
}
