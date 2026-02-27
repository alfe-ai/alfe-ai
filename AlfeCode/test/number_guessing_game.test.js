/**
 * Test for the Number Guessing Game
 */
const NumberGuessingGame = require('../games/number_guessing_game');

test('Number Guessing Game - correct guess', () => {
  const game = new NumberGuessingGame();
  
  // Set target number for predictable testing
  game.targetNumber = 50;
  
  const result = game.makeGuess(50);
  
  expect(result.status).toBe('correct');
  expect(result.correct).toBe(true);
  expect(result.message).toContain('Congratulations');
});

test('Number Guessing Game - too low guess', () => {
  const game = new NumberGuessingGame();
  
  // Set target number for predictable testing
  game.targetNumber = 50;
  
  const result = game.makeGuess(25);
  
  expect(result.status).toBe('too_low');
  expect(result.correct).toBe(false);
  expect(result.message).toContain('Too low');
});

test('Number Guessing Game - too high guess', () => {
  const game = new NumberGuessingGame();
  
  // Set target number for predictable testing
  game.targetNumber = 50;
  
  const result = game.makeGuess(75);
  
  expect(result.status).toBe('too_high');
  expect(result.correct).toBe(false);
  expect(result.message).toContain('Too high');
});

test('Number Guessing Game - game over after max attempts', () => {
  const game = new NumberGuessingGame();
  
  // Set target number for predictable testing
  game.targetNumber = 50;
  game.attempts = 10; // Set attempts to maximum
  
  const result = game.makeGuess(25);
  
  expect(result.status).toBe('game_over');
  expect(result.correct).toBe(false);
  expect(result.message).toContain('Game over');
});

test('Number Guessing Game - get stats', () => {
  const game = new NumberGuessingGame();
  
  // Set target number for predictable testing
  game.targetNumber = 50;
  game.attempts = 3;
  
  const stats = game.getStats();
  
  expect(stats.attempts).toBe(3);
  expect(stats.maxAttempts).toBe(10);
  expect(stats.targetNumber).toBe(50);
});