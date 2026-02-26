// Game variables
let score = 0;
let lives = 3;
let gameActive = false;
let gameInterval;
let catPosition = { x: 400, y: 200 };
let fish = [];
let dogBones = [];
let keys = {};

// DOM Elements
const cat = document.getElementById('cat');
const scoreElement = document.getElementById('score');
const livesElement = document.getElementById('lives');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const restartBtn = document.getElementById('restartBtn');
const gameOverScreen = document.getElementById('gameOver');
const finalScoreElement = document.getElementById('finalScore');
const catContainer = document.querySelector('.cat-container');

// Initialize game
function initGame() {
    // Reset game state
    score = 0;
    lives = 3;
    gameActive = false;
    catPosition = { x: 400, y: 200 };
    
    // Update UI
    scoreElement.textContent = score;
    livesElement.textContent = lives;
    
    // Clear existing fish and dog bones
    fish = [];
    dogBones = [];
    clearItems();
    
    // Position cat in center
    updateCatPosition();
    
    // Hide game over screen
    gameOverScreen.classList.add('hidden');
    
    // Clear any existing intervals
    if (gameInterval) {
        clearInterval(gameInterval);
    }
    
    // Set up keyboard controls
    setupKeyboardControls();
}

// Setup keyboard controls
function setupKeyboardControls() {
    window.addEventListener('keydown', (e) => {
        keys[e.key] = true;
        
        // Prevent spacebar from scrolling
        if (e.key === ' ') {
            e.preventDefault();
        }
    });
    
    window.addEventListener('keyup', (e) => {
        keys[e.key] = false;
    });
}

// Update cat position based on keyboard input
function updateCatPosition() {
    cat.style.left = catPosition.x + 'px';
    cat.style.top = catPosition.y + 'px';
}

// Move cat based on keys pressed
function moveCat() {
    const speed = 5;
    
    if (keys['ArrowUp'] && catPosition.y > 0) {
        catPosition.y -= speed;
    }
    if (keys['ArrowDown'] && catPosition.y < 250) {
        catPosition.y += speed;
    }
    if (keys['ArrowLeft'] && catPosition.x > 0) {
        catPosition.x -= speed;
    }
    if (keys['ArrowRight'] && catPosition.x < 750) {
        catPosition.x += speed;
    }
    
    updateCatPosition();
}

// Create new fish item to collect
function createFish() {
    const fishElement = document.createElement('div');
    fishElement.className = 'item fish';
    fishElement.textContent = '🐟';
    fishElement.style.position = 'absolute';
    
    // Random position within container
    const x = Math.random() * 760;
    const y = Math.random() * 260;
    
    fishElement.style.left = x + 'px';
    fishElement.style.top = y + 'px';
    
    // Add to container and store reference
    catContainer.appendChild(fishElement);
    fish.push({
        element: fishElement,
        x: x,
        y: y,
        width: 40,
        height: 40
    });
}

// Create new dog bone item to avoid
function createDogBone() {
    const boneElement = document.createElement('div');
    boneElement.className = 'item dog-bone';
    boneElement.textContent = '🦴';
    boneElement.style.position = 'absolute';
    
    // Random position within container
    const x = Math.random() * 760;
    const y = Math.random() * 260;
    
    boneElement.style.left = x + 'px';
    boneElement.style.top = y + 'px';
    
    // Add to container and store reference
    catContainer.appendChild(boneElement);
    dogBones.push({
        element: boneElement,
        x: x,
        y: y,
        width: 40,
        height: 40
    });
}

// Remove all items from the game
function clearItems() {
    // Remove fish
    fish.forEach(f => f.element.remove());
    fish = [];
    
    // Remove dog bones
    dogBones.forEach(b => b.element.remove());
    dogBones = [];
}

// Check collisions between cat and items
function checkCollisions() {
    // Check fish collisions
    for (let i = fish.length - 1; i >= 0; i--) {
        const f = fish[i];
        if (checkCollision(catPosition, 40, 40, f)) {
            // Collect fish
            f.element.remove();
            fish.splice(i, 1);
            score += 10;
            scoreElement.textContent = score;
        }
    }
    
    // Check dog bone collisions
    for (let i = dogBones.length - 1; i >= 0; i--) {
        const b = dogBones[i];
        if (checkCollision(catPosition, 40, 40, b)) {
            // Hit by dog bone
            b.element.remove();
            dogBones.splice(i, 1);
            lives--;
            livesElement.textContent = lives;
            
            // Flash effect
            cat.style.color = 'red';
            setTimeout(() => { cat.style.color = 'black'; }, 200);
            
            if (lives <= 0) {
                endGame();
            }
        }
    }
}

// Simple collision detection
function checkCollision(position1, width1, height1, item) {
    return position1.x < item.x + item.width &&
           position1.x + width1 > item.x &&
           position1.y < item.y + item.height &&
           position1.y + height1 > item.y;
}

// Game loop
function gameLoop() {
    if (!gameActive) return;
    
    moveCat();
    checkCollisions();
    
    // Occasionally add new items
    if (Math.random() < 0.02 && fish.length < 5) {
        createFish();
    }
    
    if (Math.random() < 0.01 && dogBones.length < 3) {
        createDogBone();
    }
}

// Start the game
function startGame() {
    if (!gameActive) {
        gameActive = true;
        gameInterval = setInterval(gameLoop, 20);
        startBtn.textContent = 'Restart Game';
        startBtn.classList.add('active');
    } else {
        // Restart game
        initGame();
        startGame();
    }
}

// Pause the game
function pauseGame() {
    gameActive = !gameActive;
    pauseBtn.textContent = gameActive ? 'Pause' : 'Resume';
    
    if (gameActive) {
        gameInterval = setInterval(gameLoop, 20);
    } else {
        clearInterval(gameInterval);
    }
}

// Reset the game
function resetGame() {
    clearInterval(gameInterval);
    initGame();
    startBtn.textContent = 'Start Game';
    startBtn.classList.remove('active');
    pauseBtn.textContent = 'Pause';
}

// End the game
function endGame() {
    gameActive = false;
    clearInterval(gameInterval);
    
    finalScoreElement.textContent = score;
    gameOverScreen.classList.remove('hidden');
}

// Event listeners
startBtn.addEventListener('click', startGame);
pauseBtn.addEventListener('click', pauseGame);
resetBtn.addEventListener('click', resetGame);
restartBtn.addEventListener('click', () => {
    resetGame();
    startGame();
});

// Initialize the game
initGame();

// Handle window resize
window.addEventListener('resize', () => {
    // Adjust if needed
    catPosition.x = Math.min(catPosition.x, catContainer.clientWidth - 40);
    catPosition.y = Math.min(catPosition.y, catContainer.clientHeight - 40);
    updateCatPosition();
});