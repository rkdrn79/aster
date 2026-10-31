import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
import { CLI_NAME, LINUX_CLI_NAME, PRODUCT_NAME } from '../../shared/product-brand'

export const SERVE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['serve'],
    summary: `Start an ${PRODUCT_NAME} runtime server without opening a desktop window`,
    usage: `${CLI_NAME} serve [--port <port>] [--pairing-address <host>] [--mobile-pairing] [--no-pairing] [--grant-desktop-control] [--project-root <path>] [--recipe-json] [--relay <wss-url>] [--supervise] [--force] [--json]`,
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'port',
      'pairing-address',
      'mobile-pairing',
      'no-pairing',
      'grant-desktop-control',
      'project-root',
      'recipe-json',
      'relay',
      'supervise',
      'force'
    ],
    notes: [
      'Runs in the foreground and prints the bound endpoint, advertised endpoint, and pairing status. Stop it with Ctrl+C.',
      'With --port, serve exits with an error when that port is already in use. Without it, serve uses 6768 and moves to another port when 6768 is taken.',
      '--pairing-address changes only the client-advertised address; use a reachable LAN, Tailscale, SSH-forward, or reverse-proxy endpoint.',
      'Use --recipe-json with --project-root from VM recipes to print the recipe result JSON and leave the server running.',
      'Use --mobile-pairing to print a mobile-scoped pairing QR/link instead of the default runtime-environment pairing link.',
      `A paired client cannot drive this machine's desktop (${CLI_NAME} computer) unless the offer was created with --grant-desktop-control.`,
      'Experimental: --relay <wss-url> also serves clients through an Aster relay (see aster-relay), so a phone can reach a server with no inbound port. With --mobile-pairing the QR points to the relay. Requires orcad; Electron serve refuses it.',
      'When the web client bundle is available, the server also prints a browser URL with the pairing data embedded.',
      `Exits with code 3, without starting anything, when another ${PRODUCT_NAME} already serves this profile or cannot be shown to have stopped.`,
      `On macOS, after ${PRODUCT_NAME} serve aborts at startup (it could not register with Launch Services), later runs from the same environment refuse for 30 minutes with exit code 78. Use --force to try anyway.`,
      `--supervise is for service managers (launchd, systemd). ${PRODUCT_NAME} serve then restarts the server itself with growing delays instead of exiting when it stops, waits while an update replaces the app, and waits while another ${PRODUCT_NAME} serves this profile. After 6 failures in 15 minutes it gives up and exits with code 0 so the manager stops too, and later supervised runs refuse until a new build is installed or --force is passed. Not available on Windows yet.`,
      `Experimental and off by default: set ORCA_TERMINAL_PROCESS_CEILING=<n> (64 or more) before the terminal host starts to have the OS cap how many processes each terminal may run (Linux, through a systemd user scope per terminal, which needs a user manager that outlives logout; Windows, through a job per terminal). \`${CLI_NAME} serve\` reports the ceiling as on or off, with the reason.`,
      'Off by default: set ORCA_TERMINAL_MEMORY_MAX=<size> (256M or more) and ORCA_TERMINAL_MEMORY_SWAP_MAX=<size> (0 for no swap) before the terminal host starts to cap the memory and swap of each terminal on Linux, through the same per-terminal systemd user scope. A terminal over its limit has its largest process OOM-killed; the host and other terminals keep running. Sizes take K, M, G or T. A limit the host cannot enforce is skipped and logged in the terminal host log. No effect on macOS or Windows.'
    ],
    examples: [
      `${CLI_NAME} serve`,
      `${CLI_NAME} serve --json`,
      `${CLI_NAME} serve --project-root /workspace/repo --pairing-address wss://sandbox.example.com --recipe-json`,
      `${CLI_NAME} serve --port 6768 --pairing-address 100.64.1.20`,
      `${CLI_NAME} serve --pairing-address 100.64.1.20 --mobile-pairing`,
      `${CLI_NAME} serve --relay 'wss://aster-relay.<subdomain>.workers.dev/ws?key=<key>' --mobile-pairing`
    ]
  },
  {
    path: ['serve', 'restore', 'resume'],
    summary: 'Resume automatic terminal restores that this host paused',
    usage: `${CLI_NAME} serve restore resume [--json]`,
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      `After its terminal host stops unexpectedly, or while it is overloaded, ${PRODUCT_NAME} keeps restored agent sessions asleep instead of starting them all at once. Each one resumes when you open it.`,
      `This clears that pause so automatic restores start again, within the normal limits. It talks to the ${PRODUCT_NAME} running on this machine and never starts a server.`,
      `It also lists restores from an older ${PRODUCT_NAME} client that this host refused, with the command that resumes each one.`
    ],
    examples: [`${CLI_NAME} serve restore resume`, `${CLI_NAME} serve restore resume --json`]
  },
  {
    path: ['serve', 'service', 'install'],
    summary: `Run ${CLI_NAME} serve as a per-user background service that restarts itself`,
    usage: `${CLI_NAME} serve service install [--port <port>] [--pairing-address <host>] [--command <path>] [--dry-run] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'port', 'pairing-address', 'command', 'dry-run'],
    notes: [
      `macOS writes a LaunchAgent; Linux writes a systemd user unit. Both run \`${CLI_NAME} serve --supervise --no-pairing\` for this profile, so the server restarts with growing delays and gives up after repeated failures instead of looping.`,
      `The service never prints a pairing link to its log. Pair clients from the desktop app, or with \`${CLI_NAME} serve\` in a terminal while the service is stopped.`,
      'On Linux the service stops at logout unless lingering is on (`loginctl enable-linger`); install reports it.',
      `Reinstalling replaces the unit and clears a previous give-up. --command defaults to the installed ${PRODUCT_NAME} app's \`${CLI_NAME}\` command on PATH (\`${LINUX_CLI_NAME}\` on Linux) and must not be a launcher tied to one ${PRODUCT_NAME} version. --dry-run prints the unit without installing it.`,
      `Needs the ${PRODUCT_NAME} app installed on this machine. The \`${CLI_NAME}\` command in an ${PRODUCT_NAME} terminal on an SSH host belongs to that connection's server and cannot install a service.`,
      'Not available on Windows yet.'
    ],
    examples: [
      `${CLI_NAME} serve service install`,
      `${CLI_NAME} serve service install --port 6768 --dry-run`
    ]
  },
  {
    path: ['serve', 'service', 'status'],
    summary: `Show whether this profile's ${CLI_NAME} serve service is running`,
    usage: `${CLI_NAME} serve service status [--json]`,
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Reports live, exited, or unverifiable (when the service manager cannot be asked), plus why the supervisor gave up if it did.'
    ],
    examples: [`${CLI_NAME} serve service status`, `${CLI_NAME} serve service status --json`]
  },
  {
    path: ['serve', 'service', 'uninstall'],
    summary: `Stop and remove this profile's ${CLI_NAME} serve service`,
    usage: `${CLI_NAME} serve service uninstall [--json]`,
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Stops the service and removes its unit file. The terminal daemon and its sessions keep running.'
    ],
    examples: [`${CLI_NAME} serve service uninstall`]
  }
]
