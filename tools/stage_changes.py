#!/usr/bin/env python3
from pathlib import Path
import sys
from subprocess import check_call

# Stage all changes in the workspace
check_call(["git","add","-A"]) 
print('staged')
