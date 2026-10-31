# Phone notifications for the web client

The phone runs the web client as a Home Screen web app (PWA) and reaches a GPU server's `orcad`
through the user's own relay. This note covers how it learns that an agent needs the user ("Needs
you") or that a Run finished or failed, including while the app is closed.

## What iOS allows

- iOS 16.4+ delivers Web Push only to a Home Screen web app, never to a Safari tab. It needs a
  service worker, `PushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` with a
  VAPID public key, and a user gesture for the permission prompt.
- Each push must show a notification. Silent pushes can get the subscription revoked, so the
  service worker always shows one, and there are no "dismiss" pushes.
- `navigator.setAppBadge` works for Home Screen apps on iOS 16.4+, from the page and from the
  service worker.
- The endpoint is Apple's `web.push.apple.com`. Chrome uses FCM and Firefox uses Mozilla's
  autopush. All three speak RFC 8030, RFC 8291 and RFC 8292.

## What already exists

- `src/main/runtime/push/*` (`DesktopPushService`, `PushDispatcher`, `PushGatewayClient`) is
  upstream Orca's native-app push. It registers APNs/FCM tokens with Orca's hosted gateway
  (`ASTER_PUSH_GATEWAY_URL` / `PRODUCT_BRAND.links.pushGateway`). Aster sets no gateway, so it
  never starts, and a Web Push subscription is not a gateway token. It is not reused for
  transport.
- `RuntimeMobileNotificationController` (`runtime.onNotificationDispatched`) is the host's
  notification stream. `TerminalAgentPhonePush` already feeds it on a windowless host such as
  orcad with "needs input" and "turn finished/errored" for hook-reported agents. That covers the
  wording, the quiet window and the cooldown. This is the trigger for agents, and
  `mapPushAgentState` from `push-dispatcher.ts` maps it onto `needs-input | finished`.
- `notifications.subscribe` / `notification-stream-policy.ts` stream the same events to
  connected sockets. The web client does not use them. Its phone shell already derives "Needs
  you" from the live dashboard snapshot.
- Run state lives in each project's `.aster/` catalog (`researchProject.read`). orcad has no Run
  watcher (`research-run-watch-service.ts` runs only in the desktop's main process).
- `phone-relay-control.ts` shows the pattern for an orcad-only control behind RPC.

## Design (smallest secure version)

**The host sends Web Push itself.** orcad sits on a login node with outbound HTTPS. It encrypts
and POSTs straight to the subscription endpoint, so there is no gateway or relay change and no
new npm dependency. Everything uses Node `crypto`:

- VAPID (RFC 8292): an ES256 JWT with `aud` set to the endpoint origin, `exp` ≤ 12 h, and `sub`
  set to the subscribing page's https origin. The P-256 keypair is made once and stored
  owner-only (`writeSecureJsonFile`) in the host userData (`phone-notify-vapid.json`).
- Payload (RFC 8291 `aes128gcm`): ECDH P-256 plus HKDF-SHA-256, one record, and a fresh salt and
  sender key per message. Tests check it against the RFC 8291 Appendix A vector.

**Three RPCs**, all `device-self`. Each is keyed by the caller's transport-stamped
`pairedDeviceId`, never by a parameter, and none exists for in-process or CLI callers:

- `phoneNotify.vapidKey` returns `{ available, publicKey }`. The desktop app's runtime answers
  `available: false`, because only orcad is reachable through a relay.
- `phoneNotify.subscribe({ endpoint, keys, subject })`. The endpoint must be https on a known push
  service (Apple, FCM, Mozilla, WNS), which keeps a paired page from aiming the host at arbitrary
  URLs. Each device holds one subscription, stored owner-only in
  `phone-notify-subscriptions.json`.
- `phoneNotify.unsubscribe` drops the caller's subscription.

A subscription whose device is no longer in the device registry (revoked) is pruned before every
send and at startup. A push service answering 404/410 also drops it.

**Triggers:**

- Agents use `runtime.onNotificationDispatched` with `source: 'agent-task-complete'` and the
  `needs-input` / `finished` mapping, skipping `desktopAllowed: false` (the user turned
  notifications off).
- For Runs, while at least one subscription exists, a poll of each visible project's `.aster/`
  overview (60 s, local workspaces only) announces running → succeeded/failed/cancelled. The first
  read only seeds the state.

**Payload, no secrets.** It carries a short title (session or Run name), a status ("Needs you",
"Finished", "Run failed"), an id for dedupe/tag, and an open target (worktree id, plus
experiment and Run for Runs). Agent prompts and replies (the notification body) are never sent.
The payload is end-to-end encrypted to the phone anyway.

**Limits:**

- Dedupe by notification id for 10 min.
- A 5 s burst cooldown per device and target (the shared `reserveNotificationCooldown`).
- At most 30 pushes per device per hour.
- TTL 1 h; `Urgency: high` for Needs you, `normal` otherwise.
- One 2 s retry on network failure, none for HTTP refusals.

**Web client:**

- `sw.js` sits next to `web-index.html`, so its scope is the app folder (for example `/app/`). It
  caches nothing, always shows a notification on `push` (a generic one for an unreadable payload),
  and on `notificationclick` focuses the open app and posts the target, or opens
  `web-index.html?notify=…`.
- A "Notify me" switch in the phone header "⋯" menu appears only when the browser supports push,
  the app runs from the Home Screen (on iOS), and the host answers `phoneNotify.vapidKey` with
  `available: true`. In a Safari tab it says to add the app to the Home Screen; with the
  permission denied it says where to allow it. Old hosts answer `method_not_found` and the switch stays hidden. The VAPID
  key and service worker registration are fetched ahead of time, so the tap calls
  `pushManager.subscribe` directly inside the gesture.

**Cheap wins that need no host change:**

- While the app is open, `navigator.setAppBadge(n)` tracks the sessions that need the user. The
  count stays on the icon after the app closes, but pushes do not update it.
- An in-app banner (a top `sonner` toast with Open) shows when a session becomes Needs you, or a cached Run finishes or fails,
  unless the user is already looking at it. That is the Agents list or that session for sessions,
  and the Runs list or that Run for Runs. Runs that are still running are re-read every 60 s while
  the app is open.

## Not covered

- The Electron desktop host does not send Web Push. Phones reach only orcad through a relay.
- A host behind an HTTPS proxy: Node `fetch` ignores `HTTPS_PROXY` unless orcad's Node honors
  `NODE_USE_ENV_PROXY`.
- The host's own static web client (`--web-client-root`) does not serve `sw.js`. It is plain HTTP
  on a LAN, where Web Push is unavailable anyway; the hosted copy (Aster site `/app/`) serves it.
- Agent turns that simply finish are not pushed, only Needs you. The badge does not change while
  the app is closed.
- Delivery, the permission prompt, the badge and taps can only be verified on a real iPhone with
  the app added to the Home Screen from Safari.

## Verified without an iPhone

- RFC 8291 Appendix A reproduced byte for byte. The VAPID JWT verifies with the public key.
- A local HTTP server stands in for the push service. The host's POST carries `aes128gcm`, TTL,
  Urgency and `vapid t=…, k=…`, and the test decrypts the body with the subscription's private
  key.
- An isolated orcad with a headless iPhone 15 and the built client:
  - The switch stores and drops the subscription in the host's owner-only file.
  - A Run ending shows the banner.
  - `?notify=` opens the Run.
  - A CDP-delivered push shows the notification with its tag and target.
