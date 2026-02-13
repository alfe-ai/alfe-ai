# Sterling Lite CLI Tools

This directory contains the Sterling Lite CLI tools, a lightweight command-line interface for interacting with the Sterling AI system.

## Overview

The Sterling Lite CLI is designed to be similar to other CLI tools in the project (like `codex-cli` and `qwen-cli`) but with a minimal, barebones implementation that can be extended later.

## Structure

```
sterling-lite-tools/
├── run_sterling.sh          # Main CLI script (placeholder implementation)
├── common_functions.sh      # Shared utility functions
└── README.md               # This file
```

## Usage

### Basic Usage

```bash
./run_sterling.sh [OPTIONS] [--] [STERLING_ARGS...]
```

### Options

- `-h, --help`: Show help message and exit
- `-s, --show-meta`: Show metadata (default: false)
- `-a, --show-args`: Show Sterling CLI arguments (default: false)

### Examples

```bash
# Show help
./run_sterling.sh --help

# Run with metadata display
./run_sterling.sh --show-meta -- --version

# Run with argument display
./run_sterling.sh --show-args -- --help

# Pass arguments to Sterling CLI
./run_sterling.sh -- --list-models
```

## Current Implementation

This is a **placeholder implementation**. The current `run_sterling.sh` script:

- Accepts command-line arguments
- Displays metadata when requested
- Shows received arguments
- Creates a Sterling directory (`~/.sterling`)
- Exits with success code

## Future Implementation

The actual Sterling CLI functionality will be implemented later. When ready, this implementation should:

- Connect to the Sterling AI service
- Handle authentication and API keys
- Process user commands and arguments
- Display results and errors appropriately
- Support configuration files and environment variables

## Dependencies

Currently, this implementation only requires standard POSIX shell utilities. Future implementations may require:

- Network connectivity for API calls
- JSON processing tools (jq, etc.)
- Authentication libraries

## Development

To extend this implementation:

1. Modify `run_sterling.sh` to add actual Sterling functionality
2. Use `common_functions.sh` for shared utilities
3. Follow the existing patterns from `codex-tools/` for consistency
4. Add proper error handling and logging
5. Implement configuration management

## Notes

- This is an early placeholder implementation
- The directory structure follows the same pattern as other CLI tools
- Environment variables and configuration will be added as needed
- Error handling and logging can be enhanced as the implementation grows