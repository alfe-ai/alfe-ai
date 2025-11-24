#!/bin/bash

git config advice.addIgnoredFile false

# Configure user identity if not set
#if [ -z "$(git config user.email)" ]; then
#    git config --global user.email "todo"
#fi
#if [ -z "$(git config user.name)" ]; then
#    git config --global user.name "todo"
#fi

echo "---Initial Git Status:"
git status
echo "---Adding *:"
# Stage all changes, including deletions. "git add *" skips removed files,
# which prevented git_fpush.sh from committing deletions made by the Agent.
git add --all
echo "---Added, git status:"
git status
# If the caller provided stdout-only output via the GIT_FPUSH_STDOUT
# environment variable, we'll prepend that to the commit message so the
# commit includes the Agent's stdout at the top and the existing commit
# message afterwards.
echo "---Git commit:"
commit_message=$(git status | sed -n '/Changes to be committed:/,/^$/p' | sed '1d;/^$/d;/.*git restore .*/d')

# Ensure commits use author name Alfe and a consistent email
export GIT_AUTHOR_NAME="Alfe"
export GIT_AUTHOR_EMAIL="alfe@alfe.sh"
export GIT_COMMITTER_NAME="Alfe"
export GIT_COMMITTER_EMAIL="alfe@alfe.sh"

# Build the final commit message. Prefer including the Agent's Final output
# first (if available), followed by any filtered stdout, and finally the
# existing commit message summary.
final_output=""
if [ -n "${GIT_FPUSH_FINAL_OUTPUT:-}" ]; then
    final_output=$(printf "%s" "$GIT_FPUSH_FINAL_OUTPUT" | sed -e 's/\r//g')
    while [[ $final_output == $'\n'* ]]; do
        final_output=${final_output#$'\n'}
    done
    final_output=$(printf "%s" "$final_output" | sed -e 's/[[:space:]]\+$//')
fi

stdout_only=""
if [ -n "${GIT_FPUSH_STDOUT:-}" ]; then
    # Normalize newlines and trim
    stdout_only=$(printf "%s" "$GIT_FPUSH_STDOUT" | sed -e 's/\r//g' -e 's/[[:space:]]\+$//')
    # If the provided stdout looks like git pull/push metadata or other
    # non-informational noise, don't include it in the commit message.
    if printf "%s" "$stdout_only" | grep -E -q "(^Updating |^Fast-forward$|__STERLING_SNAPSHOT_DIR__|\*\*Result\*\*|files changed|create mode|delete mode|deleted:|^\s*[-+0-9]+ files changed|^[[:space:]]*[^[:space:]]+[[:space:]]*\|[[:space:]]*[0-9]+)"; then
        stdout_only=""
    fi
fi

message_sections=()
if [ -n "$final_output" ]; then
    message_sections+=("$final_output")
fi
if [ -n "$stdout_only" ]; then
    message_sections+=("$stdout_only")
fi
message_sections+=("$commit_message")

if [ ${#message_sections[@]} -gt 1 ]; then
    temp_msg=$(mktemp)
    for idx in "${!message_sections[@]}"; do
        if [ "$idx" -gt 0 ]; then
            printf "\n\n---\n" >> "$temp_msg"
        fi
        printf "%s" "${message_sections[$idx]}" >> "$temp_msg"
    done
    printf "\n" >> "$temp_msg"
    git commit -F "$temp_msg"
    rm -f "$temp_msg"
else
    git commit -m "${message_sections[0]}"
fi

echo "---Git pull:"
if git rev-parse --symbolic-full-name @{u} >/dev/null 2>&1; then
    if ! git pull --no-rebase --no-edit; then
        echo "git pull failed. Aborting push." >&2
        exit 1
    fi
else
    echo "No upstream configured; skipping git pull."
fi

echo "---Git push:"
# Push with 'set-upstream' if no upstream is set
branch=$(git rev-parse --abbrev-ref HEAD)
echo \"---STERLING_BRANCH_NAME:$branch\"
if git rev-parse --symbolic-full-name @{u} >/dev/null 2>&1; then
    push_output=$(git push 2>&1)
else
    push_output=$(git push --set-upstream origin "$branch" 2>&1)
fi

echo "$push_output"

# Check for repository moved message
if echo "$push_output" | grep -Fq "This repository moved. Please use the new location"; then
    # Extract new location from the next line containing 'git@'
    new_location=$(echo "$push_output" | grep -o 'git@[^ ]*')
    
    # Update the remote URL
    git remote set-url origin "$new_location"
    echo "Remote origin updated to $new_location"
    
    # Retry push
    if git rev-parse --symbolic-full-name @{u} >/dev/null 2>&1; then
        push_output=$(git push 2>&1)
    else
        push_output=$(git push --set-upstream origin "$branch" 2>&1)
    fi
    
    echo "$push_output"
fi

sleep 1

echo "---Final Git status:"
git status

echo "---Git log:"
git log -n 3 --pretty=format:'%H %ai %an <%ae> %s' --abbrev-commit
