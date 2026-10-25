import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
import { CLI_NAME } from '../../shared/product-brand'

export const BROWSER_ADVANCED_COMMAND_SPECS: CommandSpec[] = [
  // ── Cookie management ──
  {
    path: ['cookie', 'get'],
    summary: 'Get cookies for the active tab (optionally filter by URL)',
    usage: `${CLI_NAME} cookie get [--url <url>] [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'url', 'worktree']
  },
  {
    path: ['cookie', 'set'],
    summary: 'Set a cookie',
    usage: `${CLI_NAME} cookie set --name <n> --value <v> [--domain <d>] [--path <p>] [--secure] [--httpOnly] [--sameSite <s>] [--expires <epoch>] [--worktree <selector>] [--json]`,
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'name',
      'value',
      'domain',
      'path',
      'secure',
      'httpOnly',
      'sameSite',
      'expires',
      'worktree'
    ]
  },
  {
    path: ['cookie', 'delete'],
    destructive: true,
    summary: 'Delete a cookie by name',
    usage: `${CLI_NAME} cookie delete --name <n> [--domain <d>] [--url <u>] [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'name', 'domain', 'url', 'worktree']
  },
  // ── Viewport ──
  {
    path: ['viewport'],
    summary: 'Set browser viewport size',
    usage: `${CLI_NAME} viewport --width <w> --height <h> [--scale <n>] [--mobile] [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'width', 'height', 'scale', 'mobile', 'worktree']
  },
  // ── Geolocation ──
  {
    path: ['geolocation'],
    summary: 'Override browser geolocation',
    usage: `${CLI_NAME} geolocation --latitude <lat> --longitude <lon> [--accuracy <n>] [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'latitude', 'longitude', 'accuracy', 'worktree']
  },
  // ── Request interception ──
  {
    path: ['intercept', 'enable'],
    summary: 'Enable request interception (pause matching requests)',
    usage: `${CLI_NAME} intercept enable [--patterns <glob,...>] [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'patterns', 'worktree']
  },
  {
    path: ['intercept', 'disable'],
    summary: 'Disable request interception',
    usage: `${CLI_NAME} intercept disable [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'worktree']
  },
  {
    path: ['intercept', 'list'],
    summary: 'List paused (intercepted) requests',
    usage: `${CLI_NAME} intercept list [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'worktree']
  },
  // TODO: add intercept continue/block once agent-browser supports per-request
  // interception decisions (currently only supports URL-pattern-based route/unroute).
  // ── Console/network capture ──
  {
    path: ['capture', 'start'],
    summary: 'Start capturing console and network events',
    usage: `${CLI_NAME} capture start [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'worktree']
  },
  {
    path: ['capture', 'stop'],
    summary: 'Stop capturing console and network events',
    usage: `${CLI_NAME} capture stop [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'worktree']
  },
  {
    path: ['console'],
    summary: 'Show captured console log entries',
    usage: `${CLI_NAME} console [--limit <n>] [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'limit', 'worktree']
  },
  {
    path: ['network'],
    summary: 'Show captured network requests',
    usage: `${CLI_NAME} network [--limit <n>] [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'limit', 'worktree']
  },
  // ── Additional core commands ──
  {
    path: ['dblclick'],
    summary: 'Double-click element by ref',
    usage: `${CLI_NAME} dblclick --element <ref> [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'element', 'worktree']
  },
  {
    path: ['forward'],
    summary: 'Navigate forward in browser history',
    usage: `${CLI_NAME} forward [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'worktree']
  },
  {
    path: ['scrollintoview'],
    summary: 'Scroll element into view',
    usage: `${CLI_NAME} scrollintoview --element <ref> [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'element', 'worktree']
  },
  {
    path: ['get'],
    summary: 'Get element property (text, html, value, url, title, count, box)',
    usage: `${CLI_NAME} get --what <property> [--element <ref>] [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'what', 'element', 'worktree']
  },
  {
    path: ['is'],
    summary: 'Check element state (visible, enabled, checked)',
    usage: `${CLI_NAME} is --what <state> --element <ref> [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'what', 'element', 'worktree']
  },
  // ── Keyboard insert text ──
  {
    path: ['inserttext'],
    summary: 'Insert text without key events',
    usage: `${CLI_NAME} inserttext --text <text> [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'text', 'worktree']
  },
  // ── Mouse commands ──
  {
    path: ['mouse', 'move'],
    summary: 'Move mouse to x,y coordinates',
    usage: `${CLI_NAME} mouse move --x <n> --y <n> [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'x', 'y', 'worktree']
  },
  {
    path: ['mouse', 'down'],
    summary: 'Press mouse button',
    usage: `${CLI_NAME} mouse down [--button <left|right|middle>] [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'button', 'worktree']
  },
  {
    path: ['mouse', 'up'],
    summary: 'Release mouse button',
    usage: `${CLI_NAME} mouse up [--button <left|right|middle>] [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'button', 'worktree']
  },
  {
    path: ['mouse', 'wheel'],
    summary: 'Scroll wheel',
    usage: `${CLI_NAME} mouse wheel --dy <n> [--dx <n>] [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'dy', 'dx', 'worktree']
  },
  // ── Find (semantic locators) ──
  {
    path: ['find'],
    summary: 'Find element by semantic locator and perform action',
    usage: `${CLI_NAME} find --locator <type> --value <text> --action <action> [--text <text>] [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'locator', 'value', 'action', 'text', 'worktree']
  },
  // ── Set commands ──
  {
    path: ['set', 'device'],
    summary: 'Emulate a device',
    usage: `${CLI_NAME} set device --name <device> [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'name', 'worktree']
  },
  {
    path: ['set', 'offline'],
    summary: 'Toggle offline mode',
    usage: `${CLI_NAME} set offline [--state <on|off>] [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'state', 'worktree']
  },
  {
    path: ['set', 'headers'],
    summary: 'Set extra HTTP headers',
    usage: `${CLI_NAME} set headers --headers <json> [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'headers', 'worktree']
  },
  {
    path: ['set', 'credentials'],
    summary: 'Set HTTP auth credentials',
    usage: `${CLI_NAME} set credentials --user <user> --pass <pass> [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'user', 'pass', 'worktree']
  },
  {
    path: ['set', 'media'],
    summary: 'Set color scheme and reduced motion preferences',
    usage: `${CLI_NAME} set media [--color-scheme <dark|light>] [--reduced-motion <reduce|no-preference>] [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'color-scheme', 'reduced-motion', 'worktree']
  },
  // ── Clipboard commands ──
  {
    path: ['clipboard', 'read'],
    summary: 'Read clipboard contents',
    usage: `${CLI_NAME} clipboard read [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'worktree']
  },
  {
    path: ['clipboard', 'write'],
    summary: 'Write text to clipboard',
    usage: `${CLI_NAME} clipboard write --text <text> [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'text', 'worktree']
  },
  // ── Dialog commands ──
  {
    path: ['dialog', 'accept'],
    summary: 'Accept a browser dialog',
    usage: `${CLI_NAME} dialog accept [--text <text>] [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'text', 'worktree']
  },
  {
    path: ['dialog', 'dismiss'],
    summary: 'Dismiss a browser dialog',
    usage: `${CLI_NAME} dialog dismiss [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'worktree']
  },
  // ── Storage commands ──
  {
    path: ['storage', 'local', 'get'],
    summary: 'Get a localStorage value by key',
    usage: `${CLI_NAME} storage local get --key <key> [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'key', 'worktree']
  },
  {
    path: ['storage', 'local', 'set'],
    summary: 'Set a localStorage value',
    usage: `${CLI_NAME} storage local set --key <key> --value <value> [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'key', 'value', 'worktree']
  },
  {
    path: ['storage', 'local', 'clear'],
    destructive: true,
    summary: 'Clear all localStorage',
    usage: `${CLI_NAME} storage local clear [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'worktree']
  },
  {
    path: ['storage', 'session', 'get'],
    summary: 'Get a sessionStorage value by key',
    usage: `${CLI_NAME} storage session get --key <key> [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'key', 'worktree']
  },
  {
    path: ['storage', 'session', 'set'],
    summary: 'Set a sessionStorage value',
    usage: `${CLI_NAME} storage session set --key <key> --value <value> [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'key', 'value', 'worktree']
  },
  {
    path: ['storage', 'session', 'clear'],
    destructive: true,
    summary: 'Clear all sessionStorage',
    usage: `${CLI_NAME} storage session clear [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'worktree']
  },
  // ── Download command ──
  {
    path: ['download'],
    summary: 'Download a file by clicking a selector',
    usage: `${CLI_NAME} download --selector <ref> --path <path> [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'selector', 'path', 'worktree']
  },
  // ── Highlight command ──
  {
    path: ['highlight'],
    summary: 'Highlight an element by selector',
    usage: `${CLI_NAME} highlight --selector <ref> [--worktree <selector>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, 'selector', 'worktree']
  }
]
