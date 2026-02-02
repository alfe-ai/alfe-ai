#!/usr/bin/env bash
set -euo pipefail

# run_codex.sh — run Agent CLI non-interactive & suppress dconf warnings
# Resolves Agent from a fixed install dir, but lets you run it *in* another project dir.
#
# Usage:
#   ./run_codex.sh [--project-dir DIR | -C DIR] "task description"
#
# Env overrides:
#   CODEX_DIR   : where Agent is installed (default below)
#   PROJECT_DIR : directory to run the CLI in (same as --project-dir)
#   CODEX_MODEL : default model to use (fallback: first model in data/config/model_only_models.json)

CODEX_DIR_DEFAULT='/git/codex'
CODEX_DIR="${CODEX_DIR:-$CODEX_DIR_DEFAULT}"
CODEX_DIR_53="${CODEX_DIR_53:-}"
PROJECT_DIR="${PROJECT_DIR:-}"
CODEX_MODEL_DEFAULT_FALLBACK='openrouter/openai/gpt-5-mini'
CODEX_MODEL_DEFAULT=''
MODEL=""
CODEX_SNAPSHOT_MARKER='::CODEX_RUNNER_PROJECT_DIR::'
CODEX_API_KEY_VARS=("OPENAI_API_KEY" "OPENROUTER_API_KEY")
REQUESTED_PROVIDER=""
DETECTED_API_KEY_VAR=""
CODEX_SHOW_META="${CODEX_SHOW_META:-0}"
SHOW_QWEN_CLI_ARGS="${SHOW_QWEN_CLI_ARGS:-false}"
ENABLE_TRACE="${ENABLE_TRACE:-}"
OPENROUTER_HTTP_REFERER_OVERRIDE=""
OPENROUTER_TITLE_OVERRIDE=""
ALFECODE_VM_HOST="${ALFECODE_VM_HOST:-127.0.0.1}"
ALFECODE_VM_SSH_PORT="${ALFECODE_VM_SSH_PORT:-}"
ALFECODE_VM_USER="${ALFECODE_VM_USER:-root}"
USE_QWEN_CLI=false
QWEN_ARGS=()
QWEN_MODEL=""

escape_config_value() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//"/\\"}"
  printf '%s' "$value"
}

should_trace() {
  case "${ENABLE_TRACE,,}" in
    1|true|yes|on) return 0 ;;
  esac
  return 1
}

