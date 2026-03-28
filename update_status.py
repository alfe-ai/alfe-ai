#!/usr/bin/env python3

import re
import sys
from pathlib import Path

# Define the new entries for the status table
new_entries = [
    {"name": "internal.alfe.bot", "region": "us-east-1", "status": "online"},
    {"name": "internal-chat.alfe.bot", "region": "us-west-2", "status": "online"},
    {"name": "code.alfe.bot", "region": "eu-central-1", "status": "online"},
    {"name": "chat.alfe.bot", "region": "ap-southeast-1", "status": "offline"},
    {"name": "alfe.bot", "region": "us-east-1", "status": "online"},
    {"name": "alfe.sh", "region": "us-west-2", "status": "online"},
    {"name": "code.alfe.sh", "region": "eu-central-1", "status": "online"},
    {"name": "chat.alfe.sh", "region": "ap-southeast-1", "status": "offline"},
    {"name": "litellm.alfe.sh", "region": "us-east-1", "status": "online"},
    {"name": "internal postgres", "region": "us-west-2", "status": "online"},
    {"name": "prod postgres", "region": "eu-central-1", "status": "offline"},
    {"name": "local qwen 3 coder 30b a3b instruct", "region": "ap-southeast-1", "status": "online"}
]

# Read the current HTML file
html_file = Path('/git/sterling/23e60d6c-eb34-4882-9df3-4f1c1c052718/alfe-ai-1774706906309/status/public/index.html')
html_content = html_file.read_text()

# Create new table rows for the entries
new_rows = []
for entry in new_entries:
    status_class = "online" if entry["status"] == "online" else "offline"
    status_text = "Online" if entry["status"] == "online" else "Offline"
    
    row = f'''            <tr>
              <td>{entry["name"]}</td>
              <td>{entry["region"]}</td>
              <td>just now</td>
              <td>
                <span class="status {status_class}"><span class="dot"></span>{status_text}</span>
              </td>
            </tr>'''
    new_rows.append(row)

# Find the position in the HTML where we want to insert the new rows
# Look for the closing </tbody> tag
tbody_end = html_content.find('</tbody>')

if tbody_end == -1:
    print("Error: Could not find </tbody> tag in index.html")
    sys.exit(1)

# Insert new rows before the closing </tbody> tag
new_html_content = html_content[:tbody_end] + '\n' + '\n'.join(new_rows) + '\n' + html_content[tbody_end:]

# Write the updated file
html_file.write_text(new_html_content)

print("Successfully updated status page with new entries")