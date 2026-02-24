#!/usr/bin/env node

// Simple Potato Game
// A game where you harvest potatoes and grow them

const readline = require('readline');
const fs = require('fs');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Game state
let gameState = {
  potatoes: 0,
  seeds: 0,
  fieldSize: 5,
  field: Array(5).fill().map(() => Array(5).fill(0)),
  day: 1,
  money: 100
};

// Load/save game state
function saveGame() {
  try {
    fs.writeFileSync('potato-game-save.json', JSON.stringify(gameState));
  } catch (err) {
    console.log('Error saving game:', err.message);
  }
}

function loadGame() {
  try {
    const data = fs.readFileSync('potato-game-save.json', 'utf8');
    gameState = JSON.parse(data);
  } catch (err) {
    console.log('No saved game found, starting new game');
  }
}

// Display game menu
function showMenu() {
  console.log('\n=== Potato Game ===');
  console.log(`Day: ${gameState.day}`);
  console.log(`Money: $${gameState.money}`);
  console.log(`Potatoes: ${gameState.potatoes}`);
  console.log(`Seeds: ${gameState.seeds}`);
  console.log('\nOptions:');
  console.log('1. Plant seeds');
  console.log('2. Harvest potatoes');
  console.log('3. Buy more seeds ($5 each)');
  console.log('4. Check field status');
  console.log('5. Save game');
  console.log('6. Quit');
  console.log('====================');
}

// Plant seeds
function plantSeeds() {
  if (gameState.seeds <= 0) {
    console.log('You have no seeds to plant!');
    return;
  }

  console.log('\nPlanting seeds...');
  let seedsPlanted = 0;
  
  // Allow planting seeds on empty fields
  for (let i = 0; i < gameState.field.length; i++) {
    for (let j = 0; j < gameState.field[i].length; j++) {
      if (gameState.field[i][j] === 0 && seedsPlanted < gameState.seeds) {
        gameState.field[i][j] = 1; // plant a seed
        seedsPlanted++;
      }
    }
  }

  gameState.seeds -= seedsPlanted;
  console.log(`Planted ${seedsPlanted} seeds!`);
}

// Harvest potatoes
function harvestPotatoes() {
  let harvested = 0;
  let matureCount = 0;

  console.log('\nHarvesting potatoes...');
  for (let i = 0; i < gameState.field.length; i++) {
    for (let j = 0; j < gameState.field[i].length; j++) {
      if (gameState.field[i][j] === 2) { // mature potato
        gameState.field[i][j] = 0; // clear field
        harvested++;
        matureCount++;
      } else if (gameState.field[i][j] === 1) { // seed
        console.log(`Field at (${i},${j}) still growing...`);
      }
    }
  }

  if (matureCount > 0) {
    gameState.potatoes += matureCount;
    gameState.money += matureCount * 10; // sell for $10 each
    console.log(`Harvested ${matureCount} potatoes! Earned $${matureCount * 10}`);
  } else {
    console.log('No mature potatoes to harvest');
  }
}

// Buy more seeds
function buySeeds() {
  const cost = 5;
  const amount = Math.min(5, Math.floor(gameState.money / cost));
  
  if (amount <= 0) {
    console.log('Not enough money to buy seeds!');
    return;
  }

  gameState.seeds += amount;
  gameState.money -= amount * cost;
  console.log(`Bought ${amount} seeds for $${amount * cost}`);
}

// Check field status
function checkField() {
  console.log('\nField Status:');
  console.log('  0 1 2 3 4');
  for (let i = 0; i < gameState.field.length; i++) {
    let row = `${i} `;
    for (let j = 0; j < gameState.field[i].length; j++) {
      if (gameState.field[i][j] === 0) {
        row += '. '; // empty
      } else if (gameState.field[i][j] === 1) {
        row += 'S '; // seed
      } else if (gameState.field[i][j] === 2) {
        row += 'P '; // potato
      }
    }
    console.log(row);
  }
  console.log(`Potatoes: ${gameState.potatoes}, Seeds: ${gameState.seeds}`);
}

// Advance day and growth
function advanceDay() {
  // Grow seeds into potatoes
  for (let i = 0; i < gameState.field.length; i++) {
    for (let j = 0; j < gameState.field[i].length; j++) {
      if (gameState.field[i][j] === 1) {
        gameState.field[i][j] = 2; // grow into potato
      }
    }
  }
  
  gameState.day++;
  console.log(`\n--- Day ${gameState.day} ---`);
}

// Main game loop
function main() {
  loadGame();
  showMenu();
  
  rl.question('Choose an option (1-6): ', (choice) => {
    switch (choice) {
      case '1':
        plantSeeds();
        break;
      case '2':
        harvestPotatoes();
        break;
      case '3':
        buySeeds();
        break;
      case '4':
        checkField();
        break;
      case '5':
        saveGame();
        console.log('Game saved!');
        break;
      case '6':
        console.log('\nThanks for playing!');
        rl.close();
        return;
      default:
        console.log('Invalid option!');
    }

    // Advance to next day automatically
    advanceDay();
    
    // Continue the game
    main();
  });
}

// Start the game
console.log('Welcome to Potato Game!');
console.log('Grow potatoes, harvest them, and make money!');
main();