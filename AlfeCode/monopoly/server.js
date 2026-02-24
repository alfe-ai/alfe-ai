const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = 3001;

// Serve static files from the 'monopoly' directory
app.use('/monopoly', express.static(path.join(__dirname, 'monopoly')));

// Parse JSON bodies
app.use(express.json());

// Serve the main game page
app.get('/monopoly', (req, res) => {
  res.sendFile(path.join(__dirname, 'monopoly', 'index.html'));
});

// API endpoint to start a new game
app.post('/monopoly/new-game', (req, res) => {
  const { players } = req.body;
  if (!players || players.length < 2 || players.length > 6) {
    return res.status(400).json({ error: 'Invalid number of players (2-6)' });
  }

  // Create a new game instance
  const game = {
    players: players.map(name => ({
      name,
      position: 0,
      money: 1500,
      properties: [],
      inJail: false,
      jailTurns: 0,
      isBankrupt: false
    })),
    currentPlayerIndex: 0,
    board: [
      // Go (0)
      { name: 'Go', price: 0, rent: 0, color: 'GO', owner: null, houses: 0, mortgaged: false },
      // Brown properties
      { name: 'Mediterranean Avenue', price: 60, rent: 2, color: 'Brown', owner: null, houses: 0, mortgaged: false },
      { name: 'Baltic Avenue', price: 60, rent: 4, color: 'Brown', owner: null, houses: 0, mortgaged: false },
      // Community Chest (3)
      { name: 'Community Chest', price: 0, rent: 0, color: 'Chest', owner: null, houses: 0, mortgaged: false },
      // Light Blue properties
      { name: 'Oriental Avenue', price: 100, rent: 6, color: 'Light Blue', owner: null, houses: 0, mortgaged: false },
      { name: 'Vermont Avenue', price: 100, rent: 6, color: 'Light Blue', owner: null, houses: 0, mortgaged: false },
      { name: 'Connecticut Avenue', price: 120, rent: 8, color: 'Light Blue', owner: null, houses: 0, mortgaged: false },
      // Jail (10)
      { name: 'Jail', price: 0, rent: 0, color: 'Jail', owner: null, houses: 0, mortgaged: false },
      // Pink properties
      { name: 'St. Charles Place', price: 140, rent: 10, color: 'Pink', owner: null, houses: 0, mortgaged: false },
      { name: 'States Avenue', price: 140, rent: 10, color: 'Pink', owner: null, houses: 0, mortgaged: false },
      { name: 'Virginia Avenue', price: 160, rent: 12, color: 'Pink', owner: null, houses: 0, mortgaged: false },
      // Utility (18)
      { name: 'Electric Company', price: 150, rent: 0, color: 'Utility', owner: null, houses: 0, mortgaged: false },
      // Orange properties
      { name: 'St. James Place', price: 180, rent: 14, color: 'Orange', owner: null, houses: 0, mortgaged: false },
      { name: 'Tennessee Avenue', price: 180, rent: 14, color: 'Orange', owner: null, houses: 0, mortgaged: false },
      { name: 'New York Avenue', price: 200, rent: 16, color: 'Orange', owner: null, houses: 0, mortgaged: false },
      // Free Parking (20)
      { name: 'Free Parking', price: 0, rent: 0, color: 'Free', owner: null, houses: 0, mortgaged: false },
      // Red properties
      { name: 'Kentucky Avenue', price: 220, rent: 18, color: 'Red', owner: null, houses: 0, mortgaged: false },
      { name: 'Indiana Avenue', price: 220, rent: 18, color: 'Red', owner: null, houses: 0, mortgaged: false },
      { name: 'Illinois Avenue', price: 240, rent: 20, color: 'Red', owner: null, houses: 0, mortgaged: false },
      // Railroad (25)
      { name: 'B&O Railroad', price: 200, rent: 0, color: 'Railroad', owner: null, houses: 0, mortgaged: false },
      // Yellow properties
      { name: 'Atlantic Avenue', price: 260, rent: 22, color: 'Yellow', owner: null, houses: 0, mortgaged: false },
      { name: 'Ventnor Avenue', price: 260, rent: 22, color: 'Yellow', owner: null, houses: 0, mortgaged: false },
      { name: 'Water Works', price: 150, rent: 0, color: 'Utility', owner: null, houses: 0, mortgaged: false },
      { name: 'Marvin Gardens', price: 280, rent: 24, color: 'Yellow', owner: null, houses: 0, mortgaged: false },
      // Go To Jail (31)
      { name: 'Go To Jail', price: 0, rent: 0, color: 'Jail', owner: null, houses: 0, mortgaged: false },
      // Green properties
      { name: 'Pacific Avenue', price: 300, rent: 26, color: 'Green', owner: null, houses: 0, mortgaged: false },
      { name: 'North Carolina Avenue', price: 300, rent: 26, color: 'Green', owner: null, houses: 0, mortgaged: false },
      { name: 'Pennsylvania Avenue', price: 320, rent: 28, color: 'Green', owner: null, houses: 0, mortgaged: false },
      // Railroad (35)
      { name: 'Short Line', price: 200, rent: 0, color: 'Railroad', owner: null, houses: 0, mortgaged: false },
      // Blue properties
      { name: 'Park Place', price: 350, rent: 35, color: 'Blue', owner: null, houses: 0, mortgaged: false },
      { name: 'Boardwalk', price: 400, rent: 50, color: 'Blue', owner: null, houses: 0, mortgaged: false }
    ],
    diceHistory: []
  };
  
  res.json({ game });
});

