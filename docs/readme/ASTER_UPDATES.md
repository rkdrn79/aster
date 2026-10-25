# Aster updates

## Getting a new version

Current Aster builds do not update themselves. To upgrade, download the latest
`Aster-mac-arm64.dmg` (or `.zip`) from the
[Releases page](https://github.com/rkdrn79/aster/releases/latest) and replace
`/Applications/Aster.app` with it. Projects and settings stay in place, because they live in your
project folders and `~/Library/Application Support/Aster`, not in the app bundle.

Builds are signed ad hoc and are not notarized yet, so macOS blocks the first open of each new
version. Right-click **Aster** → **Open**, or run
`xattr -dr com.apple.quarantine /Applications/Aster.app`.

The app's version always matches its release tag: version `X.Y.Z` is published as `vX.Y.Z`.

## How updates will work

The in-app updater is built in but switched off. `src/shared/product-brand.json` has a null
`links.updateFeed`, so the app makes no update requests, and the Aster electron-builder config has
no publish target.

A release build turns the updater on by embedding an HTTPS feed at build time:

```bash
ASTER_UPDATE_FEED_URL=https://updates.example.com/aster/stable \
  pnpm build:aster:mac:release
```

`ASTER_UPDATE_FEED_URL` is embedded in both the main process and the renderer, and written into
electron-builder's `app-update.yml`. Local builds leave it unset and never contact an update
server. The release command stops before building when the feed or the macOS signing environment is
missing. It builds the DMG, the update ZIP and `latest-mac.yml` without publishing them; upload the
complete set together. The example URL above is not a live service.

Once a feed-enabled build is installed, the app checks for updates on launch and from **Settings →
Updates**, downloads the new version after you choose **Update**, keeps the macOS signature checks,
and restarts after its normal session cleanup. Installs from earlier builds have no feed and need
one manual upgrade to a feed-enabled build.

## Release gate for automatic updates

Automatic updates stay off until all of these hold:

1. **Developer ID signing.** The build is signed with a Developer ID Application identity, keeping
   the same bundle ID and signing team across releases.
2. **Notarization.** Apple notarizes the build. Ad hoc signatures cannot be notarized.
3. **N → N+1 update test.** An installed, signed version N updates to signed version N+1 from the
   feed: notification, download, signature validation, restart, and workspace and session
   restoration all work, and a partially published release fails safely.

The version must also increase with every release, since the updater only offers a version greater
than the installed one.

References: [Apple Developer ID](https://developer.apple.com/developer-id/),
[notarizing macOS software](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution),
[electron-builder auto-update](https://www.electron.build/docs/features/auto-update/).
