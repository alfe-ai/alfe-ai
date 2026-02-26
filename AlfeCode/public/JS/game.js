// Game functionality
document.addEventListener('DOMContentLoaded', function() {
    const guessInput = document.getElementById('guess-input');
    const submitButton = document.getElementById('submit-guess');
    const newGameButton = document.getElementById('new-game');
    const attemptsElement = document.getElementById('attempts');
    const guessesElement = document.getElementById('guesses');
    const messageElement = document.getElementById('message');
    const resultElement = document.getElementById('result');
    
    let gameData = null;
    
    // Start a new game
    function startNewGame() {
        fetch('/game/new', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            gameData = data;
            updateUI();
            messageElement.textContent = 'Enter your guess!';
            messageElement.className = 'message';
            resultElement.textContent = '';
        })
        .catch(error => {
            console.error('Error starting new game:', error);
            messageElement.textContent = 'Error starting game. Try again.';
            messageElement.className = 'message error';
        });
    }
    
    // Submit a guess
    function submitGuess() {
        if (!gameData) {
            messageElement.textContent = 'Please start a new game first.';
            messageElement.className = 'message error';
            return;
        }
        
        const guess = parseInt(guessInput.value);
        
        if (isNaN(guess) || guess < 1 || guess > 100) {
            messageElement.textContent = 'Please enter a valid number between 1 and 100.';
            messageElement.className = 'message error';
            return;
        }
        
        fetch('/game/guess', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                guess: guess,
                targetNumber: gameData.targetNumber,
                attempts: gameData.attempts,
                guesses: gameData.guesses
            })
        })
        .then(response => response.json())
        .then(data => {
            gameData = {
                targetNumber: gameData.targetNumber,
                maxNumber: gameData.maxNumber,
                attempts: data.attempts,
                guesses: data.guesses
            };
            
            updateUI();
            
            // Display message based on result
            messageElement.textContent = data.message;
            messageElement.className = 'message ' + data.result;
            
            if (data.result === 'correct') {
                resultElement.textContent = `🎉 Congratulations! You guessed the number in ${data.attempts} attempts!`;
                resultElement.className = 'result correct';
            }
        })
        .catch(error => {
            console.error('Error submitting guess:', error);
            messageElement.textContent = 'Error submitting guess. Try again.';
            messageElement.className = 'message error';
        });
        
        // Clear input
        guessInput.value = '';
        guessInput.focus();
    }
    
    // Update UI with game data
    function updateUI() {
        attemptsElement.textContent = gameData.attempts;
        guessesElement.textContent = gameData.guesses.join(', ') || '-';
    }
    
    // Event listeners
    submitButton.addEventListener('click', submitGuess);
    newGameButton.addEventListener('click', startNewGame);
    
    // Allow Enter key to submit guess
    guessInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            submitGuess();
        }
    });
    
    // Start a new game when page loads
    startNewGame();
});