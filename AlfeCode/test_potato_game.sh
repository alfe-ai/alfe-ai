#!/bin/bash

# Simple test script to verify the potato game file was created properly
echo "Testing if potato game file exists..."

if [ -f "public/potato-game.html" ]; then
    echo "✓ Potato game HTML file exists"
    
    # Check if it contains key elements
    if grep -q "Potato Catcher Game" public/potato-game.html; then
        echo "✓ Game title found"
    else
        echo "✗ Game title not found"
        exit 1
    fi
    
    if grep -q "potato" public/potato-game.html; then
        echo "✓ Potato references found"
    else
        echo "✗ Potato references not found"
        exit 1
    fi
    
    if grep -q "basket" public/potato-game.html; then
        echo "✓ Basket references found"
    else
        echo "✗ Basket references not found"
        exit 1
    fi
    
    echo "All tests passed!"
    exit 0
else
    echo "✗ Potato game HTML file not found"
    exit 1
fi