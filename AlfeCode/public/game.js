// Alfe AI Terminal Game
// A coding challenge game where players solve programming puzzles

const GAME_CONFIG = {
    levels: [
        {
            name: "Variables & Data Types",
            description: "Master the basics of programming fundamentals",
            challenges: [
                {
                    question: "What is the correct way to declare a variable in JavaScript?",
                    options: [
                        "var myVar = 'hello';",
                        "variable myVar = 'hello';",
                        "let myVar = 'hello';",
                        "const myVar = 'hello';"
                    ],
                    correct: 0,
                    explanation: "In JavaScript, you can use var, let, or const to declare variables. var is function-scoped, let and const are block-scoped."
                },
                {
                    question: "Which data type represents a sequence of characters?",
                    options: ["Number", "Boolean", "String", "Array"],
                    correct: 2,
                    explanation: "A String is a sequence of characters enclosed in quotes."
                },
                {
                    question: "What will typeof null return in JavaScript?",
                    options: ["null", "undefined", "object", "string"],
                    correct: 2,
                    explanation: "typeof null returns 'object' due to a historical bug in JavaScript."
                }
            ]
        },
        {
            name: "Functions & Logic",
            description: "Test your function knowledge and logical thinking",
            challenges: [
                {
                    question: "What is the output of: console.log(5 + '5')?",
                    options: ["10", "'55'", "Error", "NaN"],
                    correct: 1,
                    explanation: "When adding a number and a string, JavaScript converts the number to a string, resulting in '55'."
                },
                {
                    question: "Which keyword is used to exit a function early?",
                    options: ["break", "continue", "return", "exit"],
                    correct: 2,
                    explanation: "The return statement exits a function and optionally returns a value."
                },
                {
                    question: "What does the filter() method do?",
                    options: [
                        "Adds elements to an array",
                        "Removes elements from an array",
                        "Creates a new array with elements that pass a test",
                        "Sorts the array"
                    ],
                    correct: 2,
                    explanation: "filter() creates a new array containing only elements that pass the provided test function."
                }
            ]
        },
        {
            name: "Advanced Concepts",
            description: "Challenge yourself with advanced programming concepts",
            challenges: [
                {
                    question: "What is closure in JavaScript?",
                    options: [
                        "A way to close a browser window",
                        "A function that has access to variables from its outer scope",
                        "A method to clear memory",
                        "A type of loop"
                    ],
                    correct: 1,
                    explanation: "A closure is a function that retains access to variables from its enclosing lexical scope, even after the outer function has finished executing."
                },
                {
                    question: "What is the time complexity of binary search?",
                    options: ["O(1)", "O(log n)", "O(n)", "O(n²)"],
                    correct: 1,
                    explanation: "Binary search has O(log n) time complexity because it halves the search space with each comparison."
                },
                {
                    question: "What does async/await help with?",
                    options: [
                        "Synchronous code execution",
                        "Handling asynchronous operations",
                        "Memory management",
                        "Error handling only"
                    ],
                    correct: 1,
                    explanation: "async/await is syntactic sugar for handling promises, making asynchronous code look and behave more like synchronous code."
                }
            ]
        }
    ],
    lives: 3,
    pointsPerCorrectAnswer: 100
};

// Sound effects using Web Audio API
class SoundManager {
    constructor() {
        this.ctx = null;
        this.enabled = false;
    }
    
    init() {
        if (this.ctx) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.enabled = true;
        } catch (e) {
            console.log("Audio not supported");
        }
    }
    
    play(type) {
        if (!this.enabled || !this.ctx) return;
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        const now = this.ctx.currentTime;
        
        switch(type) {
            case 'correct':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, now);
                osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
                break;
                
            case 'wrong':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.exponentialRampToValueAtTime(100, now + 0.2);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
                osc.start(now);
                osc.stop(now + 0.2);
                break;
                
            case 'level':
                osc.type = 'square';
                osc.frequency.setValueAtTime(400, now);
                osc.frequency.setValueAtTime(600, now + 0.1);
                osc.frequency.setValueAtTime(800, now + 0.2);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
                break;
        }
    }
}

class AlfeTerminalGame {
    constructor() {
        this.currentLevel = 0;
        this.currentChallenge = 0;
        this.score = 0;
        this.lives = GAME_CONFIG.lives;
        this.gameOver = false;
        this.element = null;
        this.soundManager = new SoundManager();
        
        this.init();
    }
    
    init() {
        this.element = document.getElementById('game-container');
        if (!this.element) {
            console.error('Game container not found');
            return;
        }
        
        this.soundManager.init();
        this.render();
        this.bindEvents();
        
        // Add terminal typing effect
        this.typeTerminalMessage("System initializing...", "info");
        setTimeout(() => {
            this.typeTerminalMessage("Alfe AI Terminal Game v1.0 loaded", "success");
        }, 1000);
    }
    
