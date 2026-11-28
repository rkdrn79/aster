import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { slackBridgeRestartCommand } from '../../../../shared/server-auto-update'
import { translate } from '@/i18n/i18n'
import { Button } from '../ui/button'

/** Tells the person how to move a host's older Slack bridge onto the updating code. */
export function ServerAutoUpdateSlackNote({ unit }: { unit: string }): React.JSX.Element {
  const command = slackBridgeRestartCommand(unit)
  return (
    <div
      data-testid="server-auto-update-slack-note"
      className="space-y-1 text-xs text-muted-foreground"
    >
      <p>
        {translate(
          'auto.components.settings.serverAutoUpdate.slackNote',
          'This host’s Slack bridge runs older code, so Aster pauses it during updates. Restart it once so it follows updates itself:'
        )}
      </p>
      <div className="flex min-w-0 items-center gap-1">
        <code
          data-testid="server-auto-update-slack-command"
          className="min-w-0 truncate rounded bg-muted px-1.5 py-0.5 font-mono text-2xs text-foreground"
        >
          {command}
        </code>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={translate(
            'auto.components.settings.serverAutoUpdate.copyCommand',
            'Copy command'
          )}
          onClick={() => {
            void window.api.ui.writeClipboardText(command).then(
              () =>
                toast.success(
                  translate(
                    'auto.components.settings.serverAutoUpdate.commandCopied',
                    'Command copied'
                  )
                ),
              () =>
                toast.error(
                  translate(
                    'auto.components.settings.serverAutoUpdate.copyFailed',
                    'Couldn’t copy the command.'
                  )
                )
            )
          }}
        >
          <Copy />
        </Button>
      </div>
    </div>
  )
}
