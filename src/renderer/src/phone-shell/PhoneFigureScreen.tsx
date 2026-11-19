import { useState } from 'react'
import { Image, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { phoneFigureAgentPrompt } from './phone-figures'
import { usePhoneNavigation } from './phone-navigation-store'
import { useHostImage } from './PhoneHostImage'
import { PhoneEmptyState } from './PhoneListLayout'
import { PhoneZoomableImage } from './PhoneZoomableImage'
import { usePhoneFigureLists, usePhoneProjectOwner } from './use-phone-figures'

/** One figure full screen (pinch to zoom), and a request for the Figure agent about it. */
export function PhoneFigureScreen({
  worktreeId,
  slug,
  path
}: {
  worktreeId: string
  slug: string
  path: string
}): React.JSX.Element {
  const read = usePhoneFigureLists((state) => state.byWorktreeId[worktreeId])
  const project = read?.status === 'ready' ? read.project : null
  const figure = project?.figures.find((entry) => entry.slug === slug) ?? null
  const image = useHostImage(worktreeId, path || null, figure?.version)
  const owner = usePhoneProjectOwner(worktreeId)
  const push = usePhoneNavigation((state) => state.push)
  const [request, setRequest] = useState('')
  const ask = (): void => {
    if (!figure || !project || !owner || !request.trim()) {
      return
    }
    push({
      kind: 'new-agent',
      worktreeId,
      title: 'Figure agent',
      prompt: phoneFigureAgentPrompt(owner.workspacePath, project, figure, request)
    })
    setRequest('')
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 border-b border-border bg-white">
        {!path ? (
          <PhoneEmptyState icon={Image} title="Not exported yet">
            Open it once in the desktop app, or ask the agent to render it.
          </PhoneEmptyState>
        ) : image.status === 'ready' ? (
          <PhoneZoomableImage src={image.src} alt={slug} />
        ) : (
          <p className="m-auto px-8 text-center text-[13px] text-muted-foreground">
            {image.status === 'error' ? image.message : 'Loading…'}
          </p>
        )}
      </div>
      <div className="shrink-0 space-y-2 bg-background px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <Textarea
          value={request}
          onChange={(event) => setRequest(event.target.value)}
          placeholder="Ask the Figure agent to change this figure"
          aria-label="Request for the Figure agent"
          rows={2}
          className="min-h-16"
        />
        <Button
          className="h-11 w-full"
          disabled={!figure || !owner || !request.trim()}
          onClick={ask}
        >
          <MessageSquare aria-hidden />
          Continue with an agent
        </Button>
      </div>
    </div>
  )
}