trace_log() {
  if should_trace; then
    printf "[trace] %s\n" "$1" >&2
  fi
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STERLING_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
GLOBAL_TASK_COUNTER_CLI="${GLOBAL_TASK_COUNTER_CLI:-${STERLING_ROOT}/executable/globalTaskCounter.js}"

resolve_model_only_default() {
  local config_path="${STERLING_ROOT}/data/config/model_only_models.json"
  local resolved_path=""

  if [[ -f "$config_path" ]]; then
    resolved_path="$config_path"
  fi

  if [[ -z "$resolved_path" ]]; then
    return 1
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 - "$resolved_path" <<'PY'
import json
import os
import sys

path = sys.argv[1]
def trace(message):
    if os.getenv("ENABLE_TRACE", "").lower() not in ("1", "true", "yes", "on"):
        return
    print(f"[trace] model-only default: {message}", file=sys.stderr)

trace(f"loading model list from {path}")
try:
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
except Exception:
    trace("failed to parse JSON model list")
    sys.exit(1)

if isinstance(data, dict):
    models = data.get("models", data)
elif isinstance(data, list):
    models = data
else:
    trace(f"unexpected JSON root type: {type(data).__name__}")
    sys.exit(1)

if isinstance(models, dict):
    models = list(models.values())

if not isinstance(models, list):
    trace(f"unexpected models type: {type(models).__name__}")
    sys.exit(1)

entries = []
for idx, model in enumerate(models):
    if isinstance(model, str):
        model = {"id": model}
    if not isinstance(model, dict):
        continue
    model_id = model.get("id")
    if not isinstance(model_id, str):
        continue
    list_order = model.get("list_order")
    if not isinstance(list_order, (int, float)):
        list_order = None
    entries.append((list_order, idx, model_id.strip()))

if not entries:
    trace("no valid model ids found in JSON")
    sys.exit(1)

entries.sort(key=lambda item: (item[0] is None, item[0] if item[0] is not None else 0, item[1]))
trace("sorted model entries (list_order, index, id):")
for list_order, idx, model_id in entries:
    trace(f"  - list_order={list_order} index={idx} id={model_id}")
trace(f"selected model from index {entries[0][1]} -> {entries[0][2]}")
print(entries[0][2])
PY
    return $?
  fi

  return 1
}

resolve_model_only_url() {
  local config_path="${STERLING_ROOT}/data/config/model_only_models.json"
  local resolved_path=""

  if [[ -f "$config_path" ]]; then
    resolved_path="$config_path"
  fi

  if [[ -z "$resolved_path" ]]; then
    return 1
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 - "$resolved_path" "$@" <<'PY'
import json
import os
import sys

path = sys.argv[1]
candidates = [c for c in sys.argv[2:] if c]
def trace(message):
    if os.getenv("ENABLE_TRACE", "").lower() not in ("1", "true", "yes", "on"):
        return
    print(f"[trace] model-only url: {message}", file=sys.stderr)

trace(f"loading model list from {path}")
try:
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
except Exception:
    trace("failed to parse JSON model list")
    sys.exit(1)

if isinstance(data, dict):
    models = data.get("models", data)
elif isinstance(data, list):
    models = data
else:
    trace(f"unexpected JSON root type: {type(data).__name__}")
    sys.exit(1)

if isinstance(models, dict):
    models = list(models.values())

if not isinstance(models, list):
    trace(f"unexpected models type: {type(models).__name__}")
    sys.exit(1)

if not candidates:
    trace("no candidate model ids provided")
    sys.exit(1)

for candidate in candidates:
    for model in models:
        if isinstance(model, str):
            continue
        if not isinstance(model, dict):
            continue
        model_id = model.get("id")
        if model_id != candidate:
            continue
        url = model.get("url")
        if isinstance(url, str) and url.strip():
            trace(f"matched model {candidate} with url {url}")
            print(url.strip())
            sys.exit(0)

trace("no matching model url found")
sys.exit(1)
PY
    return $?
  fi

  return 1
}

if CODEX_MODEL_DEFAULT="$(resolve_model_only_default)"; then
  CODEX_MODEL_DEFAULT="${CODEX_MODEL_DEFAULT:-$CODEX_MODEL_DEFAULT_FALLBACK}"
else
  CODEX_MODEL_DEFAULT="$CODEX_MODEL_DEFAULT_FALLBACK"
fi
trace_log "model-only default resolved to ${CODEX_MODEL_DEFAULT} (fallback=${CODEX_MODEL_DEFAULT_FALLBACK})"

MODEL="${MODEL:-${CODEX_MODEL:-$CODEX_MODEL_DEFAULT}}"

meta_line_text() {
  printf '[meta] %s' "$1"
}

should_show_meta() {
  case "${CODEX_SHOW_META,,}" in
    1|true|yes|on) return 0 ;;
  esac
  return 1
}

log_meta() {
  if should_show_meta; then
    printf '%s\n' "$(meta_line_text "$1")" >&2
  fi
}

should_use_vm() {
  [[ -n "${ALFECODE_VM_SSH_PORT:-}" ]]
}

probe_port() {
  local host="$1"
  local port="$2"

  if command -v nc >/dev/null 2>&1; then
    nc -z -w 2 "$host" "$port" >/dev/null 2>&1
    return $?
  fi

  if command -v timeout >/dev/null 2>&1; then
    timeout 2 bash -c "cat < /dev/null > /dev/tcp/${host}/${port}" >/dev/null 2>&1
    return $?
  fi

  bash -c "cat < /dev/null > /dev/tcp/${host}/${port}" >/dev/null 2>&1
}

wait_for_port() {
  local host="$1"
  local port="$2"
  local max_wait="${3:-60}"
  local interval="${4:-2}"
  local elapsed=0

  while (( elapsed < max_wait )); do
    if probe_port "$host" "$port"; then
      return 0
    fi
    sleep "$interval"
    elapsed=$((elapsed + interval))
  done

  return 1
}

escape_shell_arg() {
  printf '%q' "$1"
}

build_shell_command() {
  local output=""
  local arg
  for arg in "$@"; do
    if [[ -z "$output" ]]; then
      output="$(escape_shell_arg "$arg")"
    else
      output+=" $(escape_shell_arg "$arg")"
    fi
  done
  printf '%s' "$output"
}

log_meta "Agent runner context: user=$(id -un 2>/dev/null || whoami) (uid=$(id -u 2>/dev/null || echo "?") gid=$(id -g 2>/dev/null || echo "?")) pwd=$(pwd)"

META_OPENROUTER_UNSET_MSG='OPENAI_API_KEY unset for this run to ensure OpenRouter provider usage.'
OPENROUTER_UNSET_NOTICE="$(meta_line_text "$META_OPENROUTER_UNSET_MSG")"

