# Alfe AI - Monopoly

This directory contains a Monopoly game implementation for the Alfe AI application.

## Available Implementations

1. **Python Console Version** - A simple text-based Monopoly game
   - Run with: `python3 monopoly.py`

2. **Web-based Version** - A browser-based implementation with a graphical interface
   - Run with: `npm run monopoly` 

## How to Play

### Console Version:
1. Run `python3 monopoly.py`
2. Enter the number of players (2-6)
3. Enter player names
4. Follow the prompts for dice rolling, property purchasing, and turning

### Web Version:
1. Run `npm run monopoly`
2. Open a browser and go to `http://localhost:3001`
3. Click "Start Game" and enter player names
4. Play using the web interface

## Game Features

- Player turns and movement
- Property purchasing
- Rent payment
- Bankruptcy detection
- Win condition (last player remaining)

## Requirements

- Node.js (for web version)
- Python 3 (for console version)

## Files

- `monopoly.py` - Console-based Monopoly implementation
- `monopoly/` - Web-based Monopoly implementation directory
  - `index.html` - Web interface
  - `server.js` - Backend server
  - `README.md` - Web implementation documentation