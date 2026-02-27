const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// In-memory storage for game state
let gameState = {
    players: 2,
    tracks: ['Mountain Loop', 'City Circuit', 'Desert Speedway'],
    currentTrack: 'Mountain Loop',
    raceStatus: 'ready',
    lapCount: 0,
    maxLaps: 3,
    playersData: [
        { id: 1, name: 'Player 1', position: 0, time: 0 },
        { id: 2, name: 'Player 2', position: 0, time: 0 }
    ]
};

// Routes
app.get('/', (req, res) => {
    res.json({ message: 'Hotwheel Racing API', gameState });
});

// Get current game state
app.get('/game/state', (req, res) => {
    res.json(gameState);
});

// Start a new race
app.post('/game/start', (req, res) => {
    gameState.raceStatus = 'in_progress';
    gameState.lapCount = 0;
    gameState.playersData.forEach(player => {
        player.position = 0;
        player.time = 0;
    });
    res.json({ message: 'Race started!', gameState });
});

// Complete a lap
app.post('/game/lap-complete', (req, res) => {
    if (gameState.raceStatus !== 'in_progress') {
        return res.status(400).json({ error: 'Race is not in progress' });
    }
    
    gameState.lapCount++;
    if (gameState.lapCount >= gameState.maxLaps) {
        gameState.raceStatus = 'finished';
        // Determine winner based on total time
        const winner = gameState.playersData.reduce((prev, current) => 
            (prev.time < current.time) ? prev : current
        );
        return res.json({ 
            message: 'Race finished!', 
            winner: winner.name,
            gameState 
        });
    }
    
    res.json({ message: 'Lap completed', gameState });
});

// Reset the game
app.post('/game/reset', (req, res) => {
    gameState.raceStatus = 'ready';
    gameState.lapCount = 0;
    gameState.playersData.forEach(player => {
        player.position = 0;
        player.time = 0;
    });
    res.json({ message: 'Game reset', gameState });
});

// Update player position
app.put('/game/player/:id', (req, res) => {
    const playerId = parseInt(req.params.id);
    const { position, time } = req.body;
    
    const player = gameState.playersData.find(p => p.id === playerId);
    if (!player) {
        return res.status(404).json({ error: 'Player not found' });
    }
    
    player.position = position;
    player.time = time;
    
    res.json({ message: 'Player updated', player });
});

app.listen(port, () => {
    console.log(`Hotwheel Racing API server running at http://localhost:${port}`);
});

module.exports = app;