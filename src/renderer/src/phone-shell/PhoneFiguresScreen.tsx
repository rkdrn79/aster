import { useState } from 'react'
import { Image, RefreshCw } from 'lucide-react'
import type { PhoneFigure } from './phone-figures'
import { usePhoneNavigation } from './phone-navigation-store'
import { PhoneHostThumbnail } from './PhoneHostImage'
import { PhoneEmptyState, PhoneScrollBody, PhoneSection } from './PhoneListLayout'
import { usePhoneFigures } from './use-phone-figures'

const KIND_LABELS: Record<PhoneFigure['kind'], string> = {
  diagram: 'Diagram',
  plot: 'Plot from Runs',
  image: 'Image'
}

/** The project's figures and plots with thumbnails; a tap opens one full screen. */
export function PhoneFiguresScreen({
  worktreeId,
  projectName
}: {
  worktreeId: string
  projectName: string
}): React.JSX.Element {
  const [generation, setGeneration] = useState(0)
  const read = usePhoneFigures(worktreeId, generation)
  const push = usePhoneNavigation((state) => state.push)
  if (read.status !== 'ready') {
    return (
      <PhoneEmptyState
        icon={Image}
        title={read.status === 'error' ? 'Couldn’t read the figures' : 'Reading figures…'}
      >
        {read.status === 'error' ? read.message : null}
      </PhoneEmptyState>
    )
  }
  const { figures, workFolder } = read.project
  if (figures.length === 0) {
    return (
      <PhoneEmptyState icon={Image} title="No figures yet">
        {`Figures and plots the Figure agent makes appear here from ${workFolder}/.`}
      </PhoneEmptyState>
    )
  }
  return (
    <PhoneScrollBody>
      <PhoneSection
        label={`${figures.length} in ${workFolder}`}
        trailing={
          <button
            type="button"
            onClick={() => setGeneration((value) => value + 1)}
            className="-my-3 -mr-2 flex h-11 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-foreground active:bg-accent"
          >
            <RefreshCw className="size-3.5" aria-hidden />
            Refresh
          </button>
        }
      >
        {figures.map((figure) => (
          <button
            key={`${figure.folder}/${figure.slug}`}
            type="button"
            data-phone-figure={figure.slug}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left [--phone-row-inset:5rem] active:bg-accent"
            onClick={() =>
              push({
                kind: 'figure',
                worktreeId,
                path: figure.image ?? '',
                slug: figure.slug,
                title: figure.slug,
                subtitle: projectName
              })
            }
          >
            {figure.image ? (
              <PhoneHostThumbnail
                worktreeId={worktreeId}
                path={figure.image}
                version={figure.version}
                alt=""
                className="size-14 shrink-0"
              />
            ) : (
              <span className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-border">
                <Image className="size-5 text-muted-foreground" aria-hidden />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base leading-snug font-medium">
                {figure.slug}
              </span>
              <span className="mt-0.5 block truncate text-[13px] leading-snug text-muted-foreground">
                {[KIND_LABELS[figure.kind], figure.folder].join(' · ')}
              </span>
            </span>
          </button>
        ))}
      </PhoneSection>
    </PhoneScrollBody>
  )
}
