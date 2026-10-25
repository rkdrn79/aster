# Built-in browser commands

Use a snapshot-interact-re-snapshot loop:

```text
ASTER goto --url https://example.com --json
ASTER snapshot --json
ASTER click --element @e3 --json
ASTER snapshot --json
```

Common commands:

```text
ASTER goto --url <url> --json
ASTER back --json
ASTER reload --json
ASTER snapshot --json
ASTER screenshot --json
ASTER full-screenshot --json
ASTER pdf --json
ASTER click --element <ref> --json
ASTER fill --element <ref> --value <text> --json
ASTER type --input <text> --json
ASTER select --element <ref> --value <value> --json
ASTER check --element <ref> --json
ASTER scroll --direction down --amount 1000 --json
ASTER hover --element <ref> --json
ASTER focus --element <ref> --json
ASTER keypress --key Enter --json
ASTER upload --element <ref> --files <paths> --json
ASTER wait --text <text> --json
ASTER wait --url <substring> --json
ASTER wait --selector <css> --json
ASTER wait --load networkidle --json
ASTER eval --expression <js> --json
ASTER tab list --json
ASTER tab create --url <url> --json
ASTER tab switch --index <n> --json
ASTER tab close --index <n> --json
ASTER cookie get --json
ASTER capture start --json
ASTER console --limit 50 --json
ASTER network --limit 50 --json
ASTER exec --command "help" --json
```

Browser rules:

- Re-snapshot after navigation, tab switches, clicks that change the page, and any `browser_stale_ref`.
- Refs like `@e1` are assigned by `snapshot`, scoped to one tab, and invalidated by navigation or tab switch.
- Browser commands default to the current worktree and its active tab. Use `--worktree all` only intentionally.
- For concurrent browser work, run `ASTER tab list --json`, read `tabs[].browserPageId`, and pass `--page <browserPageId>` on later commands.
- Use typed tab commands (`ASTER tab list/create/close/switch`), not `ASTER exec --command "tab ..."`, so Aster keeps UI state synchronized.
- Prefer `wait --text`, `--url`, `--selector`, or `--load` after async page changes instead of bare timeouts.
- Anything not listed above goes through `ASTER exec --command "<agent-browser command>"`.
- If `fill` or `type` fails on a custom input, try `ASTER focus --element @e1 --json` then `ASTER inserttext --text "text" --json`.
- A client-hosted page renders in the paired desktop's browser engine, so every command against it needs that desktop online and returns `browser_host_unavailable` while it is closed, asleep, or disconnected. Server-hosted pages run with no desktop attached; prefer them for long or unattended automation.

Common recoveries:

- `browser_no_tab`: open a tab with `ASTER tab create --url <url> --json`.
- `browser_stale_ref`: run `ASTER snapshot --json` and retry with fresh refs.
- `browser_tab_not_found`: run `ASTER tab list --json` before switching or closing.
- `browser_host_unavailable`: the desktop hosting the page is offline. Bring it back, or recreate the page with server placement if the work must outlive the desktop session.
