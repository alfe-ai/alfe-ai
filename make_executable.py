#!/usr/bin/env python3

import stat
import os

# Making the hangman.sh file executable
file_path = "/git/sterling/ab6788f1-3688-48a1-a686-efc84bb67ac0/alfe-ai-1772085344600/hangman.sh"
# Read the file content
with open(file_path, 'r') as f:
    content = f.read()

# Add executable permissions (using stat module)
os.chmod(file_path, stat.S_IRWXU | stat.S_IRGRP | stat.S_IROTH)

print("Successfully made hangman.sh executable")