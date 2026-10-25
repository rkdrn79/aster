#!/bin/zsh
set -euo pipefail

resources_dir="${0:A:h}"
source_file="$resources_dir/source-root"
if [[ ! -r "$source_file" ]]; then
  exit 1
fi
IFS= read -r repo_root < "$source_file"
if [[ ! -f "$repo_root/package.json" || ! -d "$repo_root/node_modules" ]]; then
  exit 1
fi

support_root="$HOME/Library/Application Support/Aster"
profile="$HOME/Library/Application Support/aster-dev"
toolchain="$support_root/toolchain/node_modules/.bin"
log_dir="$HOME/Library/Logs/Aster"
mkdir -p "$profile" "$log_dir"
log_file="$log_dir/launcher.log"
if [[ -f "$log_file" && $(stat -f %z "$log_file") -gt 5242880 ]]; then
  mv "$log_file" "$log_file.previous"
fi
exec >> "$log_file" 2>&1

if [[ ! -x "$toolchain/node" || ! -x "$toolchain/pnpm" ]]; then
  print -r -- "Aster toolchain is missing. Reinstall the local launcher."
  exit 1
fi

lock_dir="$profile/aster-launcher.lock"
foreground_request="${ASTER_FOREGROUND_LAUNCH:-}"
if [[ "$foreground_request" == 1 ]]; then
  unset ORCA_BACKGROUND_LAUNCH ORCA_E2E_HEADLESS ORCA_E2E_HEADFUL
fi

stop_launcher_tree() {
  local child
  for child in $(/usr/bin/pgrep -P "$1" || true); do
    stop_launcher_tree "$child"
  done
  /bin/kill -TERM "$1" 2>/dev/null || true
}

if ! mkdir "$lock_dir" 2>/dev/null; then
  existing_pid=''
  [[ -r "$lock_dir/pid" ]] && IFS= read -r existing_pid < "$lock_dir/pid"
  if [[ "$existing_pid" == <-> ]] && kill -0 "$existing_pid" 2>/dev/null; then
    print -r -- "Aster is already running with launcher PID $existing_pid."
    for pid in $(/usr/bin/pgrep -f 'Aster.app/Contents/MacOS/Electron' || true); do
      command_line="$(/bin/ps -p "$pid" -o command= 2>/dev/null || true)"
      if [[ "$command_line" == "$repo_root/out/electron-dev/"*'/Aster.app/Contents/MacOS/Electron .'* ]]; then
        existing_mode=''
        [[ -r "$lock_dir/mode" ]] && IFS= read -r existing_mode < "$lock_dir/mode"
        if [[ "$foreground_request" == 1 ]] && {
          [[ "$existing_mode" == background ]] ||
            /bin/ps eww -p "$pid" -o command= 2>/dev/null | /usr/bin/grep -q 'ORCA_BACKGROUND_LAUNCH=1'
        }; then
          print -r -- "Restarting a background Aster instance for the desktop launcher."
          stop_launcher_tree "$existing_pid"
          for attempt in {1..50}; do
            kill -0 "$existing_pid" 2>/dev/null || break
            /bin/sleep 0.1
          done
          if kill -0 "$existing_pid" 2>/dev/null; then
            print -r -- "Could not stop the background Aster instance."
            exit 1
          fi
          break
        fi
        if [[ "${ORCA_BACKGROUND_LAUNCH:-}" != 1 ]]; then
          /usr/bin/osascript -l JavaScript "$resources_dir/activate-aster-macos.js" "$pid" || true
        fi
        exit 0
      fi
    done
    if kill -0 "$existing_pid" 2>/dev/null; then
      print -r -- "Aster is still starting with launcher PID $existing_pid."
      exit 0
    fi
  fi
  rm -rf "$lock_dir"
  mkdir "$lock_dir"
fi
print -r -- "$$" > "$lock_dir/pid"
if [[ "${ORCA_BACKGROUND_LAUNCH:-}" == 1 ]]; then
  print -r -- background > "$lock_dir/mode"
else
  print -r -- foreground > "$lock_dir/mode"
fi
trap 'rm -rf "$lock_dir"' EXIT

export PATH="$toolchain:$HOME/.local/bin:$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
export ORCA_DEV_USER_DATA_PATH="$profile"
export ORCA_DEV_DOCK_TITLE='Aster'
export ORCA_DEV_INSTANCE_LABEL='Aster Research ADE'
cd "$repo_root"
print -r -- "Starting Aster from $repo_root"
"$toolchain/pnpm" dev
