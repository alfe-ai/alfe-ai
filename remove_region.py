#!/usr/bin/env python3

import re

# Read the file
with open('/git/sterling/23e60d6c-eb34-4882-9df3-4f1c1c052718/alfe-ai-1774721354029/status/public/index.html', 'r') as f:
    content = f.read()

# Remove the region data cells
# Pattern matches <td> followed by any text and </td> that comes after server name but before updated time
pattern = r'<td>[^<]*</td>'
content = re.sub(pattern, '', content, count=0, flags=re.DOTALL)

# We need to be more specific - only remove the region cells (the second td in each row)
# Let's approach this differently - we'll process by row
lines = content.split('\n')
new_lines = []
in_body = False
row_count = 0

for line in lines:
    if '<tbody>' in line:
        in_body = True
        new_lines.append(line)
        continue
    elif '</tbody>' in line:
        in_body = False
        new_lines.append(line)
        continue
    
    if in_body and '<tr>' in line:
        row_count = 0
        new_lines.append(line)
        continue
    elif in_body and '</tr>' in line:
        new_lines.append(line)
        row_count = 0
        continue
    elif in_body and '<td>' in line and row_count == 1:  # Second td is the region column
        # Skip this line (the region td)
        row_count += 1
        continue
    elif in_body and '<td>' in line:
        # This is either server name (row_count=0) or updated time (row_count=2)
        row_count += 1
        new_lines.append(line)
    else:
        new_lines.append(line)

# Write the updated content back to the file
with open('/git/sterling/23e60d6c-eb34-4882-9df3-4f1c1c052718/alfe-ai-1774721354029/status/public/index.html', 'w') as f:
    f.write('\n'.join(new_lines))

print("Region column removed successfully")