#!/bin/bash
# Installs annot.
# Usage: ./install.sh host                 native messaging host for Chrome + `annot` CLI on PATH
#        ./install.sh <claude|codex>      agent skill in ~/.claude or ~/.codex
#        ./install.sh <claude-work|claude-personal|codex-work|codex-personal>   same, for the author's profiles
set -euo pipefail
cd "$(dirname "$0")"
REPO="$(pwd)"

install_host() {
  # Chrome starts the host without the shell's PATH, so pin an absolute node.
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

  local dir
  case "$(uname)" in
    Darwin) dir="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts" ;;
    *)      dir="$HOME/.config/google-chrome/NativeMessagingHosts" ;;
  esac
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

  mkdir -p "$HOME/.local/bin"
  ln -sf "$REPO/bin/annot.js" "$HOME/.local/bin/annot"

  echo "Native host: $dir/com.asaeed.annot.json (node: $node, extension id: $id)"
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
