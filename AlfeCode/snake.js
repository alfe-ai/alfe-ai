#!/usr/bin/env node

// Snake Game Implementation
const readline = require('readline');
const { stdin: input, stdout: output } = require('process');

// Setup readline interface for input/output
const rl = readline.createInterface({ input, output });
rl.pause(); // Pause until game starts

// Game constants
const BOARD_WIDTH = 20;
const BOARD_HEIGHT = 20;
const INITIAL_SNAKE_LENGTH = 3;
const INITIAL_SPEED = 150; // milliseconds between moves

// Game state
let snake = [];
let food = {};
let direction = 'right';
let nextDirection = 'right';
let score = 0;
let gameInterval;
let isGameOver = false;
let speed = INITIAL_SPEED;

// Initialize game board
function initGame() {
    // Create initial snake (horizontal, starting from left)
    snake = [];
    for (let i = 0; i < INITIAL_SNAKE_LENGTH; i++) {
        snake.push({ x: 5 - i, y: 10 });
    }
    
    // Set initial direction
    direction = 'right';
    nextDirection = 'right';
    
    // Place first food
    placeFood();
    
    // Reset game state
    score = 0;
    isGameOver = false;
    speed = INITIAL_SPEED;
}

// Place food at random location (not on snake)
function placeFood() {
    let newFood;
    let onSnake;
    
    do {
        onSnake = false;
        newFood = {
            x: Math.floor(Math.random() * BOARD_WIDTH),
            y: Math.floor(Math.random() * BOARD_HEIGHT)
        };
        
        // Check if food is on snake
        for (let segment of snake) {
            if (segment.x === newFood.x && segment.y === newFood.y) {
                onSnake = true;
                break;
            }
        }
    } while (onSnake);
    
    food = newFood;
}

// Draw the game board
function drawBoard() {
    // Clear screen
    console.clear();
    
    // Create board array
    const board = Array(BOARD_HEIGHT).fill().map(() => Array(BOARD_WIDTH).fill(' '));
    
    // Draw snake
    snake.forEach((segment, index) => {
        const char = index === 0 ? 'O' : 'o'; // Head is 'O', body is 'o'
        if (segment.x >= 0 && segment.x < BOARD_WIDTH && segment.y >= 0 && segment.y < BOARD_HEIGHT) {
            board[segment.y][segment.x] = char;
        }
    });
    
    // Draw food
    if (food.x >= 0 && food.x < BOARD_WIDTH && food.y >= 0 && food.y < BOARD_HEIGHT) {
        board[food.y][food.x] = 'X';
    }
    
    // Draw borders
    console.log('+'.repeat(BOARD_WIDTH + 2));
    board.forEach(row => {
        console.log('|' + row.join('') + '|');
    });
    console.log('+'.repeat(BOARD_WIDTH + 2));
    
    // Print score
    console.log(`Score: ${score}`);
    
    // Print instructions
    console.log('\nControls: w/a/s/d to move, q to quit');
}

// Move snake in current direction
function moveSnake() {
    if (isGameOver) return;
    
    // Update direction
    direction = nextDirection;
    
    // Create new head based on direction
    const head = { ...snake[0] };
    
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
    if (head.x < 0 || head.x >= BOARD_WIDTH || head.y < 0 || head.y >= BOARD_HEIGHT) {
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
    
    // Add new head
    snake.unshift(head);
    
    // Check if food is eaten
    if (head.x === food.x && head.y === food.y) {
        // Increase score
        score += 10;
        
        // Increase speed slightly
        if (speed > 50) {
            speed -= 2;
        }
        
        // Place new food
        placeFood();
    } else {
        // Remove tail if no food eaten
        snake.pop();
    }
    
    drawBoard();
}

// Handle keyboard input
function handleInput(key) {
    // Quit game
    if (key === 'q' || key === '\u0003') { // 'q' or Ctrl+C
        console.log('\nThanks for playing!');
        process.exit(0);
    }
    
    // Change direction (prevent 180-degree turns)
    switch (key) {
        case 'w':
            if (direction !== 'down') nextDirection = 'up';
            break;
        case 's':
            if (direction !== 'up') nextDirection = 'down';
            break;
        case 'a':
            if (direction !== 'right') nextDirection = 'left';
            break;
        case 'd':
            if (direction !== 'left') nextDirection = 'right';
            break;
    }
}

// Game over function
function gameOver() {
    isGameOver = true;
    clearInterval(gameInterval);
    console.clear();
    console.log('Game Over!');
    console.log(`Final Score: ${score}`);
    console.log('Press any key to exit...');
    rl.resume();
    rl.on('line', () => {
        process.exit(0);
    });
}

// Start the game
function startGame() {
    console.log('Starting Snake Game...');
    console.log('Use WASD keys to control the snake');
    console.log('Press any key to start...');
    
    rl.on('line', () => {
        initGame();
        drawBoard();
        
        // Start game loop
        gameInterval = setInterval(moveSnake, speed);
        
        // Setup input handling
        rl.resume();
        rl.on('line', (input) => handleInput(input.toLowerCase()));
    });
}

// Setup input handling
process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');

// Listen for input
process.stdin.on('data', (key) => {
    if (!rl.isPaused()) {
        handleInput(key);
    }
});

// Start the game
startGame();