#!/bin/bash

# Test runner script for AlfeCode
# This script runs all Jest tests in the project

echo "Running AlfeCode test suite..."
echo "================================"

# Check if Jest is available
if ! command -v npx &> /dev/null; then
    echo "Error: npx not found. Please install Node.js and npm."
    exit 1
fi

# Change to the project directory
cd "$(dirname "$0")"

# Run all tests
echo "Running all tests..."
npx jest test/

# Check exit code
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ All tests passed!"
    exit 0
else
    echo ""
    echo "❌ Some tests failed!"
    exit 1
fi