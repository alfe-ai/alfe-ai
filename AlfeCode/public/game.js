// Simple Guess the Number Game

document.addEventListener('DOMContentLoaded', function() {
    const gameContainer = document.getElementById('game-container');
    const messageElement = document.getElementById('message');
    const inputElement = document.getElementById('number-input');
    const submitButton = document.getElementById('submit-btn');
    const resetButton = document.getElementById('reset-btn');
    const attemptsElement = document.getElementById('attempts');
    
    let targetNumber, attempts = 0;
    const maxAttempts = 10;
    
    // Initialize game
    resetGame();
    
    function resetGame() {
        targetNumber = Math.floor(Math.random() * 100) + 1;
        attempts = 0;
        attemptsElement.textContent = attempts;
        messageElement.textContent = 'Guess a number between 1 and 100!';
        inputElement.value = '';
        inputElement.disabled = false;
        submitButton.disabled = false;
        resetButton.disabled = false;
    }
    
    function checkGuess() {
        const guess = parseInt(inputElement.value);
        
        if (isNaN(guess) || guess < 1 || guess > 100) {
            messageElement.textContent = 'Please enter a valid number between 1 and 100!';
            return;
        }
        
        attempts++;
        attemptsElement.textContent = attempts;
        
        if (guess === targetNumber) {
            messageElement.textContent = `Congratulations! You guessed the number ${targetNumber} in ${attempts} attempts!`;
            inputElement.disabled = true;
            submitButton.disabled = true;
            return;
        }
        
        if (attempts >= maxAttempts) {
            messageElement.textContent = `Game Over! The number was ${targetNumber}. Try again!`;
            inputElement.disabled = true;
            submitButton.disabled = true;
            return;
        }
        
        const hint = guess < targetNumber ? 'higher' : 'lower';
        messageElement.textContent = `Try again! The number is ${hint}. Attempts: ${attempts}`;
        inputElement.value = '';
    }
    
    submitButton.addEventListener('click', checkGuess);
    
    inputElement.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            checkGuess();
        }
    });
    
    resetButton.addEventListener('click', resetGame);
});