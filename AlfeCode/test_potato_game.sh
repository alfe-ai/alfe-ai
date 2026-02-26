#!/bin/bash

# Simple test to verify potato game works
echo "Testing potato game setup..."

# Check if the html file exists
if [ -f "AlfeCode/public/potato_game.html" ]; then
    echo "✅ Potato game HTML file exists"
else
    echo "❌ Potato game HTML file missing"
    exit 1
fi

# Check if the server file has the route
if grep -q "potato-game" "AlfeCode/executable/server_webserver.js"; then
    echo "✅ Potato game route added to server"
else
    echo "❌ Potato game route missing from server"
    exit 1
fi

# Check if the index page has the link
if grep -q "Potato Game" "AlfeCode/executable/views/index.ejs"; then
    echo "✅ Potato game link added to index page"
else
    echo "❌ Potato game link missing from index page"
    exit 1
fi

echo "All tests passed!"