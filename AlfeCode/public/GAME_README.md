# Alfe AI Terminal Game

A fun coding challenge game integrated into the Alfe AI platform that tests your programming knowledge through multiple levels of quiz questions.

## Game Features

- **3 Levels of Difficulty**: Variables & Data Types, Functions & Logic, and Advanced Concepts
- **Terminal-Style Interface**: Immersive coding terminal experience with sound effects
- **Scoring System**: Earn points for correct answers and level completions
- **Lives System**: Start with 3 lives, lose one for each wrong answer
- **Progressive Challenges**: Questions get progressively harder as you advance

## Game Structure

### Level 1: Variables & Data Types
- Basic programming fundamentals
- Variable declaration methods
- Data type identification
- JavaScript quirks and edge cases

### Level 2: Functions & Logic
- Function behavior and syntax
- Logical operators and comparisons
- Array methods and their effects
- Type coercion rules

### Level 3: Advanced Concepts
- Advanced JavaScript concepts
- Algorithmic time complexity
- Modern JavaScript features
- Programming paradigms

## How to Play

1. **Access the Game**: Navigate to `/games` in your Alfe AI application
2. **Choose Terminal Challenge**: Click the "Launch Game" button
3. **Answer Questions**: Select the correct answer for each challenge
4. **Track Progress**: Monitor your score, lives, and level progress
5. **Complete Levels**: Advance through all 3 levels to win

## Technical Implementation

- **Frontend**: Pure JavaScript with ES6+ features
- **Styling**: CSS-in-JS with terminal aesthetic
- **Audio**: Web Audio API for sound effects
- **State Management**: Class-based game state management
- **Responsive Design**: Works on desktop and mobile devices

## File Structure

```
AlfeCode/
├── public/
│   ├── games.html          # Game launcher page
│   ├── game.html           # Main game interface
│   └── game.js             # Game logic and mechanics
└── executable/
    └── server_webserver.js # Added routes for /games and /game
```

## Routes Added

- `GET /games` - Game launcher page with available games
- `GET /game` - Main terminal game interface

## Future Enhancements

- Additional game modes (speed coding, puzzles)
- Leaderboard system
- Custom question creation
- Multiplayer challenges
- Programming language variety

## Technologies Used

- **JavaScript (ES6+)**: Modern JavaScript features
- **CSS**: Terminal-style styling with animations
- **Web Audio API**: Sound effects and audio feedback
- **Node.js/Express**: Server-side routing
- **HTML5**: Semantic markup and responsive design

## License

This game is part of the Alfe AI project and follows the same MIT license.