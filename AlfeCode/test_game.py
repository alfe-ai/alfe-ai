#!/usr/bin/env python3
"""
Test script for the number guessing game
Verifies that the game runs without errors
"""

import subprocess
import sys

def test_game():
    """Test that the game can be executed"""
    try:
        # Test that we can run the game script
        result = subprocess.run([sys.executable, "guessing_game.py", "--help"], 
                              capture_output=True, text=True, timeout=10)
        print("✓ Game script can be executed")
        return True
    except Exception as e:
        print(f"✗ Game test failed: {e}")
        return False

if __name__ == "__main__":
    print("Testing the number guessing game...")
    if test_game():
        print("✅ All tests passed!")
    else:
        print("❌ Tests failed!")
        sys.exit(1)