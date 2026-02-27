/**
 * Simple Number Guessing Game
 * A test game implementation for demonstration purposes
 */

class NumberGuessingGame {
  constructor() {
    this.targetNumber = Math.floor(Math.random() * 100) + 1;
    this.attempts = 0;
    this.maxAttempts = 10;
  }

  /**
   * Process a guess from the player
   * @param {number} guess - The number guessed by the player
   * @returns {object} Result object with status and feedback
   */
  makeGuess(guess) {
    this.attempts++;
    
    if (this.attempts > this.maxAttempts) {
      return {
        status: 'game_over',
        message: `Game over! You've used all ${this.maxAttempts} attempts. The number was ${this.targetNumber}.`,
        correct: false
      };
    }
    
    if (guess === this.targetNumber) {
      return {
        status: 'correct',
        message: `Congratulations! You guessed the number ${this.targetNumber} in ${this.attempts} attempts!`,
        correct: true
      };
    } else if (guess < this.targetNumber) {
      return {
        status: 'too_low',
        message: `Too low! Try a higher number.`,
        correct: false
      };
    } else {
      return {
        status: 'too_high',
        message: `Too high! Try a lower number.`,
        correct: false
      };
    }
  }

  /**
   * Check if the game has ended
   * @returns {boolean} Whether the game is over
   */
  isGameOver() {
    return this.attempts >= this.maxAttempts;
  }

  /**
   * Get game statistics
   * @returns {object} Game statistics
   */
  getStats() {
    return {
      attempts: this.attempts,
      maxAttempts: this.maxAttempts,
      targetNumber: this.targetNumber
    };
  }
}

module.exports = NumberGuessingGame;