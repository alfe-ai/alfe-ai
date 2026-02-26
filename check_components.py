#!/usr/bin/env python3

import re

# Read the diff.ejs file to analyze where components currently are
with open('/git/sterling/ab6788f1-3688-48a1-a686-efc84bb67ac0/alfe-ai-1772075787569/AlfeCode/executable/views/diff.ejs', 'r') as f:
    content = f.read()

# Find the diff shell structure
diff_shell_match = re.search(r'<div class="diff-shell">(.*?)</div>', content, re.DOTALL)
if diff_shell_match:
    diff_shell_content = diff_shell_match.group(1)
    print("Diff shell content:")
    print(diff_shell_content[:1000] + "...")
else:
    print("No diff shell found")

# Find the components already in sidebar
sidebar_content = re.search(r'<div class="diff-sidebar" aria-label="Commits and files">(.*?)</div>', content, re.DOTALL)
if sidebar_content:
    print("\nSidebar content:")
    print(sidebar_content.group(1)[:1000] + "...")
    
# Find the main diff view (that should be the area NOT in sidebar)
main_diff_content = re.search(r'<section id="diff" class="viewer-panel diff-view.*?</section>', content, re.DOTALL)
if main_diff_content:
    print("\nMain diff content:")
    print(main_diff_content.group(0)[:500] + "...")