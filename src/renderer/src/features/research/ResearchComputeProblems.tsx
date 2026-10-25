import type { ResearchComputeHost } from './ResearchComputeHostStrip'

export function ResearchComputeProblems({
  problems
}: {
  problems: readonly { host: ResearchComputeHost; message: string }[]
}): React.JSX.Element | null {
  if (!problems.length) {
    return null
  }
  return (
    <ul className="space-y-1 rounded-lg border border-status-warning-border bg-status-warning-background p-3 text-xs">
      {problems.map(({ host, message }) => (
        <li key={`${host.targetId}:${message}`}>
          <span className="font-medium">{host.label}:</span> {message}
        </li>
      ))}
    </ul>
  )
}
