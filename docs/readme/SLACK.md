# Slack connection

Aster can route a Slack bot mention in an allowed channel to one Aster project. Each Slack thread owns a background coordinator conversation in that project's workspace. The coordinator inspects project research records and suitable existing agents, delegates to one if available, or starts and supervises a new background worker. Its confirmed final answer returns to the same Slack thread. The coordinator's choice is agent-driven, so inspect the Aster conversation for the actual work and evidence.

## Desktop setup

Create a Slack app, enable Socket Mode, issue an app-level `xapp-` token with `connections:write`, subscribe to `app_mention`, and grant its bot `app_mentions:read` and `chat:write`. Install the app and invite the bot into the target channel. See [Slack's Socket Mode guide](https://docs.slack.dev/apis/events-api/using-socket-mode/).

In Aster, choose **Project ⋯ → Slack connection…**. Enter the Slack-issued app and bot (`xoxb-`) tokens, allowed channel IDs, and allowed caller IDs. `*` admits any human in the listed channels. A channel can bind to only one project. The route uses the selected project's authorized local workspace; remote project workspaces are not yet supported. Tokens are encrypted in the local Aster profile, outside the project and Git. If protected storage is unavailable, setup fails closed.

The bot can be named `aster-username` in Slack. Another channel member must use Slack's native `@aster-username` mention; plain text spelling does not trigger Aster. One Slack bot has one mention identity but can route different channels to different projects. Separate native bot mentions for separate people require separate Slack apps/connections.

The desktop connection stays active and reconnects while Aster is running. It is not a hosted service or a daemon that receives messages while the app is closed. Do not bind a project with data or permissions that its allowed Slack callers should not reach. Rotating the Slack tokens leaves project bindings in place, so review them when switching bots or workspaces.

## CLI bridge

For a headless execution host, Aster also provides an opt-in CLI bridge. Keep it running on the execution host. It supports one workspace and agent per process, with either allowed-user DMs or channel mentions:

```sh
export SLACK_APP_TOKEN='xapp-...'
export SLACK_BOT_TOKEN='xoxb-...'
aster slack bridge --worktree 'path:/path/to/project' --agent codex --allowed-users U123ABC456
aster slack bridge --worktree 'path:/path/to/project' --agent codex --allowed-users '*' --allowed-channels C123ABC456
```

In a source checkout, build the CLI and use `node out/cli/index.js` until the new CLI is installed. Do not run the desktop connection and CLI bridge with the same Slack app token at the same time; Slack can distribute events between sockets. The CLI reads tokens only from its environment. Desktop credentials are encrypted under the Aster user-data `slack/` directory. Thread-to-session links and bounded event deduplication state are also stored there.

### Run it on a server

The desktop app does not need to stay open when the Slack bridge and Aster runtime both run on the execution server. Slack Socket Mode makes an outbound connection from that server, so the Slack bridge itself needs no public inbound HTTP endpoint. The project files, agent CLI login, Aster profile, and bridge must belong to the same server user. A message can only work on a project that exists on that host.

On macOS or Linux, the installed Aster CLI can keep the runtime running as a per-user service:

```sh
aster serve service install
aster serve service status
```

Run `aster slack bridge` on that same host with the tokens supplied by a protected service environment. The foreground commands above show the bridge arguments; for unattended operation, supervise the bridge as a separate launchd or systemd user service with automatic restart. Restrict the token source to the service user and never put tokens in a unit file, command argument, project file, or Git. On Linux, enable user lingering if the service must survive logout. Aster's `serve service install` reports whether lingering is enabled, but it does not install or supervise the Slack bridge.

The project dialog currently configures a bridge attached to the desktop app only. It cannot remotely install the server service or transfer its credentials. A server-hosted bridge therefore requires server-side CLI setup. Keep one Socket Mode connection per Slack app token; stop the desktop bridge for that bot before starting the server bridge. Messages received while the bridge is offline may be missed, and the current bridge does not replay a missed final reply after restart.

To post a notification without starting an agent:

```sh
aster slack send --channel C123ABC456 --text 'Run finished' --thread-ts 1720000000.000001
```

Slack approvals, attachments, plain-text aliases, and shell commands are not accepted by the bridge. Approvals stay in Aster. Aster preserves agent conversations when the connection drops, but the bridge does not yet recover and post a missed final reply after restart. Actual Slack delivery and delegation still require live workspace testing; unit tests do not prove end-to-end operation.
