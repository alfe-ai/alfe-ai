#!/usr/bin/env python3

import os
from pathlib import Path

# File locations
filenames = [
    "/git/sterling/ab6788f1-3688-48a1-a686-efc84bb67ac0/alfe-ai-1772071112100/Aurora/public/db_account_ips.html",
    "/git/sterling/ab6788f1-3688-48a1-a686-efc84bb67ac0/alfe-ai-1772071112100/Aurora/public/db.html"
]

# The specific pattern to remove in both files
pattern = '<div class="db-info-card" id="dbInfo">\n      <h2>Account IPs Info</h2>\n    </div>'

pattern2 = '<div class="db-info-card" id="dbInfo">\n      <h2>Connection Info</h2>\n      <div class="status">Loading database connection info…</div>\n    </div>'

# Process each file
for filepath in filenames:
    try:
        with open(filepath, 'r') as file:
            content = file.read()
            
        # First check which pattern matches
        if pattern in content:
            content = content.replace(pattern, '')
        elif pattern2 in content:
            content = content.replace(pattern2, '')
        else:
            print(f"Pattern not found in {filepath}")
            continue
        
        # Write the updated content back
        with open(filepath, 'w') as file:
            file.write(content)
            
        print(f"Successfully updated {filepath}")
        
    except Exception as e:
        print(f"Error processing {filepath}: {str(e)}")