usage() {
  cat <<USAGE
Usage: ./run_codex.sh [--project-dir DIR | -C DIR] [--model MODEL] [--openrouter-referer URL] [--openrouter-title TITLE] "<task-description>"

This wrapper resolves the Agent binary from:
  npm exec --prefix "\$CODEX_DIR" codex …

Default CODEX_DIR: $CODEX_DIR_DEFAULT
Override with: export CODEX_DIR=/path/to/codex

Use --project-dir (or -C) to run Agent *from* a different project directory
without changing your current shell's cwd.

Use --model (or set CODEX_MODEL/MODEL env vars) to pick a specific OpenAI model.
Use --openrouter-referer/--openrouter-title to override the HTTP headers used when contacting OpenRouter.
Default: first model in data/config/model_only_models.json (fallback: openrouter/openai/gpt-5-mini).

Use --qwen-cli to run qwen directly instead of the Agent CLI.
Use --qwen-model to supply a qwen model id when running with --qwen-cli.

If no task is provided, an interactive Agent session is started.

This script now always loads OPENAI_API_KEY or OPENROUTER_API_KEY from the nearest .env (project dir → cwd → script dir).
--model MODEL  : OpenAI/OpenRouter model ID to pass to Agent (ex: openrouter/openai/gpt-5-mini, openai/gpt-4o-mini).
USAGE
}

