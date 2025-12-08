#!/usr/bin/env bash
set -euo pipefail

log()  { printf "\033[1;32m==>\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[!]\033[0m %s\n" "$*"; }
err()  { printf "\033[1;31m[✗]\033[0m %s\n" "$*" >&2; }

append_once() {
  local line="$1" file="$2"
  grep -qsF -- "$line" "$file" 2>/dev/null || echo "$line" >> "$file"
}

ensure_shell_paths() {
  local shell_profile
  if [[ -n "${ZSH_VERSION:-}" ]]; then
    shell_profile="$HOME/.zshrc"
  else
    shell_profile="$HOME/.bashrc"
  fi
  touch "$shell_profile"

  append_once 'export PATH="$HOME/.local/bin:$PATH"' "$shell_profile"
  append_once 'export PATH="/opt/homebrew/bin:$PATH"' "$shell_profile"
  append_once 'export PATH="/usr/local/bin:$PATH"' "$shell_profile"
  append_once 'export PATH="$HOME/.cargo/bin:$PATH"' "$shell_profile"

  export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$HOME/.cargo/bin:$PATH"
}

# ---------- 0) Homebrew ----------
if ! command -v brew >/dev/null 2>&1; then
  log "Устанавливаю Homebrew…"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
else
  log "Homebrew уже установлен"
fi

ensure_shell_paths

# ---------- 1) Node.js для npx ----------
if ! command -v node >/dev/null 2>&1; then
  log "Устанавливаю Node.js…"
  brew install node
else
  log "Node.js уже установлен: $(node -v)"
fi

# ---------- 2) pipx ----------
if ! command -v pipx >/dev/null 2>&1; then
  log "Ставлю pipx…"
  brew install pipx
  pipx ensurepath || true
else
  log "pipx уже установлен"
fi

ensure_shell_paths

# ---------- 3) mcp-grep-server ----------
if ! command -v mcp-grep-server >/dev/null 2>&1; then
  log "Ставлю mcp-grep…"
  pipx install mcp-grep
else
  log "mcp-grep-server уже установлен"
fi

# ---------- 4) uv (uvx) ----------
if ! command -v uvx >/dev/null 2>&1; then
  log "Ставлю uv…"
  curl -LsSf https://astral.sh/uv/install.sh | sh
else
  log "uv уже установлен: $(uvx --version)"
fi

ensure_shell_paths

# ---------- 5) ast-grep ----------
if ! command -v ast-grep >/dev/null 2>&1; then
  log "Ставлю ast-grep…"
  brew install ast-grep
else
  log "ast-grep уже установлен: $(ast-grep --version)"
fi

# ---------- 6) GitHub CLI ----------
if ! command -v gh >/dev/null 2>&1; then
  log "Ставлю GitHub CLI…"
  brew install gh
else
  log "GitHub CLI уже установлен"
fi

# ---------- 7) Создаём ~/.cursor/mcp.json ----------
CONFIG_DIR="$HOME/.cursor"
CONFIG_FILE="$CONFIG_DIR/mcp.json"
mkdir -p "$CONFIG_DIR"

timestamp=$(date +"%Y%m%d-%H%M%S")
if [[ -f "$CONFIG_FILE" ]]; then
  cp "$CONFIG_FILE" "$CONFIG_FILE.bak.$timestamp"
  warn "Сделан бэкап текущего mcp.json -> $CONFIG_FILE.bak.$timestamp"
fi

cat > "$CONFIG_FILE" <<'JSON'
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "${workspaceFolder}"]
    },
    "grep-local": {
      "command": "mcp-grep-server",
      "args": []
    },
    "grep-global": {
      "url": "https://mcp.grep.app"
    },
    "ast-grep": {
      "command": "uvx",
      "args": ["--from", "ast-grep-mcp", "ast-grep-mcp"]
    },
    "git": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/git-mcp-server"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@github/github-mcp-server"]
    }
  }
}
JSON

log "Создан конфиг: $CONFIG_FILE"

# ---------- 8) Проверка бинарей ----------
fail=0
check_cmd() {
  local cmd="$1" label="$2"
  if command -v "$cmd" >/dev/null 2>&1; then
    log "$label: $($cmd --version 2>/dev/null || echo OK)"
  else
    err "Не найден: $cmd"
    fail=1
  fi
}

log "Проверяю окружение…"
check_cmd node "Node"
check_cmd npx "npx"
check_cmd mcp-grep-server "mcp-grep-server"
check_cmd uvx "uvx"
check_cmd ast-grep "ast-grep"

if [[ $fail -eq 0 ]]; then
  log "Готово! Перезапусти Cursor."
else
  err "Есть проблемы с PATH — открой новый терминал и проверь снова."
fi
