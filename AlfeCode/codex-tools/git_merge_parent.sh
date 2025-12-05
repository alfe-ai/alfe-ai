#!/bin/bash
set -euo pipefail

log() {
  printf '%s\n' "$1"
}

abort() {
  printf '%s\n' "$1" >&2
  exit 1
}

infer_parent_from_reflog() {
  local branch="$1"
  local reflog_output
  local entry

  reflog_output="$(git reflog show --reverse --format='%gs' "$branch" 2>/dev/null || true)"
  if [[ -z "$reflog_output" ]]; then
    return 1
  fi

  while IFS= read -r entry; do
    if [[ -z "$entry" ]]; then
      continue
    fi

    if [[ "$entry" =~ ^branch:\ Created\ from\ (.+)$ ]]; then
      printf '%s\n' "${BASH_REMATCH[1]}"
      return 0
    fi

    if [[ "$entry" =~ ^checkout:\ moving\ from\ ([^[:space:]]+)\ to\ .+$ ]]; then
      printf '%s\n' "${BASH_REMATCH[1]}"
      return 0
    fi
  done <<<"$reflog_output"

  return 1
}

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  abort "Not inside a git repository."
fi

current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$current_branch" == "HEAD" ]]; then
  abort "Cannot merge while in a detached HEAD state."
fi

upstream_ref="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"

child_remote=""
child_remote_branch=""
if [[ -n "$upstream_ref" ]]; then
  child_remote="${upstream_ref%%/*}"
  child_remote_branch="${upstream_ref#*/}"
  if [[ "$child_remote" == "$upstream_ref" ]]; then
    child_remote_branch="$upstream_ref"
    child_remote=""
  fi
fi

parent_remote=""
parent_branch=""

if [[ -n "$upstream_ref" ]]; then
  parent_remote="${upstream_ref%%/*}"
  parent_branch="${upstream_ref#*/}"
  if [[ "$parent_remote" == "$upstream_ref" ]]; then
    parent_branch="$upstream_ref"
    parent_remote=""
  fi
fi

configured_parent="${STERLING_PARENT_BRANCH:-}"
if [[ -z "$configured_parent" ]]; then
  configured_parent="$(git config --get "branch.${current_branch}.sterlingParent" 2>/dev/null || true)"
fi

if [[ -n "$configured_parent" && "$configured_parent" != "$current_branch" ]]; then
  parent_branch="$configured_parent"
  parent_remote=""
  parent_upstream="$(git rev-parse --abbrev-ref --symbolic-full-name "${parent_branch}@{u}" 2>/dev/null || true)"
  if [[ -n "$parent_upstream" && "$parent_upstream" != "$parent_branch" ]]; then
    parent_remote="${parent_upstream%%/*}"
  fi
elif [[ -n "$configured_parent" && "$configured_parent" == "$current_branch" ]]; then
  log "Configured parent branch '$configured_parent' matches current branch. Falling back to upstream tracking."
fi

if [[ -z "$parent_branch" || "$parent_branch" == "$current_branch" ]]; then
  inferred_parent="$(infer_parent_from_reflog "$current_branch" || true)"
  if [[ -n "$inferred_parent" && "$inferred_parent" != "$current_branch" ]]; then
    log "Inferred parent branch '$inferred_parent' for '$current_branch' from reflog."
    parent_branch="$inferred_parent"
    parent_remote=""
    parent_upstream="$(git rev-parse --abbrev-ref --symbolic-full-name "${parent_branch}@{u}" 2>/dev/null || true)"
    if [[ -n "$parent_upstream" && "$parent_upstream" != "$parent_branch" ]]; then
      parent_remote="${parent_upstream%%/*}"
    fi
    if ! git config branch."${current_branch}".sterlingParent "$parent_branch" 2>/dev/null; then
      printf "Warning: unable to persist inferred parent for '%s'.\n" "$current_branch" >&2
    fi
  fi
fi

if [[ -z "$parent_branch" ]]; then
  abort "Unable to determine parent branch. Configure an upstream for '$current_branch' or set branch.${current_branch}.sterlingParent."
fi

if [[ "$parent_branch" == "$current_branch" ]]; then
  abort "Configured parent branch resolves to the current branch '$current_branch'. Update branch.${current_branch}.sterlingParent to the desired target."
fi

if [[ -n "$(git status --porcelain)" ]]; then
  abort "Working tree has uncommitted changes. Please commit or stash before merging."
fi

log "Current branch: $current_branch"
if [[ -n "$parent_remote" ]]; then
  log "Parent branch (upstream): $parent_remote/$parent_branch"
else
  log "Parent branch (upstream): $parent_branch"
fi

cleanup() {
  git checkout "$current_branch" >/dev/null 2>&1 || true
}
trap cleanup EXIT

export GIT_MERGE_AUTOEDIT=no

if [[ -n "$parent_remote" ]]; then
  log "Fetching latest updates for $parent_remote/$parent_branch..."
  git fetch "$parent_remote" "$parent_branch"
else
  remotes="$(git remote 2>/dev/null || true)"
  if [[ -n "$remotes" ]]; then
    log "Fetching latest updates from configured remotes..."
    git fetch --all --prune
  fi
fi

if ! git show-ref --verify --quiet "refs/heads/$parent_branch"; then
  if [[ -n "$parent_remote" ]]; then
    log "Creating local branch '$parent_branch' from '$parent_remote/$parent_branch'..."
    git branch "$parent_branch" "$parent_remote/$parent_branch"
  else
    abort "Parent branch '$parent_branch' not found locally and no remote available to create it."
  fi
