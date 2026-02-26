// Cat Game JavaScript

// Game variables
let score = 0;
let cats = 0;
let timeLeft = 60;
let gameActive = false;
let gameTimer;
let catMoveTimer;
let items = [];

// DOM elements
const scoreElement = document.getElementById('score');
const catsElement = document.getElementById('cats');
const timeElement = document.getElementById('time');
const catElement = document.getElementById('cat');
const itemsContainer = document.getElementById('items-container');
const messageBox = document.getElementById('message-box');
const messageText = document.getElementById('message-text');
const restartButton = document.getElementById('restart-btn');
const gameArea = document.getElementById('game-area');

// Initialize the game
function initGame() {
    // Reset game state
    score = 0;
    cats = 0;
    timeLeft = 60;
    gameActive = true;
    
    // Update UI
    scoreElement.textContent = score;
    catsElement.textContent = cats;
    timeElement.textContent = timeLeft;
    
    // Hide message box
    messageBox.classList.add('hidden');
    
    // Remove existing items
    itemsContainer.innerHTML = '';
    items = [];
    
    // Position cat randomly
    moveCat();
    
    // Start timers
    if (gameTimer) clearInterval(gameTimer);
    if (catMoveTimer) clearInterval(catMoveTimer);
    
    gameTimer = setInterval(updateTimer, 1000);
    catMoveTimer = setInterval(moveCat, 3000);
    
    // Create initial items
    createItems(5);
}

// Move cat to random position
function moveCat() {
    if (!gameActive) return;
    
    const gameRect = gameArea.getBoundingClientRect();
    const maxX = gameRect.width - catElement.offsetWidth;
    const maxY = gameRect.height - catElement.offsetHeight;
    
    const randomX = Math.floor(Math.random() * maxX);
    const randomY = Math.floor(Math.random() * maxY);
    
    catElement.style.left = randomX + 'px';
    catElement.style.top = randomY + 'px';
}

// Create cat items (treats)
function createItems(count) {
    for (let i = 0; i < count; i++) {
        createItem();
    }
}

// Create a single item
function createItem() {
    if (!gameActive) return;
    
    const item = document.createElement('div');
    item.className = 'item';
    
    const gameRect = gameArea.getBoundingClientRect();
    const maxX = gameRect.width - 40;
    const maxY = gameRect.height - 40;
    
    const randomX = Math.floor(Math.random() * maxX);
    const randomY = Math.floor(Math.random() * maxY);
    
    item.style.left = randomX + 'px';
    item.style.top = randomY + 'px';
    
    // Add click event to item
    item.addEventListener('click', () => {
        if (!gameActive) return;
        
        // Increase score and cats
        score += 10;
        cats += 1;
        
        // Update UI
        scoreElement.textContent = score;
        catsElement.textContent = cats;
        
        // Remove item
        item.remove();
        items = items.filter(item => item !== item);
        
        // Create new item after delay
        setTimeout(createItem, 500);
        
        // Add visual feedback
        item.style.animation = 'none';
        item.style.transform = 'scale(1.5)';
        setTimeout(() => {
            item.style.animation = 'float 2s infinite ease-in-out';
            item.style.transform = 'scale(1)';
        }, 100);
    });
    
    itemsContainer.appendChild(item);
    items.push(item);
}

// Update game timer
function updateTimer() {
    if (!gameActive) return;
    
    timeLeft--;
    timeElement.textContent = timeLeft;
    
    if (timeLeft <= 0) {
        endGame();
    }
}

// End the game
function endGame() {
    gameActive = false;
    clearInterval(gameTimer);
    clearInterval(catMoveTimer);
    
    // Show game over message
    messageText.textContent = `Game Over! Your final score: ${score} points`;
    messageBox.classList.remove('hidden');
    
    // Clear all items
    itemsContainer.innerHTML = '';
    items = [];
    
    // Remove cat
    catElement.style.display = 'none';
}

// Event listeners
catElement.addEventListener('click', () => {
    if (!gameActive) return;
    
    // Add visual feedback
    catElement.style.transform = 'scale(0.9)';
    setTimeout(() => {
        catElement.style.transform = 'scale(1)';
    }, 100);
    
    // Increase score
    score += 5;
    scoreElement.textContent = score;
    
    // Move cat
    moveCat();
});

restartButton.addEventListener('click', initGame);

// Initialize game when page loads
window.addEventListener('load', () => {
    initGame();
});