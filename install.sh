#!/bin/bash
# Installs annot.
# Usage: ./install.sh host                 native messaging host for Chromium browsers + `annot` CLI on PATH
#        ./install.sh <claude|codex>      agent skill in ~/.claude or ~/.codex
#        ./install.sh <claude-work|claude-personal|codex-work|codex-personal>   same, for the author's profiles
set -euo pipefail
cd "$(dirname "$0")"
REPO="$(pwd)"

install_host() {
  # The browser starts the host without the shell's PATH, so pin an absolute node.
  # Prefer fnm's default alias (survives version switches), else resolve whatever node is on PATH.
  local node="${ANNOT_NODE:-$HOME/.local/share/fnm/aliases/default/bin/node}"
  [ -x "$node" ] || node="$(realpath "$(command -v node)")"

  printf '#!/bin/sh\nexec "%s" "%s/bin/annot.js" "$@"\n' "$node" "$REPO" > bin/annot-host
  chmod +x bin/annot-host bin/annot.js

  local id
  id="$(node -e '
    const key = require("./extension/manifest.json").key;
    const hex = require("crypto").createHash("sha256").update(Buffer.from(key, "base64")).digest("hex").slice(0, 32);
    console.log([...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join(""));')"

  # Each Chromium browser reads host manifests from its own folder: Chrome's always, the others' when
  # that browser is installed. (Brave on macOS also reads Chrome's.)
  local base dir browsers hosts=()
  case "$(uname)" in
    Darwin) base="$HOME/Library/Application Support"; browsers=("Google/Chrome" "BraveSoftware/Brave-Browser" "Microsoft Edge" "Chromium") ;;
    *)      base="$HOME/.config"; browsers=("google-chrome" "BraveSoftware/Brave-Browser" "microsoft-edge" "chromium") ;;
  esac
  for b in "${browsers[@]}"; do
    [ "$b" = "${browsers[0]}" ] || [ -d "$base/$b" ] || continue
    dir="$base/$b/NativeMessagingHosts"
    mkdir -p "$dir"
    cat > "$dir/com.asaeed.annot.json" <<EOF
{
  "name": "com.asaeed.annot",
  "description": "annot mark store",
  "path": "$REPO/bin/annot-host",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$id/"]
}
EOF
    hosts+=("$dir/com.asaeed.annot.json")
  done

  mkdir -p "$HOME/.local/bin"
  ln -sf "$REPO/bin/annot.js" "$HOME/.local/bin/annot"

  echo "Native host (node: $node, extension id: $id):"
  printf '  %s\n' "${hosts[@]}"
  echo "CLI: $HOME/.local/bin/annot"
  case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) echo "Note: add ~/.local/bin to PATH" ;; esac
}

case "${1:-}" in
  host)            install_host; exit ;;
  claude-work)     DEST="$HOME/.claude-work/skills/annot/SKILL.md" ;;
  claude|claude-personal) DEST="$HOME/.claude/skills/annot/SKILL.md" ;;
  codex-work)      DEST="$HOME/.codex-work/skills/annot/SKILL.md" ;;
  codex|codex-personal)   DEST="$HOME/.codex/skills/annot/SKILL.md" ;;
  *) echo "Usage: $0 <host|claude|codex>" >&2; exit 2 ;;
esac

mkdir -p "$(dirname "$DEST")"
cp skill.md "$DEST"
echo "Installed to $DEST"
