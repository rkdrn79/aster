# Aster updates

## How updates reach users

The previously published 0.1.0 app has no release checker. Its users must install 1.0.0 or later
once before they can receive in-app update notices.

Starting with the packaged 1.0.0 Apple Silicon release, Aster checks the latest published
[GitHub Release](https://github.com/rkdrn79/aster/releases/latest) on launch and every 24 hours.
When a higher `vX.Y.Z` tag has an `Aster-mac-arm64.dmg` asset, the app displays an update card and
the **Settings → Updates** action. **Download DMG** opens that exact release asset in the browser.
The user quits Aster and replaces Aster.app in Applications. Projects and settings remain in their
project folders and `~/Library/Application Support/Aster`.

These builds are signed ad hoc. They have no Developer ID certificate or notarization, so macOS
may require the same manual open step as the initial install, and some privacy permissions may
need to be granted again after replacement. The app does not silently install an update.

## Release macOS, Windows, GitHub, and the website together

Only start an app or package build when the user explicitly requests a build or release. A source
change does not authorize a build. For a requested release, use one version tag and one commit for
both platforms, and finish all four destinations before calling the release complete.

The [`aster-mac-release.yml`](../../.github/workflows/aster-mac-release.yml) GitHub Actions
workflow runs when a `vX.Y.Z` tag newer than the current Release is pushed to the public
`rkdrn79/aster` repository. The private `rkdrn79/aster-dev` origin cannot publish to that separate
repository with its default `GITHUB_TOKEN`, so this workflow skips tags pushed there. It checks
that `package.json` has exactly the same version, builds the Apple Silicon app and its
remote-server prebuilds on hosted runners, packages
an ad hoc signed DMG and ZIP, verifies their signatures and update manifest, and uploads the four
assets to a draft GitHub Release. The Windows workflow builds and tests the installer and ZIP from
the same tag. The Windows asset workflow adds them to that draft. Publish the Release only after
both platforms and the website change are ready. Publication is the event that makes the new
version visible to installed apps. A normal branch push alone does not publish an update.

To ship version `X.Y.Z`:

1. Update `package.json` to `X.Y.Z` and commit the release source, including this updater.
2. Push that source to the public `rkdrn79/aster` repository (`release` is its local Git remote).
   Push tag `vX.Y.Z` to that same remote, pointing to the release commit. A tag pushed only to
   private `origin` cannot publish the public download.
3. Watch **Actions → Aster macOS release**. When all three jobs finish, check the draft Release
   contains `Aster-mac-arm64.dmg`, `Aster-mac-arm64.zip`, `latest-mac.yml`, and `SHA256SUMS.txt`.
4. Dispatch **Aster Windows** at the same tag. Require its build, packaged smoke test, and test
   jobs to pass. Dispatch **Aster Windows release assets** with the tag and successful run ID.
   Check the same draft Release contains `Aster-windows-setup-x64.exe`, `Aster-windows-x64.zip`,
   and `SHA256SUMS-windows.txt`.
5. Prepare `rkdrn79/aster-site` so its displayed version and both platform download links point
   to this release. Verify the links against the Release assets, publish the Release, then push
   the site change and check the live page. Do not leave a platform linked to an older tag.
6. Install the DMG on a test Mac, open it, and verify that **Settings → Updates** detects the
   published version and opens its DMG. Test replacement before announcing the release.

The workflow uses GitHub's hosted runners and repository token. It needs no Apple Developer
credentials. If a release job fails, its build artifact remains in the Actions run for diagnosis;
the Release stays unpublished. Inspect failed jobs and retry only those jobs, or fix the source and
use a new commit and tag. Do not publish an incomplete draft.

## Later: automatic installation

`pnpm build:aster:mac:release` is the separate Developer ID path. With Apple Developer Program
membership, a Developer ID Application certificate, and notarization credentials, it builds the
same DMG and ZIP with an embedded update feed. That path can use Electron's in-app downloader and
installer after signing and end-to-end update testing. Until those credentials exist, keep using
the GitHub Release notice and manual app replacement.
