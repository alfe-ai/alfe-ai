const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');
const finalScoreDisplay = document.getElementById('finalScore');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const gameOverDisplay = document.getElementById('gameOver');

// Game settings
const gridSize = 20;
const tileCount = canvas.width / gridSize;

// Game state
let snake = [];
let food = {};
let dx = 0;
let dy = 0;
let score = 0;
let gameRunning = false;
let gameLoop;

// Initialize game
function initGame() {
    // Initial snake position (center of canvas)
    snake = [
        {x: 10, y: 10}, // Head
        {x: 9, y: 10},
        {x: 8, y: 10}  // Tail
    ];
    
    // Initial food position
    placeFood();
    
    // Initial direction (right)
    dx = 1;
    dy = 0;
    
    // Reset score
    score = 0;
    scoreDisplay.textContent = score;
    
    // Hide game over message
    gameOverDisplay.classList.add('hidden');
}

// Place food at random position
function placeFood() {
    food = {
        x: Math.floor(Math.random() * tileCount),
        y: Math.floor(Math.random() * tileCount)
    };
    
    // Make sure food doesn't appear on snake
    for (let segment of snake) {
        if (segment.x === food.x && segment.y === food.y) {
            placeFood();
            break;
        }
    }
}

// Draw game elements
function draw() {
    // Clear canvas
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw snake
    ctx.fillStyle = '#4CAF50';
    for (let segment of snake) {
        ctx.fillRect(segment.x * gridSize, segment.y * gridSize, gridSize - 2, gridSize - 2);
    }
    
    // Draw head in different color
    ctx.fillStyle = '#8BC34A';
    ctx.fillRect(snake[0].x * gridSize, snake[0].y * gridSize, gridSize - 2, gridSize - 2);
    
    // Draw food
    ctx.fillStyle = '#f44336';
    ctx.fillRect(food.x * gridSize, food.y * gridSize, gridSize - 2, gridSize - 2);
}

// Move snake
function move() {
    // Calculate new head position
    const head = {x: snake[0].x + dx, y: snake[0].y + dy};
    
    // Check wall collision
    if (head.x < 0 || head.x >= tileCount || head.y < 0 || head.y >= tileCount) {
        gameOver();
        return;
    }
    
    // Check self collision
    for (let segment of snake) {
        if (segment.x === head.x && segment.y === head.y) {
            gameOver();
            return;
        }
    }
    
    // Add new head
    snake.unshift(head);
    
    // Check food collision
    if (head.x === food.x && head.y === food.y) {
        // Increase score
        score += 10;
        scoreDisplay.textContent = score;
        
        // Place new food
        placeFood();
    } else {
        // Remove tail if no food was eaten
        snake.pop();
    }
}

// Game loop
function gameUpdate() {
    move();
    draw();
}

// Start game
function startGame() {
    if (!gameRunning) {
        gameRunning = true;
        gameLoop = setInterval(gameUpdate, 100);
        startBtn.textContent = 'Start Game';
    } else {
        gameRunning = false;
        clearInterval(gameLoop);
        startBtn.textContent = 'Resume';
    }
}

// Reset game
function resetGame() {
    clearInterval(gameLoop);
    gameRunning = false;
    startBtn.textContent = 'Start Game';
    initGame();
    draw();
}

// Game over
function gameOver() {
    clearInterval(gameLoop);
    gameRunning = false;
    startBtn.textContent = 'Start Game';
    finalScoreDisplay.textContent = score;
    gameOverDisplay.classList.remove('hidden');
}

// Handle keyboard input
document.addEventListener('keydown', e => {
    // Prevent arrow keys from scrolling the page
    if ([37, 38, 39, 40].includes(e.keyCode)) {
        e.preventDefault();
    }
    
    // Only change direction if game is running
    if (!gameRunning) return;
    
    // Left arrow
    if (e.keyCode === 37 && dx === 0) {
        dx = -1;
        dy = 0;
    }
    // Up arrow
    else if (e.keyCode === 38 && dy === 0) {
        dx = 0;
        dy = -1;
    }
    // Right arrow
    else if (e.keyCode === 39 && dx === 0) {
        dx = 1;
        dy = 0;
    }
    // Down arrow
    else if (e.keyCode === 40 && dy === 0) {
        dx = 0;
        dy = 1;
    }
});

// Button event listeners
startBtn.addEventListener('click', startGame);
resetBtn.addEventListener('click', resetGame);

// Initialize game
initGame();
draw();
