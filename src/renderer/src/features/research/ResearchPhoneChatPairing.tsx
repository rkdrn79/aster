import { Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ResearchPhoneChatPairing({
  pairing,
  qrDataUrl,
  onPair
}: {
  pairing: boolean
  qrDataUrl: string | null
  onPair: () => void
}): React.JSX.Element {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          Pair this project’s host in the Paseo iPhone app to use its conversations away from your
          computer.
        </span>
        <Button size="sm" variant="outline" disabled={pairing} onClick={onPair}>
          <Smartphone aria-hidden /> {pairing ? 'Preparing…' : 'Pair phone'}
        </Button>
      </div>
      {qrDataUrl ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-border p-3 text-center">
          <img src={qrDataUrl} alt="Paseo phone pairing QR code" width={232} height={232} />
          <p className="text-xs text-muted-foreground">
            Scan with the Paseo app. Keep this code private and refresh it if pairing fails.
          </p>
        </div>
      ) : null}
    </>
  )
}
