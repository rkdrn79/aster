# Slack connection

Aster routes a native bot mention in an allowed Slack channel to one Aster project. Each thread uses a background coordinator conversation in that project's workspace. The coordinator may ask an existing agent or start a worker, and its confirmed answer goes back to the same Slack thread. Agent work still follows the project's permissions; Slack does not approve runs or shell commands on the user's behalf.

## Set up the Slack app

1. In [Slack's app settings](https://api.slack.com/apps), create an app for your workspace. Under **Settings → Socket Mode**, turn Socket Mode on.
2. Under **Settings → Basic Information → App-Level Tokens**, generate an `xapp-` token with `connections:write`. This is the Socket Mode token. **App Configuration Tokens** on the apps list page are for managing manifests, expire after 12 hours, and do not belong in Aster. [Slack's Socket Mode guide](https://docs.slack.dev/apis/events-api/using-socket-mode/) and [configuration-token guide](https://docs.slack.dev/app-manifests/configuring-apps-with-app-manifests/) explain the distinction.
3. Under **Features → Event Subscriptions**, enable events and subscribe the bot to `app_mention`.
4. Under **Features → OAuth & Permissions → Bot Token Scopes**, add `app_mentions:read` and `chat:write`. Add `channels:history` for public channels and `groups:history` for private channels if Aster should catch up on mentions sent while offline. [Slack's history API](https://docs.slack.dev/reference/methods/conversations.history/) requires the relevant history scope.
5. Install or reinstall the app to the workspace. Copy the Bot User OAuth Token beginning `xoxb-` from **OAuth & Permissions**, then invite the bot into each channel you will connect.

## Connect a project in Aster

1. Open the project menu **⋯ → Slack connection…**. A remote project needs a paired Aster runtime reachable from this computer.
2. Paste the `xapp-` app token and `xoxb-` bot token. Enter the channel IDs (`C…` or `G…`) and allowed Slack user IDs (`U…` or `W…`). `*` allows any member of only the selected channels. Choose Codex or Claude Code as the coordinator, then **Save connection**.
3. In Slack, mention the bot using Slack's native mention picker, for example `@aster-username summarize this run`. Plain text spelling is not a mention event. Aster opens a background coordinator and posts the result in the same thread.
4. Optional: turn on **Keep Slack connected when Aster is closed**. Aster installs a per-user Slack bridge service and, if missing, a background Aster runtime. The app hands its Socket Mode connection to that service. SSH-tunneled projects cannot use this switch because the tunnel belongs to the open desktop app. Independent reachable remote runtime endpoints can use the service. The switch is available in installed macOS and Linux builds; Windows background service installation is not available yet.

The dialog shows whether the app or background service owns the socket. App and service share one connection lease per app token. When the computer sleeps or loses network, Aster tries to catch up after reconnecting: up to the previous 24 hours and 200 channel messages per pass, plus bounded thread replies. A newly connected channel starts from the time it was added, so old channel history is not answered. If the bot lacks a history scope, catch-up is skipped and the dialog reports the missing scope. A reply that was underway when the bridge stopped is not guaranteed to be reposted automatically.

Tokens are outside the project and Git. The desktop copy uses protected local storage. The background service uses the macOS login Keychain or an owner-only file in the Linux Aster profile. Review channel bindings when rotating a bot token. Only connect projects whose data and agent permissions are appropriate for the allowed Slack callers.

### Remote project lifetime

The desktop route records the remote environment, verified runtime and host key, and exact workspace ID. The one local Slack Socket Mode bridge selects that remote runtime for the project's coordinator; it never interprets a remote path as a Mac path or sends Slack tokens to the remote host. A changed host identity requires reconnecting the project. For an SSH-tunneled runtime, this works only while Aster stays open and owns its managed tunnel. The app refuses both enabling its background Slack service with such a route and adding such a route while that service is enabled. Keeping an SSH host connected with the app closed requires a future background owner for the SSH tunnel and is not implemented. The host-side CLI bridge below is an alternative, but a separate host cannot safely use the same bot token concurrently with the desktop bridge.

## Headless host CLI

The Slack bridge and Aster runtime can run on the same macOS or Linux execution host without the desktop app staying open. Socket Mode makes an outbound WebSocket connection, so no public inbound URL is needed. Install Aster on that host, log in to the chosen agent CLI, and register the project there. Then install the per-user runtime and bridge services:

```sh
aster serve service install
aster serve service status

# Set these in the current shell from your secret store; do not put them in Git or a unit file.
export SLACK_APP_TOKEN='xapp-…'
export SLACK_BOT_TOKEN='xoxb-…'
aster slack service install --worktree 'path:/absolute/project' \
  --agent codex --allowed-users '*' --allowed-channels C123ABC456
aster slack service status
unset SLACK_APP_TOKEN SLACK_BOT_TOKEN
```

`aster slack service install --dry-run` shows the launchd/systemd unit without writing it. It never includes the tokens. `aster slack service uninstall` stops the bridge and removes its stored tokens; `aster serve service uninstall` is separate. On Linux, user lingering may be needed for services to survive logout. A server-installed bridge does not install itself through the desktop project's Slack dialog, and only one bridge should own a given bot token at a time.

For a manually supervised process, use `aster slack bridge` with the same worktree, agent, caller, and channel flags. This reads the two tokens from its environment. `aster slack send --channel C123ABC456 --text 'Run finished'` posts a message without starting an agent. Do not use the same app token in multiple independent profiles or hosts at once; their local lease files cannot coordinate with each other.

Slack approvals, attachments, plain-text aliases and shell commands are not accepted by the bridge. Aster's background coordinator can reason about a request, but live agent CLI availability and project permissions determine what it can actually do. The automated tests use a fake Slack API and socket; they do not establish that a particular workspace's real Slack app, agent login, or remote host is ready.
