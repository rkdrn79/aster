/**
 * How a Slack bridge on an SSH host (`aster slack bridge --service`) and the desktop's server
 * update agree, using only files under the host's orcad root (`~/.orca-remote`).
 *
 * A bridge whose code follows updates writes `<root>/.slack-bridge-follow/<pid>` while it runs.
 * During an activation (`<root>/.orcad-activation-transaction/` exists) it never starts the old
 * server again, and once the active version moves it re-executes itself through the new build.
 * A bridge process without that file runs older code, which restarts whatever version the record
 * names whenever the server stops, so the desktop pauses it for the update instead.
 */

export const SLACK_BRIDGE_FOLLOW_DIRNAME = '.slack-bridge-follow'

/** Mirrors ORCAD_ACTIVATION_TRANSACTION_DIRNAME in main; the CLI cannot import main. */
export const ORCAD_ACTIVATION_JOURNAL_DIRNAME = '.orcad-activation-transaction'

export const ORCAD_ACTIVE_RECORD_FILENAME = 'orcad-active.json'

/**
 * A journal untouched for this long belongs to a desktop that went away mid-update. The bridge
 * then restores the recorded server again, since nothing else would; recovery is the desktop's.
 */
export const ORCAD_ACTIVATION_JOURNAL_STALE_MS = 15 * 60_000
