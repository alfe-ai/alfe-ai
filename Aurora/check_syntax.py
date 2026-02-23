#!/usr/bin/env python3
"""Check JavaScript syntax using Node.js"""
import subprocess
import sys

files = [
    "src/server.js",
    "src/taskDb.js",
    "src/taskDbAws.js",
    "public/db.html"
]

all_ok = True
for f in files:
    try:
        result = subprocess.run(
            ["node", "--check", f],
            capture_output=True,
            text=True,
            cwd="/git/sterling/3528f51b-a217-47c2-bcd4-964814ed9232/alfe-ai-1771874283885/Aurora"
        )
        if result.returncode != 0:
            print(f"❌ {f}: SYNTAX ERROR")
            print(result.stderr)
            all_ok = False
        else:
            print(f"✅ {f}: OK")
    except Exception as e:
        print(f"⚠️  {f}: CHECK FAILED - {e}")

if all_ok:
    print("\n✅ All files passed syntax check!")
    sys.exit(0)
else:
    print("\n❌ Some files have syntax errors")
    sys.exit(1)
