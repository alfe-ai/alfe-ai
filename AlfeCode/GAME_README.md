# Game Application for Alfe AI Platform

This is a simple game component that has been integrated into the Alfe AI platform. The game allows users to play a "Guess the Number" game directly through the web interface.

## Features

- Simple number guessing game (1-100)
- Limited attempts (10 guesses)
- Game statistics tracking
- Responsive UI
- Game reset functionality

## Installation & Usage

The game is automatically served through the main Alfe AI application when running the application with:

```bash
./run.sh
```

Once the server is running, access the game via:

```
http://localhost:3333/game
```

## Game Rules

1. The computer picks a random number between 1 and 100
2. You have 10 attempts to guess the number
3. After each guess, you'll get feedback whether your guess was too high or too low
4. After 10 attempts, the game reveals the correct number
5. You can reset the game at any time to start a new round

## Technology Stack

- HTML5/CSS3 for frontend layout and styling
- JavaScript for game logic
- Express.js for serving the web interface (integrated with main Alfe server)

## Files

- `public/game.html` - The game's HTML structure
- `public/game.js` - The game's JavaScript logic
- `executable/game_app.js` - The Express app that serves the game
- `executable/server_webserver.js` - Main server with game route added
- `executable/views/index.ejs` - Enhanced home page with game link