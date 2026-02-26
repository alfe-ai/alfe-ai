#!/usr/bin/env node

// Simple number guessing game
// The computer generates a random number between 1 and 100
// The user has to guess it with as few attempts as possible

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Generate a random number between 1 and 100
const targetNumber = Math.floor(Math.random() * 100) + 1;
let attempts = 0;

console.log('Welcome to the Number Guessing Game!');
console.log('I\'m thinking of a number between 1 and 100.');
console.log('Can you guess what it is?');

const askForGuess = () => {
  rl.question('\nEnter your guess: ', (input) => {
    const guess = parseInt(input);
    
    // Validate input
    if (isNaN(guess) || guess < 1 || guess > 100) {
      console.log('Please enter a valid number between 1 and 100.');
      askForGuess();
      return;
    }
    
    attempts++;
    
    // Check the guess
    if (guess < targetNumber) {
      console.log('Too low! Try a higher number.');
      askForGuess();
    } else if (guess > targetNumber) {
      console.log('Too high! Try a lower number.');
      askForGuess();
    } else {
      console.log(`\nCongratulations! You guessed the number ${targetNumber} in ${attempts} attempts!`);
      rl.close();
    }
  });
};

askForGuess();