    typeTerminalMessage(message, type) {
        const outputEl = this.element.querySelector('#terminal-output');
        const msgEl = document.createElement('div');
        msgEl.className = `terminal-message ${type}`;
        msgEl.textContent = `[${new Date().toLocaleTimeString()}] `;
        outputEl.appendChild(msgEl);
        
        let index = 0;
        const interval = setInterval(() => {
            if (index < message.length) {
                msgEl.textContent += message.charAt(index);
                index++;
            } else {
                clearInterval(interval);
            }
        }, 50);
        
        outputEl.scrollTop = outputEl.scrollHeight;
    }
    
    render() {
        if (this.gameOver) {
            this.renderGameOver();
            return;
        }
        
        const level = GAME_CONFIG.levels[this.currentLevel];
        const challenge = level.challenges[this.currentChallenge];
        
        this.element.innerHTML = `
            <div class="game-header">
                <h2>Alfe AI Terminal</h2>
                <div class="stats">
                    <span>Level: ${this.currentLevel + 1}/${GAME_CONFIG.levels.length}</span>
                    <span>Score: ${this.score}</span>
                    <span>Lives: ${this.lives}</span>
                </div>
            </div>
            
            <div class="level-info">
                <h3>${level.name}</h3>
                <p>${level.description}</p>
            </div>
            
            <div class="challenge-card">
                <div class="challenge-header">
                    <span class="challenge-number">Challenge ${this.currentChallenge + 1}/${level.challenges.length}</span>
                </div>
                <div class="question">
                    <p>${challenge.question}</p>
                </div>
                <div class="options">
                    ${challenge.options.map((option, index) => `
                        <button class="option-btn" data-index="${index}">
                            <span class="option-letter">${String.fromCharCode(65 + index)}</span>
                            <span class="option-text">${option}</span>
                        </button>
                    `).join('')}
                </div>
                <div class="explanation" id="explanation" style="display: none;"></div>
            </div>
            
            <div class="terminal-output" id="terminal-output"></div>
        `;
    }
    
    renderGameOver() {
        this.element.innerHTML = `
            <div class="game-over">
                <h2>Terminal Shutdown</h2>
                <div class="final-stats">
                    <p>Final Score: ${this.score}</p>
                    <p>Levels Completed: ${this.currentLevel}</p>
                </div>
                <div class="game-actions">
                    <button class="btn-restart" onclick="window.game.restart()">Restart Terminal</button>
                    <button class="btn-main-menu" onclick="window.game.goToMainMenu()">Main Menu</button>
                </div>
            </div>
        `;
    }
    
    bindEvents() {
        const options = this.element.querySelectorAll('.option-btn');
        options.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.handleAnswer(parseInt(e.target.closest('.option-btn').dataset.index));
            });
        });
    }
    
    handleAnswer(selectedIndex) {
        const level = GAME_CONFIG.levels[this.currentLevel];
        const challenge = level.challenges[this.currentChallenge];
        const isCorrect = selectedIndex === challenge.correct;
        
        this.showExplanation(challenge, isCorrect);
        
        if (isCorrect) {
            this.score += GAME_CONFIG.pointsPerCorrectAnswer;
            this.soundManager.play('correct');
            this.typeTerminalMessage(`✓ CORRECT! +${GAME_CONFIG.pointsPerCorrectAnswer} points`, 'success');
            
            setTimeout(() => {
                this.nextChallenge();
            }, 1500);
        } else {
            this.lives--;
            this.soundManager.play('wrong');
            this.typeTerminalMessage(`✗ WRONG! -1 life`, 'error');
            
            if (this.lives <= 0) {
                this.gameOver = true;
                this.soundManager.play('wrong');
                setTimeout(() => this.render(), 1500);
            } else {
                setTimeout(() => {
                    this.render();
                }, 1500);
            }
        }
    }
    
    showExplanation(challenge, isCorrect) {
        const explanationEl = this.element.querySelector('#explanation');
        explanationEl.innerHTML = `
            <div class="explanation-header">${isCorrect ? '✓ Correct' : '✗ Incorrect'}</div>
            <div class="explanation-text">${challenge.explanation}</div>
        `;
        explanationEl.style.display = 'block';
    }
    
    nextChallenge() {
        const level = GAME_CONFIG.levels[this.currentLevel];
        
        if (this.currentChallenge < level.challenges.length - 1) {
            this.currentChallenge++;
        } else {
            // Level completed
            this.soundManager.play('level');
            this.typeTerminalMessage(`Level ${this.currentLevel + 1} completed! +500 bonus points`, 'success');
            this.score += 500;
            this.currentChallenge = 0;
            
            if (this.currentLevel < GAME_CONFIG.levels.length - 1) {
                this.currentLevel++;
                setTimeout(() => {
                    this.typeTerminalMessage('Loading next level...', 'info');
                    setTimeout(() => this.render(), 1000);
                }, 1000);
            } else {
                // Game completed
                this.gameOver = true;
                setTimeout(() => this.render(), 2000);
            }
        }
        
        this.render();
    }
    
    restart() {
        this.currentLevel = 0;
        this.currentChallenge = 0;
        this.score = 0;
        this.lives = GAME_CONFIG.lives;
        this.gameOver = false;
        this.render();
        this.typeTerminalMessage("Terminal rebooting...", "info");
    }
    
    goToMainMenu() {
        window.location.href = '/games';
    }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.game = new AlfeTerminalGame();
});