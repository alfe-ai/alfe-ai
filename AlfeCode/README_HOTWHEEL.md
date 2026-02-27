# Hotwheel Racing Game

This is a simple hotwheel racing game implementation included in the Alfe AI project.

## Features
- Multi-player hotwheel racing experience
- Track selection (Mountain Loop, City Circuit, Desert Speedway)
- Lap tracking
- Race state management

## Files
- `public/hotwheel_racing.html` - HTML-based frontend game
- `hotwheel_game_server.js` - Node.js backend server for game state management
- `test/hotwheel_racing.test.js` - Jest tests for game logic

## Running the Game
1. Start the backend server:
   ```bash
   npm run hotwheel-game
   ```

2. Open `public/hotwheel_racing.html` in your browser to play the game

## API Endpoints
- `GET /` - Get general info
- `GET /game/state` - Get current game state
- `POST /game/start` - Start a new race
- `POST /game/lap-complete` - Complete a lap
- `POST /game/reset` - Reset the game
- `PUT /game/player/:id` - Update player information

## Testing
Run the test suite with:
```bash
npm test
```

The test file `test/hotwheel_racing.test.js` includes tests verifying:
- Game initialization
- Race starting functionality
- Lap completion
- Win condition detection