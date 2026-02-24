# Monopoly Game

A simple implementation of the classic Monopoly board game built with Node.js and HTML/CSS/JavaScript.

## Features

- Multiplayer support (2-6 players)
- Complete game board visualization
- Turn-based gameplay
- Property purchasing and renting
- Dice rolling simulation
- Real-time game state tracking

## How to Play

1. Start the game server:
   ```bash
   npm run monopoly
   ```

2. Open your browser and go to `http://localhost:3001`

3. Enter player names when prompted

4. Players take turns rolling dice, moving around the board, and buying properties

## Game Rules

- Players start with $1500
- When landing on an unowned property, you can buy it
- When landing on a property owned by someone else, pay rent
- The game continues until only one player remains

## Files

- `index.html` - Main game interface
- `server.js` - Backend server with game logic
- `game.py` - Standalone Python implementation