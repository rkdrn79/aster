#!/bin/zsh
set -euo pipefail

if [[ "$OSTYPE" != darwin* ]]; then
  print -u2 -- 'The Aster launcher installer runs on macOS only.'
  exit 1
fi

repo_root="${0:A:h:h:h}"
launcher_source="$repo_root/config/scripts/launch-aster-macos.sh"
app_path="${ASTER_LAUNCHER_APP_PATH:-/Applications/Aster.app}"
support_root="$HOME/Library/Application Support/Aster"
toolchain_source='/tmp/research-ade-toolchain'
toolchain_dest="$support_root/toolchain"

if [[ -e "$app_path" && ! -f "$app_path/Contents/Resources/aster-launcher-marker" ]]; then
  print -u2 -- "Refusing to replace an unrelated app: $app_path"
  exit 1
fi
if [[ ! -x "$toolchain_dest/node_modules/.bin/node" || ! -x "$toolchain_dest/node_modules/.bin/pnpm" ]]; then
  if [[ ! -x "$toolchain_source/node_modules/.bin/node" || ! -x "$toolchain_source/node_modules/.bin/pnpm" ]]; then
    print -u2 -- 'Pinned Node/pnpm toolchain is unavailable. Install it before creating the launcher.'
    exit 1
  fi
  mkdir -p "$support_root"
  /usr/bin/ditto "$toolchain_source" "$toolchain_dest"
fi

temp_root="$(mktemp -d)"
trap 'rm -rf "$temp_root"' EXIT
cat > "$temp_root/Aster.applescript" <<'APPLESCRIPT'
on run
  my startAster()
end run

on reopen
  my startAster()
end reopen

on startAster()
  set bundleRoot to POSIX path of (path to me)
  set launchScript to bundleRoot & "Contents/Resources/launch-aster-macos.sh"
  do shell script "/usr/bin/nohup /usr/bin/env ASTER_FOREGROUND_LAUNCH=1 " & quoted form of launchScript & " >/dev/null 2>&1 </dev/null &"
end startAster
APPLESCRIPT

/usr/bin/osacompile -o "$temp_root/Aster.app" "$temp_root/Aster.applescript"
resources="$temp_root/Aster.app/Contents/Resources"
cp "$launcher_source" "$resources/launch-aster-macos.sh"
cp "$repo_root/config/scripts/activate-aster-macos.js" "$resources/activate-aster-macos.js"
chmod 755 "$resources/launch-aster-macos.sh"
print -r -- "$repo_root" > "$resources/source-root"
print -r -- 'Aster local source launcher v2' > "$resources/aster-launcher-marker"

# Why: one generated source (resources/icon-source/generate-aster-icons.py) keeps launcher and app icons identical.
cp "$repo_root/resources/build/aster.icns" "$resources/Aster.icns"
plist="$temp_root/Aster.app/Contents/Info.plist"
/usr/bin/plutil -replace CFBundleIdentifier -string 'dev.aster.research-ade.launcher' "$plist"
/usr/bin/plutil -replace CFBundleName -string 'Aster' "$plist"
/usr/bin/plutil -replace CFBundleDisplayName -string 'Aster' "$plist"
/usr/bin/plutil -replace CFBundleIconFile -string 'Aster.icns' "$plist"
/usr/bin/plutil -replace LSApplicationCategoryType -string 'public.app-category.developer-tools' "$plist"
# The source launcher hands off to the Electron app; it must not add a second Dock icon.
/usr/bin/plutil -replace LSUIElement -bool YES "$plist"
/usr/bin/codesign --force --deep --sign - "$temp_root/Aster.app"

mkdir -p "${app_path:h}"
if [[ -e "$app_path" ]]; then
  backup_dir="$support_root/launcher-backups"
  mkdir -p "$backup_dir"
  backup="$backup_dir/Aster-$(date +%Y%m%d%H%M%S).app"
  mv "$app_path" "$backup"
  print -r -- "Previous Aster launcher saved at $backup"
fi
mv "$temp_root/Aster.app" "$app_path"
print -r -- "Installed $app_path"