fi

# Merge parent into current branch first so current includes latest parent changes
log "Merging parent branch '$parent_branch' into current branch '$current_branch'..."
merge_parent_failed=0
if ! git merge --no-ff --no-edit "$parent_branch"; then
  merge_parent_failed=1
fi

if [[ "$merge_parent_failed" -ne 0 ]]; then
  echo "Merge of parent into current branch encountered conflicts. Aborting and restoring state." >&2
  git merge --abort >/dev/null 2>&1 || true
  exit 1
fi

if [[ -n "$child_remote_branch" ]]; then
  if [[ -n "$child_remote" ]]; then
    log "Pushing '$current_branch' to '$child_remote/$child_remote_branch'..."
    if ! push_output="$(git push "$child_remote" "$current_branch:$child_remote_branch" 2>&1)"; then
      printf '%s\n' "$push_output" >&2
      if echo "$push_output" | grep -qi 'non-fast-forward'; then
        log "Detected that '$current_branch' is behind '$child_remote/$child_remote_branch'. Pulling latest changes..."
        if git pull "$child_remote" "$child_remote_branch"; then
          log "Retrying push after pulling latest changes..."
          if ! retry_output="$(git push "$child_remote" "$current_branch:$child_remote_branch" 2>&1)"; then
            printf '%s\n' "$retry_output" >&2
            echo "Push to $child_remote/$child_remote_branch failed even after pulling latest changes." >&2
            exit 1
          fi
          printf '%s\n' "$retry_output"
        else
          echo "Automatic pull from $child_remote/$child_remote_branch failed." >&2
          exit 1
        fi
      else
        echo "Push to $child_remote/$child_remote_branch failed." >&2
        exit 1
      fi
    else
      printf '%s\n' "$push_output"
    fi
  else
    log "Pushing '$current_branch'..."
    if ! push_output="$(git push 2>&1)"; then
      printf '%s\n' "$push_output" >&2
      if echo "$push_output" | grep -qi 'non-fast-forward'; then
        log "Detected that '$current_branch' is behind its upstream. Pulling latest changes..."
        if git pull; then
          log "Retrying push after pulling latest changes..."
          if ! retry_output="$(git push 2>&1)"; then
            printf '%s\n' "$retry_output" >&2
            echo "Push of $current_branch failed even after pulling latest changes." >&2
            exit 1
          fi
          printf '%s\n' "$retry_output"
        else
          echo "Automatic pull of $current_branch failed." >&2
          exit 1
        fi
      else
        echo "Push of $current_branch failed." >&2
        exit 1
      fi
    else
      printf '%s\n' "$push_output"
    fi
  fi
else
  log "No upstream configured for '$current_branch'; skipping push of current branch."
fi

log "Checking out parent branch '$parent_branch'..."
git checkout "$parent_branch"

merge_failed=0
log "Merging '$current_branch' into '$parent_branch'..."
if ! git merge --no-ff --no-edit "$current_branch"; then
  merge_failed=1
fi

if [[ "$merge_failed" -ne 0 ]]; then
  echo "Merge encountered conflicts. Aborting merge and restoring state." >&2
  git merge --abort >/dev/null 2>&1 || true
  exit 1
fi

if [[ -n "$parent_remote" ]]; then
  log "Pushing '$parent_branch' to '$parent_remote'..."
  if ! push_output="$(git push "$parent_remote" "$parent_branch" 2>&1)"; then
    printf '%s\n' "$push_output" >&2
    if echo "$push_output" | grep -qi 'non-fast-forward'; then
      log "Detected that '$parent_branch' is behind '$parent_remote/$parent_branch'. Pulling latest changes..."
      if git pull "$parent_remote" "$parent_branch"; then
        log "Retrying push after pulling latest changes..."
        if ! retry_output="$(git push "$parent_remote" "$parent_branch" 2>&1)"; then
          printf '%s\n' "$retry_output" >&2
          echo "Push to $parent_remote/$parent_branch failed even after pulling latest changes." >&2
          exit 1
        fi
        printf '%s\n' "$retry_output"
      else
        echo "Automatic pull from $parent_remote/$parent_branch failed." >&2
        exit 1
      fi
    else
      echo "Push to $parent_remote/$parent_branch failed." >&2
      exit 1
    fi
  else
    printf '%s\n' "$push_output"
  fi
else
  remotes="$(git remote 2>/dev/null || true)"
  if [[ -z "$remotes" ]]; then
    log "No remotes configured; skipping push of '$parent_branch'."
  else
    log "Pushing '$parent_branch'..."
    if ! push_output="$(git push 2>&1)"; then
    printf '%s\n' "$push_output" >&2
    if echo "$push_output" | grep -qi 'non-fast-forward'; then
      log "Detected that '$parent_branch' is behind its upstream. Pulling latest changes..."
      if git pull; then
        log "Retrying push after pulling latest changes..."
        if ! retry_output="$(git push 2>&1)"; then
          printf '%s\n' "$retry_output" >&2
          echo "Push of $parent_branch failed even after pulling latest changes." >&2
          exit 1
        fi
        printf '%s\n' "$retry_output"
      else
        echo "Automatic pull of $parent_branch failed." >&2
        exit 1
      fi
    else
      echo "Push of $parent_branch failed." >&2
      exit 1
    fi
  else
    printf '%s\n' "$push_output"
  fi
  fi
fi

log "Returning to '$current_branch'..."
git checkout "$current_branch"

trap - EXIT
log "Merge completed successfully."
