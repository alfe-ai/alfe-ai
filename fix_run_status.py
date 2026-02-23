#!/usr/bin/env python3
"""Fix the status column in alfecode_runs table to use statusHistory[-1] as fallback."""

import re

# Read the file
with open('/git/sterling/b9a3f01e-013f-4988-96ba-f733d59dd247/alfe-ai-1771878576954/AlfeCode/rds_store.js', 'r') as f:
    content = f.read()

# The current code is:
# const status = typeof run.status === "string" ? run.status : "";
#
# We need to change it to:
# const status = (typeof run.status === "string" && run.status.trim())
#   ? run.status.trim()
#   : (Array.isArray(run.statusHistory) && run.statusHistory.length > 0
#       ? String(run.statusHistory[run.statusHistory.length - 1]).trim()
#       : "");

old_pattern = r'const status = typeof run\.status === "string" \? run\.status : "";'
new_code = '''const status = (typeof run.status === "string" && run.status.trim())
  ? run.status.trim()
  : (Array.isArray(run.statusHistory) && run.statusHistory.length > 0
      ? String(run.statusHistory[run.statusHistory.length - 1]).trim()
      : "");'''

# Replace using re.sub
content_new = re.sub(old_pattern, new_code, content)

# Verify the change was made
if content_new == content:
    print("ERROR: Pattern not found or no replacement made!")
    print("Looking for:", repr(old_pattern))
    # Debug: print the relevant section
    lines = content.split('\n')
    for i, line in enumerate(lines[380:395], start=381):
        print(f"{i}: {line}")
else:
    # Write the fixed content
    with open('/git/sterling/b9a3f01e-013f-4988-96ba-f733d59dd247/alfe-ai-1771878576954/AlfeCode/rds_store.js', 'w') as f:
        f.write(content_new)
    print("SUCCESS: Fixed status logic in rds_store.js")
