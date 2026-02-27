#!/usr/bin/env node

/**
 * Command-line interface for the Number Guessing Game
 */

const NumberGuessingGame = require('../games/number_guessing_game');

// Create new game instance
const game = new NumberGuessingGame();

console.log('Welcome to the Number Guessing Game!');
console.log(`I'm thinking of a number between 1 and 100.`);
console.log(`You have ${game.maxAttempts} attempts to guess it.\n`);

// Function to handle user input
function handleInput(input) {
  const guess = parseInt(input.trim());
  
  // Validate input
  if (isNaN(guess) || guess < 1 || guess > 100) {
    console.log('Please enter a valid number between 1 and 100.');
    return false;
  }
  
  // Process the guess
  const result = game.makeGuess(guess);
  
  console.log(result.message);
  
  // Check if game is over
  if (result.status === 'correct' || result.status === 'game_over') {
    console.log('\nGame ended. Thanks for playing!');
    return true; // Game over
  }
  
  return false; // Game continues
}

// Simple input handling for demo purposes
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('Enter your guess (or "quit" to exit):');

// Simple input loop (for demo)
let attempts = 0;
const maxAttempts = game.maxAttempts;

function playGame() {
  if (attempts >= maxAttempts) {
    console.log(`\nGame over! You've used all ${maxAttempts} attempts.`);
    console.log(`The number was ${game.targetNumber}.`);
    rl.close();
    return;
  }
  
  rl.question(`Attempt ${attempts + 1}: `, (input) => {
    if (input.toLowerCase() === 'quit') {
      console.log('Thanks for playing!');
      rl.close();
      return;
    }
    
    const gameOver = handleInput(input);
    attempts++;
    
    if (!gameOver) {
      playGame();
    }
  });
}

// Start the game
playGame();