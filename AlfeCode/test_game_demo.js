#!/usr/bin/env node

/**
 * Test script to demonstrate the Number Guessing Game functionality
 * This will run a simple test with predetermined inputs
 */
const NumberGuessingGame = require('./games/number_guessing_game');

console.log('=== Number Guessing Game Test ===\n');

// Create a test game instance
const game = new NumberGuessingGame();

// Override target number for reproducible tests
game.targetNumber = 42;

console.log(`Target number set to: ${game.targetNumber}`);
console.log(`Max attempts: ${game.maxAttempts}\n`);

// Test various scenarios
const testCases = [
  { guess: 20, expected: 'too_low' },
  { guess: 60, expected: 'too_high' },
  { guess: 42, expected: 'correct' }
];

testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: Guessing ${testCase.guess}`);
  const result = game.makeGuess(testCase.guess);
  console.log(`Result: ${result.status}`);
  console.log(`Message: ${result.message}\n`);
});

// Test game over scenario
console.log('=== Testing Game Over Scenario ===');
const game2 = new NumberGuessingGame();
game2.targetNumber = 15;
game2.attempts = 10; // Max attempts reached

console.log(`Attempting to guess with 10 attempts used`);
const result = game2.makeGuess(50);
console.log(`Result: ${result.status}`);
console.log(`Message: ${result.message}\n`);

console.log('=== Test Complete ===');