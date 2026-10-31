import type {
  AgentSessionLaunchPlan,
  AgentSessionLaunchRequest
} from '@/lib/agent-session-launch-plan'
import type { AgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import type { StructuredLaunchTerminal } from '@/lib/structured-agent-session-launch-admission'
import type { NativeChatComposerFocusIntent } from '@/components/native-chat/use-native-chat-composer-reveal-focus'
import type { TuiAgent } from '../../../shared/tui-agent'
import type { LaunchSource } from '../../../shared/telemetry-events'

/** The user action this launch serves: minted where that action is handled, or carried by the
 *  route the caller already planned for it. */
type LaunchAgentInNewTabRequest =
  | { requestId: AgentLaunchRequestId; agentSessionLaunchPlan?: undefined }
  | {
      /** Keeps a preflighted route authoritative across workspace creation. */
      agentSessionLaunchPlan: AgentSessionLaunchPlan
      requestId?: undefined
    }

export type LaunchAgentInNewTabArgs = LaunchAgentInNewTabRequest & {
  requestedSurface?: AgentSessionLaunchRequest['requestedSurface']
  selectedExecutionHostId?: AgentSessionLaunchRequest['selectedExecutionHostId']
  agent: TuiAgent
  worktreeId: string
  /** Captured at a new-chat action before the host can delay route selection. */
  focusIntent?: NativeChatComposerFocusIntent
  /** Tab group the user launched from; keeps split-group launches in that pane instead of the active group. */
  groupId?: string
  /** Optional initial prompt; delivery depends on `promptDelivery` and the agent's prompt mode. */
  prompt?: string
  /** Optional CLI arguments appended to the selected agent command. */
  agentArgs?: string | null
  initialCwd?: string | null
  /** How to deliver the prompt: `draft` leaves it editable, `submit-after-ready` sends it once the TUI is ready. */
  promptDelivery?: 'auto-submit' | 'draft' | 'submit-after-ready'
  /** Telemetry surface that initiated this launch. Defaults to the tab-bar quick-launch entry point. */
  launchSource?: LaunchSource
  /** User-authored Quick Command label for local tabs created from the tab bar. */
  quickCommandLabel?: string | null
  /** Shell platform for the startup command; defaults to renderer OS. SSH/WSL worktrees run Linux even from Windows. */
  launchPlatform?: NodeJS.Platform
  /** Called after the prompt is actually delivered to the agent input path. */
  onPromptDelivered?: () => void
  /** The caller keeps the prompt's text if it does not go out (notes), so no composer gets it. */
  promptKeptByCaller?: true
  /**
   * Called before `onPromptDelivered` when the paste was written without ever observing the
   * agent's composer, so the launch cannot claim the prompt arrived. Fires only on the
   * terminal route, whose readiness signal the client watches itself.
   */
  onPromptDeliveryUnconfirmed?: () => void
  /** Keep terminal launches in a floating workspace from taking global selection. */
  activate?: boolean
  /** False when the caller shows a host-terminal launch failure itself, so no toast repeats it. */
  notifyFailure?: false
  /** The launch seeds a workspace being opened, so its PTY spawn must not reshuffle Recent. */
  pendingActivationSpawn?: boolean
  /** Lets a workspace reveal itself before the selected surface opens. */
  beforeSurfaceOpen?: (
    surface: { kind: 'local-terminal' } | { kind: 'host-published' }
  ) => boolean | void
  /** Opens instead of this agent's terminal when the host declines its structured chat. */
  onStructuredHostDeclined?: () => StructuredLaunchTerminal
}