// API endpoint to roll dice
app.post('/monopoly/roll-dice', (req, res) => {
  const { game } = req.body;
  const dice1 = Math.floor(Math.random() * 6) + 1;
  const dice2 = Math.floor(Math.random() * 6) + 1;
  
  // Update dice history in game state
  game.diceHistory.push({ dice1, dice2 });
  
  res.json({ 
    dice: { dice1, dice2 },
    steps: dice1 + dice2
  });
});

// API endpoint to move a player
app.post('/monopoly/move-player', (req, res) => {
  const { game, steps } = req.body;
  const player = game.players[game.currentPlayerIndex];
  
  player.position = (player.position + steps) % 40;
  const newPosition = player.position;
  
  res.json({ 
    newPosition,
    property: game.board[newPosition]
  });
});

// API endpoint to buy a property
app.post('/monopoly/buy-property', (req, res) => {
  const { game, playerName } = req.body;
  const player = game.players.find(p => p.name === playerName);
  const property = game.board[player.position];
  
  if (property.price > 0 && !property.owner && player.money >= property.price) {
    player.money -= property.price;
    property.owner = playerName;
    player.properties.push(property.name);
    return res.json({ success: true, message: `Successfully bought ${property.name}` });
  }
  
  return res.json({ success: false, message: 'Failed to buy property' });
});

// API endpoint to next player
app.post('/monopoly/next-player', (req, res) => {
  const { game } = req.body;
  game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
  res.json({ game });
});

// API endpoint to get game status
app.get('/monopoly/game-state', (req, res) => {
  const { game } = req.body;
  res.json({ game });
});

// Handle all other routes with a simple home page
app.get('/', (req, res) => {
  res.send(`
    <html>
    <head>
        <title>Alfe AI - Monopoly</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {
                font-family: Arial, sans-serif;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                margin: 0;
                padding: 20px;
                background-color: #f0f0f0;
            }
            h1 {
                color: #333;
                text-align: center;
            }
            .container {
                background-color: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                text-align: center;
                max-width: 600px;
            }
            .btn {
                background-color: #4CAF50;
                color: white;
                padding: 12px 20px;
                margin: 10px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 16px;
            }
            .btn:hover {
                background-color: #45a049;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Alfe AI - Monopoly</h1>
            <p>Start playing Monopoly with friends!</p>
            <a href="/monopoly"><button class="btn">Play Now</button></a>
        </div>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Monopoly server running at http://localhost:${PORT}`);
});