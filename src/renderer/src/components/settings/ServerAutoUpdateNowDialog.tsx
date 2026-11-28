import { translate } from '@/i18n/i18n'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog'
import { updateNowConfirmationText } from './server-auto-update-copy'

/** Asked before an update that cuts the replies agents are writing; the chats continue after it. */
export function ServerAutoUpdateNowDialog({
  agents,
  hostLabel,
  onCancel,
  onConfirm
}: {
  /** How many agents were working when the person asked; null keeps the dialog closed. */
  agents: number | null
  hostLabel: string
  onCancel: () => void
  onConfirm: () => void
}): React.JSX.Element {
  return (
    <Dialog open={agents !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent
        data-testid="server-auto-update-confirm"
        className="max-w-sm sm:max-w-sm"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.settings.serverAutoUpdate.confirmTitle', 'Update now?')}
          </DialogTitle>
          <DialogDescription>
            {agents !== null ? updateNowConfirmationText(agents, hostLabel) : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {translate('auto.components.settings.serverAutoUpdate.cancel', 'Cancel')}
          </Button>
          <Button type="button" data-testid="server-auto-update-confirm-now" onClick={onConfirm}>
            {translate('auto.components.settings.serverAutoUpdate.updateNow', 'Update now')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