load_env_file() {
  local dir="$1"
  while [[ "$dir" != "/" ]]; do
    if [[ -f "$dir/.env" ]]; then
      echo "$dir/.env"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

load_qwen_env() {
  local env_path=""
  if env_path="$(load_env_file "$STERLING_ROOT")"; then
    set -a
    # shellcheck disable=SC1090
    source "$env_path"
    set +a
    log_meta "Loaded Qwen CLI env vars from $env_path"
  fi
}

infer_codex_provider() {
  local model="$1"
  if [[ "$model" == openrouter/* ]]; then
    echo "openrouter"
  else
    echo "openai"
  fi
}

resolve_codex_api_key_var() {
  local search_order=("${CODEX_API_KEY_VARS[@]}")
  if [[ "$REQUESTED_PROVIDER" == "openrouter" ]]; then
    search_order=("OPENROUTER_API_KEY")
  fi

  local var_name
  for var_name in "${search_order[@]}"; do
    if [[ -n "${!var_name:-}" ]]; then
      DETECTED_API_KEY_VAR="$var_name"
      return 0
    fi
  done

  DETECTED_API_KEY_VAR=""
  return 1
}

ensure_codex_api_key() {
  local failure_message="$1"

  if resolve_codex_api_key_var; then
    log_meta "Using ${DETECTED_API_KEY_VAR} from existing environment."
    return 0
  fi

  local env_path=""
  local search_dirs=()

  if [[ -n "${PROJECT_DIR:-}" ]]; then
    local project_dir_abs
    if project_dir_abs="$(cd "$PROJECT_DIR" 2>/dev/null && pwd)"; then
      search_dirs+=("$project_dir_abs")
    fi
  fi

  search_dirs+=("$(pwd)" "$SCRIPT_DIR")

  local dir
  for dir in "${search_dirs[@]}"; do
    if env_path="$(load_env_file "$dir")"; then
      set -a
      # shellcheck disable=SC1090
      source "$env_path"
      set +a
      if resolve_codex_api_key_var; then
        log_meta "Loaded ${DETECTED_API_KEY_VAR} from $env_path"
        return 0
      fi
    fi
  done

  if [[ -n "$failure_message" ]]; then
    echo "$failure_message" >&2
  fi
  return 1
}

API_KEY_MODE=true

# Parse flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-key-mode)
      log_meta "--api-key-mode flag detected; API key mode is now always enabled by default."
      shift ;;
    --no-api-key-mode)
      echo "Error: --no-api-key-mode is no longer supported; Agent runs always require OPENAI_API_KEY." >&2
      exit 1 ;;
    --project-dir|-C)
      [[ $# -ge 2 ]] || { echo "Error: --project-dir requires a path" >&2; exit 1; }
      PROJECT_DIR="$2"; shift 2 ;;
    --model)
      [[ $# -ge 2 ]] || { echo "Error: --model requires a model id" >&2; exit 1; }
      MODEL="$2"; shift 2 ;;
    --openrouter-referer)
      [[ $# -ge 2 ]] || { echo "Error: --openrouter-referer requires a URL" >&2; exit 1; }
      OPENROUTER_HTTP_REFERER_OVERRIDE="$2"; shift 2 ;;
    --openrouter-title)
      [[ $# -ge 2 ]] || { echo "Error: --openrouter-title requires a title" >&2; exit 1; }
      OPENROUTER_TITLE_OVERRIDE="$2"; shift 2 ;;
    --qwen-cli)
      USE_QWEN_CLI=true; shift ;;
    --qwen-model)
      [[ $# -ge 2 ]] || { echo "Error: --qwen-model requires a model id" >&2; exit 1; }
      QWEN_MODEL="$2"; shift 2 ;;
    --help|-h)
      usage; exit 0 ;;
    --) shift; break ;;
    -*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1 ;;
    *)
      break ;;
  esac
done

TASK="$*"

MODEL="${MODEL:-$CODEX_MODEL_DEFAULT}"
if ! $USE_QWEN_CLI; then
  REQUESTED_PROVIDER="$(infer_codex_provider "$MODEL")"
fi

if ! $USE_QWEN_CLI; then
  if [[ "$MODEL" == openai/* || "$MODEL" == openrouter/openai/* ]]; then
    if [[ -n "$CODEX_DIR_53" && "$MODEL" != *"openai/gpt-oss-"* ]]; then
      CODEX_DIR="$CODEX_DIR_53"
    fi
  fi

  # Basic validations
  if [[ ! -d "$CODEX_DIR" ]]; then
    echo "Error: CODEX_DIR does not exist: $CODEX_DIR" >&2
    exit 1
  fi
fi

EFFECTIVE_MODEL="$MODEL"
if [[ "$REQUESTED_PROVIDER" == "openrouter" ]]; then
  EFFECTIVE_MODEL="${EFFECTIVE_MODEL#openrouter/}"
fi

MODEL_ARGS=()
CONFIG_ARGS=()
if ! $USE_QWEN_CLI && [[ -n "$EFFECTIVE_MODEL" ]]; then
  MODEL_ARGS=(--model "$EFFECTIVE_MODEL")
fi

MODEL_BASE_URL=""
if MODEL_BASE_URL="$(resolve_model_only_url "${QWEN_MODEL:-}" "${MODEL:-}" "${EFFECTIVE_MODEL:-}")"; then
  trace_log "model-only url resolved to ${MODEL_BASE_URL}"
else
  MODEL_BASE_URL=""
fi

if ! $USE_QWEN_CLI && [[ "$REQUESTED_PROVIDER" == "openrouter" ]]; then
  raw_referer_override="${OPENROUTER_HTTP_REFERER_OVERRIDE:-${OPENROUTER_HTTP_REFERER:-${HTTP_REFERER:-}}}"
  if [[ -n "${raw_referer_override}" ]]; then
    referer_value_base="${raw_referer_override}"
  else
    session_hash="${SESSION_ID:-${SESSION:-${SESSIONID:-code-s}}}"
    referer_value_base="https://${session_hash}"
  fi
  base_title_value="${OPENROUTER_TITLE_OVERRIDE:-${OPENROUTER_APP_TITLE:-${X_TITLE:-Agent via OpenRouter}}}"
  title_value="$base_title_value"

  referer_effective="$referer_value_base"
  global_task_meta=""
  global_task_id=""
  if command -v node >/dev/null 2>&1 && [[ -f "$GLOBAL_TASK_COUNTER_CLI" ]]; then
    if task_info_output="$(node "$GLOBAL_TASK_COUNTER_CLI" next-info "$base_title_value" 2>/dev/null)"; then
      if [[ "$task_info_output" == *$'\t'* ]]; then
        global_task_id="${task_info_output%%$'\t'*}"
        appended_title="${task_info_output#*$'\t'}"
      else
        appended_title="$task_info_output"
        global_task_id=""
      fi
      if [[ -n "$appended_title" ]]; then
        title_value="$appended_title"
      fi
      if [[ -n "$global_task_id" ]]; then
        if [[ -n "${raw_referer_override}" ]]; then
          referer_effective="${referer_value_base}${global_task_id}"
        else
          referer_effective="${referer_value_base}.${global_task_id}.alfe.sh"
        fi
        global_task_meta=" [global task id ${global_task_id} appended]"
      else
        global_task_meta=" [global task id missing]"
      fi
    else
      global_task_meta=" [global task counter error]"
    fi
  else
    global_task_meta=" [global task counter unavailable]"
  fi
  referer_value="$referer_effective"
  referer_config=$(escape_config_value "$referer_value")
  title_config=$(escape_config_value "$title_value")
  CONFIG_ARGS=(
    -c 'model_providers.openrouter.name="OpenRouter"'
    -c 'model_providers.openrouter.base_url="https://openrouter.ai/api/v1"'
    -c 'model_providers.openrouter.env_key="OPENROUTER_API_KEY"'
    -c 'model_providers.openrouter.wire_api="chat"'
    -c "model_providers.openrouter.http_headers={ HTTP-Referer = \"${referer_config}\", X-Title = \"${title_config}\" }"
    -c 'model_provider="openrouter"'
  )
  log_meta "OpenRouter HTTP headers override: Referer=${referer_value}, X-Title=${title_value}${global_task_meta}"
fi

# Optionally load API key
if $API_KEY_MODE && ! $USE_QWEN_CLI; then
  if [[ "$REQUESTED_PROVIDER" == "openrouter" ]]; then
    failure_message="Error: Agent runs for OpenRouter models require OPENROUTER_API_KEY. Export one or place it in a nearby .env file."
  else
    failure_message="Error: Agent runs require OPENAI_API_KEY or OPENROUTER_API_KEY. Export one or place it in a nearby .env file."
  fi
  if ! ensure_codex_api_key "$failure_message"; then
    exit 1
  fi
fi

# Runner that resolves codex from CODEX_DIR (handles spaces)
run_codex() {
  {
    trace_log "run_codex(): start $(date -Is)"
    trace_log "run_codex(): invoked with $# args -> $*"
    trace_log "run_codex(): launching Agent via npm exec..."
  } >&2
  # npx lacks a stable --prefix; use npm exec with --prefix to target the install. :contentReference[oaicite:2]{index=2}
  local -a cmd=(npm exec --prefix "$CODEX_DIR" codex -- "$@")
  local unset_openai=false
  if command -v stdbuf >/dev/null 2>&1; then
    cmd=(stdbuf -o0 -e0 "${cmd[@]}")
  fi
  if [[ "$REQUESTED_PROVIDER" == "openrouter" && "$DETECTED_API_KEY_VAR" == "OPENROUTER_API_KEY" ]]; then
    unset_openai=true
  fi
  local -a env_prefix=()
  if $unset_openai; then
    env_prefix+=(-u OPENAI_API_KEY)
  fi
  if [[ -n "${MODEL_BASE_URL:-}" ]]; then
    env_prefix+=("OPENAI_BASE_URL=${MODEL_BASE_URL}")
  fi
  if [[ ${#env_prefix[@]} -gt 0 ]]; then
    cmd=(env "${env_prefix[@]}" "${cmd[@]}")
  fi
  if $unset_openai; then
    log_meta "$META_OPENROUTER_UNSET_MSG"
  fi
  "${cmd[@]}"
}

run_qwen() {
  load_qwen_env
  local openai_api_key_value="${OPENAI_API_KEY:-}"
  local openai_base_url_value="${OPENAI_BASE_URL:-}"
  if [[ -n "${MODEL_BASE_URL:-}" ]]; then
    openai_base_url_value="${MODEL_BASE_URL}"
  fi
  local openai_model_value="${EFFECTIVE_MODEL:-}"
  if [[ -n "${QWEN_MODEL:-}" ]]; then
    openai_model_value="$QWEN_MODEL"
  fi
  local strip_free_suffix
  strip_free_suffix() {
    local value="$1"
    printf '%s' "${value%:free}"
  }
  local display_openai_model_value
  display_openai_model_value="$(strip_free_suffix "$openai_model_value")"
  local display_qwen_model_value=""
  if [[ -n "${QWEN_MODEL:-}" ]]; then
    display_qwen_model_value="$(strip_free_suffix "$QWEN_MODEL")"
  fi
  local -a cmd=(qwen "$@")
  local -a display_cmd=("${cmd[@]}")
  if command -v stdbuf >/dev/null 2>&1; then
    cmd=(stdbuf -o0 -e0 "${cmd[@]}")
  fi
  cmd=(
    env
    "OPENAI_API_KEY=${openai_api_key_value}"
    "OPENAI_BASE_URL=${openai_base_url_value}"
    "OPENAI_MODEL=${openai_model_value}"
    "${cmd[@]}"
  )
  if command -v script >/dev/null 2>&1; then
    local cmd_string
    cmd_string="$(build_shell_command "${cmd[@]}")"
    cmd=(script -q -c "$cmd_string" /dev/null)
  else
    display_cmd=("${cmd[@]}")
  fi
  local -a display_args=()
  local expects_model_arg=false
  local model_value=""
  for arg in "${display_cmd[@]}"; do
    if $expects_model_arg; then
      arg="$(strip_free_suffix "$arg")"
      expects_model_arg=false
    elif [[ "$arg" == "-m" || "$arg" == "--model" ]]; then
      expects_model_arg=true
    elif [[ "$arg" == OPENAI_MODEL=* ]]; then
      model_value="${arg#OPENAI_MODEL=}"
      arg="OPENAI_MODEL=$(strip_free_suffix "$model_value")"
    fi
    display_args+=("$arg")
  done
  printf '[qwen] Launching qwen CLI...\n'
  local qwen_version
  qwen_version="$(qwen -v 2>&1)"
  printf '[qwen] qwen -v: %s\n' "$qwen_version"
  printf '[qwen] cwd=%s\n' "$(pwd)"
  if [[ "${SHOW_QWEN_CLI_ARGS:-false}" == "true" ]]; then
    printf '[qwen] args=%s\n' "$(build_shell_command "${display_args[@]}")"
  fi
  #printf '[qwen] env OPENAI_API_KEY=%s\n' "$openai_api_key_value"
  printf '[qwen] env OPENAI_BASE_URL=%s\n' "$openai_base_url_value"
  printf '[qwen] env OPENAI_MODEL=%s\n' "$display_openai_model_value"
  if [[ -n "${QWEN_MODEL:-}" ]]; then
    printf '[qwen] model=%s\n' "$display_qwen_model_value"
  fi
  printf '[qwen] meta=%s\n' "${CODEX_SHOW_META:-0}"
  "${cmd[@]}" 2>&1
}

run_codex_in_vm() {
  local source_dir="$1"
  shift

  if ! should_use_vm; then
    run_codex "$@"
    return $?
  fi

  if [[ ! -d "$source_dir" ]]; then
    echo "Error: VM source directory not found: $source_dir" >&2
    return 2
  fi

  if ! command -v ssh >/dev/null 2>&1; then
    echo "Error: ssh not available; cannot run Agent in VM." >&2
    return 1
  fi

  if ! command -v tar >/dev/null 2>&1; then
    echo "Error: tar not available; cannot stage project for VM run." >&2
    return 1
  fi

  local remote_dir="/tmp/alfecode-run-$(date +%s)-${RANDOM}"
  local -a ssh_args=(
    -o StrictHostKeyChecking=no
    -o UserKnownHostsFile=/dev/null
    -o BatchMode=yes
    -o ConnectTimeout=10
    -o ConnectionAttempts=1
    -p "${ALFECODE_VM_SSH_PORT}"
  )

  log_meta "Waiting for VM SSH to accept connections at ${ALFECODE_VM_HOST}:${ALFECODE_VM_SSH_PORT}"
  if ! wait_for_port "${ALFECODE_VM_HOST}" "${ALFECODE_VM_SSH_PORT}" 90 2; then
    echo "Error: VM SSH did not become ready at ${ALFECODE_VM_HOST}:${ALFECODE_VM_SSH_PORT}." >&2
    return 1
  fi

  log_meta "Syncing project to VM at ${ALFECODE_VM_HOST}:${ALFECODE_VM_SSH_PORT} -> ${remote_dir}"
  tar -C "$source_dir" -cf - . \
    | ssh "${ssh_args[@]}" "${ALFECODE_VM_USER}@${ALFECODE_VM_HOST}" "mkdir -p $(escape_shell_arg "$remote_dir") && tar -C $(escape_shell_arg "$remote_dir") -xf -"

  local -a remote_env=( "CODEX_DIR=${CODEX_DIR}" "CODEX_SHOW_META=${CODEX_SHOW_META}" "SHOW_QWEN_CLI_ARGS=${SHOW_QWEN_CLI_ARGS}" )
  if [[ -n "${OPENAI_API_KEY:-}" ]]; then
    remote_env+=( "OPENAI_API_KEY=${OPENAI_API_KEY}" )
  fi
  if [[ -n "${OPENROUTER_API_KEY:-}" ]]; then
    remote_env+=( "OPENROUTER_API_KEY=${OPENROUTER_API_KEY}" )
  fi
  if [[ -n "${MODEL:-}" ]]; then
    remote_env+=( "MODEL=${MODEL}" )
  fi
  if [[ -n "${MODEL_BASE_URL:-}" ]]; then
    remote_env+=( "OPENAI_BASE_URL=${MODEL_BASE_URL}" )
  fi

  local -a remote_exec=(npm exec --prefix "$CODEX_DIR" codex -- "$@")
  local -a remote_cmd=(env)
  if [[ "$REQUESTED_PROVIDER" == "openrouter" && "$DETECTED_API_KEY_VAR" == "OPENROUTER_API_KEY" ]]; then
    remote_cmd+=(-u OPENAI_API_KEY)
  fi
  remote_cmd+=("${remote_env[@]}" "${remote_exec[@]}")

  local remote_command
  remote_command="$(build_shell_command "${remote_cmd[@]}")"

  log_meta "Launching Agent in VM (remote dir: ${remote_dir})"
  ssh "${ssh_args[@]}" "${ALFECODE_VM_USER}@${ALFECODE_VM_HOST}" \
    "cd $(escape_shell_arg "$remote_dir") && ${remote_command}"
}

maybe_git_pull() {
  local dir="$1"

  if [[ -z "$dir" ]]; then
    dir="$(pwd)"
  fi

  if [[ ! -d "$dir" ]]; then
    return 0
  fi

  if ! command -v git >/dev/null 2>&1; then
    return 0
  fi

  if git -C "$dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    log_meta "Updating git repository at $dir before Agent run."
    if ! git -C "$dir" pull --ff-only; then
      echo "Warning: git pull failed in $dir. Continuing without updated changes." >&2
    fi
  fi
}

sanitize_branch_component() {
  local component="$1"
  # Replace any disallowed characters with dashes to keep the branch name valid.
  component="${component//[^A-Za-z0-9._-]/-}"
  # Trim leading or trailing dashes or dots which git treats specially.
  component="${component##[-.]*}"
  component="${component%%[-.]*}"
  if [[ -z "$component" ]]; then
    component="run"
  fi
  printf '%s' "$component"
}

# Execute either in current dir or a provided project dir (via subshell)
run_here_or_in_project() {
  if [[ -n "${PROJECT_DIR}" ]]; then
    if [[ ! -d "$PROJECT_DIR" ]]; then
      echo "Error: project directory not found: $PROJECT_DIR" >&2
      return 2
    fi
    maybe_git_pull "$PROJECT_DIR"
    # Before running, create a copy of the current repository and create a
    # git branch for this run. The copy path uses the millisecond timestamp
    # so each run snapshot is unique.
    local repo_root=""
    if command -v git >/dev/null 2>&1; then
      repo_root="$(git -C "$PROJECT_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
    fi
    if [[ -z "$repo_root" ]]; then
      repo_root="$PROJECT_DIR"
    fi

    local py_bin
    if command -v python3 >/dev/null 2>&1; then
      py_bin="python3"
    elif command -v python >/dev/null 2>&1; then
      py_bin="python"
    else
      echo "Error: Python interpreter not found; cannot create snapshot timestamp." >&2
      return 1
    fi

    local ts_ms
    ts_ms=$("$py_bin" - <<'PY2'
import time
print(int(time.time()*1000))
PY2
)

    local snapshot_dir
    snapshot_dir="${repo_root%/}-${ts_ms}"
    if [[ ! -d "$snapshot_dir" ]]; then
      log_meta "Creating project snapshot at $snapshot_dir"
      mkdir -p "${snapshot_dir%/*}"
      cp -a "$repo_root" "$snapshot_dir"
    else
      log_meta "Snapshot dir already exists: $snapshot_dir"
    fi

    printf '__STERLING_SNAPSHOT_DIR__=%s\n' "$snapshot_dir"

    # Determine a run number via the global task counter (if available) and
    # create a branch name under /alfe/<run#>. If the counter isn't
    # available, fall back to a timestamp-based branch name.
    local run_id
    if command -v node >/dev/null 2>&1 && [[ -f "$GLOBAL_TASK_COUNTER_CLI" ]]; then
      run_id="$(node "$GLOBAL_TASK_COUNTER_CLI" next-id 2>/dev/null || true)"
    fi
    local branch_suffix_raw
    if [[ -n "$run_id" ]]; then
      branch_suffix_raw="$run_id"
    else
      branch_suffix_raw="$ts_ms"
    fi
    local branch_suffix
    branch_suffix="$(sanitize_branch_component "$branch_suffix_raw")"
    if [[ -z "$branch_suffix" ]]; then
      branch_suffix="$(sanitize_branch_component "$ts_ms")"
    fi
    local branch_name
    branch_name="alfe/${branch_suffix}"

    # If the snapshot is a git repo, create and checkout the branch there.
    if [[ -d "$snapshot_dir/.git" ]]; then
      local starting_branch
      starting_branch="$(git -C "$snapshot_dir" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
      if [[ -z "$starting_branch" || "$starting_branch" == "HEAD" ]]; then
        starting_branch=""
      fi

      log_meta "Creating git branch '$branch_name' in snapshot"
      git -C "$snapshot_dir" checkout -b "$branch_name" || true

      if [[ -n "$starting_branch" && "$starting_branch" != "$branch_name" ]]; then
        if git -C "$snapshot_dir" config branch."$branch_name".sterlingParent "$starting_branch" 2>/dev/null; then
          log_meta "Recorded '$starting_branch' as parent for '$branch_name'"
        else
          log_meta "Warning: unable to record '$starting_branch' as parent for '$branch_name'"
        fi
      fi
    else
      log_meta "Snapshot is not a git repository; skipping branch creation"
    fi

    log_meta "Agent run will execute in snapshot directory: $snapshot_dir"
    printf '%s%s\n' "$CODEX_SNAPSHOT_MARKER" "$snapshot_dir"

    (
      export CODEX_ORIGINAL_PROJECT_DIR="$PROJECT_DIR"
      export CODEX_EFFECTIVE_PROJECT_DIR="$snapshot_dir"
      export PROJECT_DIR="$snapshot_dir"
      if $USE_QWEN_CLI; then
        if should_use_vm; then
          log_meta "Qwen CLI run requested; VM mode ignored."
        fi
        cd "$snapshot_dir" && run_qwen "${QWEN_ARGS[@]}"
      else
        if should_use_vm; then
          run_codex_in_vm "$snapshot_dir" "$@"
        else
          cd "$snapshot_dir" && run_codex "$@"
        fi
      fi
    )
  else
    maybe_git_pull "$(pwd)"
    if $USE_QWEN_CLI; then
      if should_use_vm; then
        log_meta "Qwen CLI run requested; VM mode ignored."
      fi
      run_qwen "${QWEN_ARGS[@]}"
    else
      if should_use_vm; then
        run_codex_in_vm "$(pwd)" "$@"
      else
        run_codex "$@"
      fi
    fi
  fi
}


stream_filtered_stdout() {
  local should_filter_openrouter="$1"

  if [[ "$should_filter_openrouter" == "1" ]]; then
    if should_show_meta; then
      awk -v notice="$OPENROUTER_UNSET_NOTICE" 'index($0, notice) == 0'
    else
      awk -v notice="$OPENROUTER_UNSET_NOTICE" 'index($0, notice) == 0 && index($0, "[meta]") == 0'
    fi
    return 0
  fi

  if should_show_meta; then
    cat
  else
    awk 'index($0, "[meta]") == 0'
  fi
}

run_with_filtered_streams() {
  local status
  local filter_openrouter=0
  if [[ "$REQUESTED_PROVIDER" == "openrouter" ]]; then
    filter_openrouter=1
  fi

  if $USE_QWEN_CLI; then
    run_here_or_in_project "$@" \
      2> >(grep --line-buffered -v "dconf-CRITICAL" >&2)
    return ${PIPESTATUS[0]:-$?}
  fi

  if run_here_or_in_project "$@" \
      > >(stream_filtered_stdout "$filter_openrouter") \
      2> >(grep --line-buffered -v "dconf-CRITICAL" >&2); then
    status=0
  else
    status=$?
  fi

  return $status
}

run_with_filtered_stderr() {
  run_here_or_in_project "$@" \
    2> >(grep --line-buffered -v "dconf-CRITICAL" >&2)
  return ${PIPESTATUS[0]:-$?}
}

if $USE_QWEN_CLI; then
  if ! command -v qwen >/dev/null 2>&1; then
    echo "Error: qwen CLI not found on PATH." >&2
    exit 1
  fi
  if [[ -z "$TASK" ]]; then
    echo "Error: qwen CLI runs require a task prompt." >&2
    usage
    exit 1
  fi
  QWEN_ARGS=(-p "$TASK" -y)
  if [[ -n "$QWEN_MODEL" ]]; then
    QWEN_ARGS=(-m "$QWEN_MODEL" "${QWEN_ARGS[@]}")
  fi
fi

if [[ -z "$TASK" ]] && ! $USE_QWEN_CLI; then
  usage
  echo "Starting interactive Agent session..."
  log_meta "Using Agent model: $MODEL"
  # Interactive
  run_with_filtered_stderr "${MODEL_ARGS[@]}" "${CONFIG_ARGS[@]}"
  exit $?
fi

# Non-interactive
set +e
if $USE_QWEN_CLI; then
  log_meta "Using qwen CLI for this run."
  run_with_filtered_streams "${QWEN_ARGS[@]}"
else
  log_meta "Using Agent model: $MODEL"
  run_with_filtered_streams exec "${MODEL_ARGS[@]}" "${CONFIG_ARGS[@]}" --full-auto --skip-git-repo-check --sandbox workspace-write "$TASK"
fi
CMD_STATUS=$?
set -e
exit "$CMD_STATUS"
