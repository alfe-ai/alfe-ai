// Snake game implementation
let canvas, ctx, snake, food, direction, nextDirection, score, gameSpeed, gameRunning, gameLoop;

function initGame(canvasElement) {
    canvas = canvasElement;
    ctx = canvas.getContext('2d');
    
    // Initialize game state
    initGameState();
    
    // Start the game loop
    gameRunning = true;
    gameLoop = setInterval(update, gameSpeed);
    
    // Setup keyboard controls
    setupControls();
    
    // Draw initial state
    draw();
}

function initGameState() {
    // Game settings
    const gridSize = 20;
    const gridWidth = canvas.width / gridSize;
    const gridHeight = canvas.height / gridSize;
    
    // Snake starting position
    snake = [
        {x: 10, y: 10},
        {x: 9, y: 10},
        {x: 8, y: 10}
    ];
    
    // Set initial direction
    direction = 'right';
    nextDirection = 'right';
    
    // Initialize score and speed
    score = 0;
    gameSpeed = 100; // ms
    
    // Generate first food
    generateFood(gridWidth, gridHeight);
}

function generateFood(gridWidth, gridHeight) {
    // Generate a random position for the food
    let newFood;
    let overlapping = true;
    
    // Keep generating until we find a spot not occupied by the snake
    while (overlapping) {
        overlapping = false;
        newFood = {
            x: Math.floor(Math.random() * gridWidth),
            y: Math.floor(Math.random() * gridHeight)
        };
        
        // Check if food overlaps with snake
        for (let segment of snake) {
            if (segment.x === newFood.x && segment.y === newFood.y) {
                overlapping = true;
                break;
            }
        }
    }
    
    food = newFood;
}

function update() {
    if (!gameRunning) return;
    
    // Update direction
    direction = nextDirection;
    
    // Calculate new head position based on direction
    const head = {x: snake[0].x, y: snake[0].y};
    
    switch (direction) {
        case 'up':
            head.y--;
            break;
        case 'down':
            head.y++;
            break;
        case 'left':
            head.x--;
            break;
        case 'right':
            head.x++;
            break;
    }
    
    // Check for collisions with walls
    if (head.x < 0 || head.x >= canvas.width / 20 || head.y < 0 || head.y >= canvas.height / 20) {
        gameOver();
        return;
    }
    
    // Check for collisions with self
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
        
        // Update score display
        document.getElementById('score').textContent = 'Score: ' + score;
        
        // Generate new food
        generateFood(canvas.width / 20, canvas.height / 20);
        
        // Increase speed slightly
        if (gameSpeed > 50) {
            gameSpeed -= 2;
            clearInterval(gameLoop);
            gameLoop = setInterval(update, gameSpeed);
        }
    } else {
        // Remove tail if no food eaten
        snake.pop();
    }
    
    // Draw everything
    draw();
}

function draw() {
    // Clear canvas
    ctx.fillStyle = '#ecf0f1';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw snake
    snake.forEach((segment, index) => {
        if (index === 0) {
            // Draw head differently
            ctx.fillStyle = '#27ae60';
        } else {
            ctx.fillStyle = '#2ecc71';
        }
        ctx.fillRect(segment.x * 20, segment.y * 20, 20, 20);
        
        // Add border to segments
        ctx.strokeStyle = '#1e8449';
        ctx.strokeRect(segment.x * 20, segment.y * 20, 20, 20);
    });
    
    // Draw food
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(food.x * 20, food.y * 20, 20, 20);
    
    // Add a shine effect to food
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(food.x * 20 + 5, food.y * 20 + 5, 10, 10);
}

function setupControls() {
    // Handle keyboard input
    document.addEventListener('keydown', (e) => {
        // Prevent arrow keys from scrolling the page
        if ([37, 38, 39, 40].includes(e.keyCode)) {
            e.preventDefault();
        }
        
        // Prevent 180-degree turns
        switch (e.keyCode) {
            case 38: // up
                if (direction !== 'down') nextDirection = 'up';
                break;
            case 40: // down
                if (direction !== 'up') nextDirection = 'down';
                break;
            case 37: // left
                if (direction !== 'right') nextDirection = 'left';
                break;
            case 39: // right
                if (direction !== 'left') nextDirection = 'right';
                break;
        }
    });
}

function gameOver() {
    gameRunning = false;
    clearInterval(gameLoop);
    
    // Show game over screen
    const gameOverScreen = document.getElementById('game-over');
    document.getElementById('final-score').textContent = 'Score: ' + score;
    gameOverScreen.style.display = 'block';
}