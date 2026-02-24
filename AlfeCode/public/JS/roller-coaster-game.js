// Roller Coaster Game JavaScript
document.addEventListener('DOMContentLoaded', () => {
    const gameArea = document.getElementById('gameArea');
    const train = document.getElementById('train');
    const startBtn = document.getElementById('startBtn');
    const resetBtn = document.getElementById('resetBtn');
    const speedDisplay = document.getElementById('speed');
    const heightDisplay = document.getElementById('height');
    const timeDisplay = document.getElementById('time');
    
    let gameRunning = false;
    let gameInterval;
    let position = 0;
    let speed = 0;
    let direction = 1; // 1 for forward, -1 for backward
    let time = 0;
    let lastTimestamp = 0;
    
    // Initialize game area
    function initGame() {
        position = 0;
        speed = 0;
        direction = 1;
        time = 0;
        updateDisplay();
        train.style.left = '0px';
    }
    
    // Update game display
    function updateDisplay() {
        speedDisplay.textContent = Math.abs(speed).toFixed(1);
        heightDisplay.textContent = Math.floor(Math.sin(position * 0.02) * 50 + 100);
        timeDisplay.textContent = time.toFixed(1);
    }
    
    // Game loop
    function gameLoop(timestamp) {
        if (!lastTimestamp) lastTimestamp = timestamp;
        const deltaTime = (timestamp - lastTimestamp) / 1000; // Convert to seconds
        lastTimestamp = timestamp;
        
        if (gameRunning) {
            // Update speed with acceleration/deceleration
            if (speed < 100 && direction === 1) {
                speed += 2 * deltaTime;
                if (speed > 100) speed = 100;
            } else if (speed > 0 && direction === -1) {
                speed -= 3 * deltaTime;
                if (speed < 0) speed = 0;
            }
            
            // Calculate position based on speed and direction
            position += speed * direction * deltaTime * 20;
            
            // Update train position
            train.style.left = position + 'px';
            
            // Change direction at track boundaries
            if (position > 600) {
                direction = -1;
            } else if (position < 0) {
                direction = 1;
            }
            
            // Track boundaries
            if (position > 600) {
                position = 600;
            } else if (position < 0) {
                position = 0;
            }
            
            time += deltaTime;
            updateDisplay();
        }
        
        gameInterval = requestAnimationFrame(gameLoop);
    }
    
    // Start the game
    startBtn.addEventListener('click', () => {
        if (!gameRunning) {
            gameRunning = true;
            startBtn.textContent = 'Pause Game';
        } else {
            gameRunning = false;
            startBtn.textContent = 'Resume Game';
        }
    });
    
    // Reset the game
    resetBtn.addEventListener('click', () => {
        gameRunning = false;
        startBtn.textContent = 'Start Game';
        initGame();
    });
    
    // Initialize the game
    initGame();
    
    // Start game loop
    gameInterval = requestAnimationFrame(gameLoop);
});