// Snake Game JavaScript
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const scoreDisplay = document.getElementById('score');
    const highScoreDisplay = document.getElementById('high-score');
    const finalScoreDisplay = document.getElementById('final-score');
    const startBtn = document.getElementById('start-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const restartBtn = document.getElementById('restart-btn');
    const playAgainBtn = document.getElementById('play-again');
    const gameOverScreen = document.getElementById('game-over');

    // Game settings
    const gridSize = 20;
    const gridWidth = canvas.width / gridSize;
    const gridHeight = canvas.height / gridSize;
    
    // Game state
    let snake = [];
    let food = {};
    let direction = 'right';
    let nextDirection = 'right';
    let score = 0;
    let highScore = localStorage.getItem('snakeHighScore') || 0;
    let gameSpeed = 100; // milliseconds
    let gameRunning = false;
    let gameLoop;

    // Initialize high score display
    highScoreDisplay.textContent = highScore;

    // Initialize game
    function initGame() {
        // Initial snake position (center of canvas)
        snake = [
            {x: 10, y: 10},
            {x: 9, y: 10},
            {x: 8, y: 10}
        ];
        
        generateFood();
        score = 0;
        scoreDisplay.textContent = score;
        direction = 'right';
        nextDirection = 'right';
        gameOverScreen.classList.add('hidden');
    }

    // Generate food at random position
    function generateFood() {
        food = {
            x: Math.floor(Math.random() * gridWidth),
            y: Math.floor(Math.random() * gridHeight)
        };

        // Make sure food doesn't appear on snake
        for (let segment of snake) {
            if (segment.x === food.x && segment.y === food.y) {
                return generateFood();
            }
        }
    }

    // Draw game elements
    function draw() {
        // Clear canvas
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw snake
        snake.forEach((segment, index) => {
            if (index === 0) {
                // Draw head differently
                ctx.fillStyle = '#4CAF50';
            } else {
                // Draw body
                ctx.fillStyle = '#8BC34A';
            }
            ctx.fillRect(segment.x * gridSize, segment.y * gridSize, gridSize - 1, gridSize - 1);
        });
        
        // Draw food
        ctx.fillStyle = '#FF5252';
        ctx.fillRect(food.x * gridSize, food.y * gridSize, gridSize - 1, gridSize - 1);
    }

    // Update game state
    function update() {
        // Update direction
        direction = nextDirection;
        
        // Create new head based on direction
        const head = {x: snake[0].x, y: snake[0].y};
        
        switch (direction) {
            case 'up':
                head.y -= 1;
                break;
            case 'down':
                head.y += 1;
                break;
            case 'left':
                head.x -= 1;
                break;
            case 'right':
                head.x += 1;
                break;
        }
        
        // Check collision with walls
        if (head.x < 0 || head.x >= gridWidth || head.y < 0 || head.y >= gridHeight) {
            gameOver();
            return;
        }
        
        // Check collision with self
        for (let i = 0; i < snake.length; i++) {
            if (snake[i].x === head.x && snake[i].y === head.y) {
                gameOver();
                return;
            }
        }
        
        // Add new head to snake
        snake.unshift(head);
        
        // Check if food is eaten
        if (head.x === food.x && head.y === food.y) {
            // Increase score
            score += 10;
            scoreDisplay.textContent = score;
            
            // Generate new food
            generateFood();
            
            // Increase speed slightly (but cap it)
            if (gameSpeed > 50) {
                gameSpeed -= 2;
            }
        } else {
            // Remove tail if no food eaten
            snake.pop();
        }
    }

    // Game loop
    function runGame() {
        update();
        draw();
    }

    // Start the game
    function startGame() {
        if (!gameRunning) {
            gameRunning = true;
            startBtn.disabled = true;
            pauseBtn.disabled = false;
            gameLoop = setInterval(runGame, gameSpeed);
        }
    }

    // Pause the game
    function pauseGame() {
        if (gameRunning) {
            gameRunning = false;
            clearInterval(gameLoop);
            startBtn.disabled = false;
            pauseBtn.disabled = true;
        } else {
            startGame();
        }
    }

    // Game over
    function gameOver() {
        gameRunning = false;
        clearInterval(gameLoop);
        startBtn.disabled = false;
        pauseBtn.disabled = true;
        
        // Update high score if needed
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('snakeHighScore', highScore);
            highScoreDisplay.textContent = highScore;
        }
        
        // Show game over screen
        finalScoreDisplay.textContent = score;
        gameOverScreen.classList.remove('hidden');
    }

    // Event listeners for buttons
    startBtn.addEventListener('click', startGame);
    pauseBtn.addEventListener('click', pauseGame);
    restartBtn.addEventListener('click', () => {
        clearInterval(gameLoop);
        initGame();
        startGame();
    });
    playAgainBtn.addEventListener('click', () => {
        initGame();
        startGame();
    });

    // Keyboard controls
    document.addEventListener('keydown', (e) => {
        // Prevent arrow keys from scrolling page
        if ([37, 38, 39, 40, 32].includes(e.keyCode)) {
            e.preventDefault();
        }
        
        switch (e.keyCode) {
            case 38: // Up arrow
                if (direction !== 'down') nextDirection = 'up';
                break;
            case 40: // Down arrow
                if (direction !== 'up') nextDirection = 'down';
                break;
            case 37: // Left arrow
                if (direction !== 'right') nextDirection = 'left';
                break;
            case 39: // Right arrow
                if (direction !== 'left') nextDirection = 'right';
                break;
            case 32: // Spacebar
                pauseGame();
                break;
        }
    });

    // Initialize and draw initial state
    initGame();
    draw();
});