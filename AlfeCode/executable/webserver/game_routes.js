const path = require("path");

function setupGameRoutes({ app, PROJECT_ROOT }) {
    // Route to serve game page
    app.get("/game", (req, res) => {
        res.render("game", { 
            title: "Number Guessing Game",
            sessionId: req.sessionId
        });
    });
    
    // API endpoint to start a new game
    app.post("/game/new", (req, res) => {
        const maxNumber = 100;
        const targetNumber = Math.floor(Math.random() * maxNumber) + 1;
        const gameData = {
            targetNumber: targetNumber,
            maxNumber: maxNumber,
            attempts: 0,
            guesses: []
        };
        res.json(gameData);
    });
    
    // API endpoint to check a guess
    app.post("/game/guess", (req, res) => {
        const { guess, targetNumber, attempts, guesses } = req.body;
        const newAttempts = attempts + 1;
        const newGuesses = [...guesses, guess];
        
        let response = {
            guess: guess,
            attempts: newAttempts,
            guesses: newGuesses
        };
        
        if (guess === targetNumber) {
            response.result = "correct";
            response.message = `Congratulations! You guessed the number ${targetNumber} in ${newAttempts} attempts!`;
        } else if (guess < targetNumber) {
            response.result = "tooLow";
            response.message = "Too low! Try a higher number.";
        } else {
            response.result = "tooHigh";
            response.message = "Too high! Try a lower number.";
        }
        
        res.json(response);
    });
}

module.exports = { setupGameRoutes };