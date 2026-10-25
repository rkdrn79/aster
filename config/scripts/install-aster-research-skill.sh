#!/bin/zsh
set -euo pipefail

# Links Aster's research skills into the user's agent skill directories.

repo_root="${0:A:h:h:h}"
harness_source="$repo_root/src/research-harness"
orchestration_source="$repo_root/skills/aster-orchestration"
tracking_source="$harness_source/track"
start_source="$harness_source/start"
loop_source="$harness_source/loop"
verify_source="$harness_source/verify"
agents_root="$HOME/.agents/skills"
claude_root="$HOME/.claude/skills"

if [[ ! -f "$harness_source/SKILL.md" || ! -f "$harness_source/cli.mjs" || ! -f "$tracking_source/SKILL.md" || ! -f "$start_source/SKILL.md" || ! -f "$loop_source/SKILL.md" || ! -f "$verify_source/SKILL.md" || ! -f "$orchestration_source/SKILL.md" ]]; then
  print -u2 -- "Missing research skill sources in $harness_source"
  exit 1
fi

link_skill() {
  local link_path="$1" target="$2"
  if [[ -e "$link_path" && ! -L "$link_path" ]]; then
    print -u2 -- "Refusing to replace a skill that is not a link: $link_path"
    exit 1
  fi
  ln -sfn "$target" "$link_path"
  print -- "Linked $link_path -> $target"
}

mkdir -p "$agents_root" "$claude_root"
for skill_name in aster-research-adopt aster-research-start aster-research-track aster-research-loop aster-research-verify aster-orchestration; do
  case "$skill_name" in
    aster-research-adopt) skill_source="$harness_source" ;;
    aster-research-track) skill_source="$tracking_source" ;;
    aster-research-start) skill_source="$start_source" ;;
    aster-research-loop) skill_source="$loop_source" ;;
    aster-research-verify) skill_source="$verify_source" ;;
    aster-orchestration) skill_source="$orchestration_source" ;;
  esac
  link_skill "$agents_root/$skill_name" "$skill_source"
  # Why relative: mirrors how `skills add` links Claude to the shared ~/.agents copy.
  link_skill "$claude_root/$skill_name" "../../.agents/skills/$skill_name"
done
