// Silly Memory Game - JavaScript Logic

// Game state
let cards = [];
let flippedCards = [];
let matchedPairs = 0;
let moves = 0;
let timer = 0;
let timerInterval = null;
let canFlip = true;

// Silly emojis for the game
const sillyEmojis = [
  '😀', '😂', '🥰', '😎', '🤩', '🥳', '😜', '🤪',
  '😇', '🤓', '🥺', '😭', '😡', '🤯', '🥶', '🤠'
];

// DOM elements
const gameBoard = document.getElementById('game-board');
const movesElement = document.getElementById('moves');
const timerElement = document.getElementById('timer');
const restartButton = document.getElementById('restart-btn');
const messageElement = document.getElementById('game-message');
const messageText = document.getElementById('message-text');

// Initialize the game
function initGame() {
  // Reset game state
  cards = [];
  flippedCards = [];
  matchedPairs = 0;
  moves = 0;
  timer = 0;
  canFlip = true;
  
  // Update displays
  movesElement.textContent = moves;
  timerElement.textContent = timer;
  messageElement.style.display = 'none';
  
  // Clear the game board
  gameBoard.innerHTML = '';
  
  // Reset timer
  if (timerInterval) {
    clearInterval(timerInterval);
  }
  
  // Start timer
  timerInterval = setInterval(() => {
    timer++;
    timerElement.textContent = timer;
  }, 1000);
  
  // Create card pairs
  let emojis = [...sillyEmojis.slice(0, 8), ...sillyEmojis.slice(0, 8)];
  emojis = emojis.sort(() => Math.random() - 0.5);
  
  // Create card elements
  emojis.forEach((emoji, index) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.index = index;
    card.dataset.emoji = emoji;
    card.innerHTML = `
      <div class="card-inner">
        <div class="card-front">❓</div>
        <div class="card-back">${emoji}</div>
      </div>
    `;
    
    card.addEventListener('click', flipCard);
    gameBoard.appendChild(card);
    cards.push(card);
  });
}

// Flip a card
function flipCard() {
  if (!canFlip || this.classList.contains('flipped') || this.classList.contains('matched')) return;
  
  // Start game on first click
  if (moves === 0) {
    moves = 1;
    movesElement.textContent = moves;
  }
  
  this.classList.add('flipped');
  flippedCards.push(this);
  
  if (flippedCards.length === 2) {
    moves++;
    movesElement.textContent = moves;
    canFlip = false;
    
    const card1 = flippedCards[0];
    const card2 = flippedCards[1];
    
    if (card1.dataset.emoji === card2.dataset.emoji) {
      // Match found
      card1.classList.add('matched');
      card2.classList.add('matched');
      matchedPairs++;
      
      // Check if all pairs are matched
      if (matchedPairs === 8) {
        endGame();
      } else {
        flippedCards = [];
        canFlip = true;
      }
    } else {
      // No match, flip back after delay
      setTimeout(() => {
        card1.classList.remove('flipped');
        card2.classList.remove('flipped');
        flippedCards = [];
        canFlip = true;
      }, 1000);
    }
  }
}

// End the game
function endGame() {
  clearInterval(timerInterval);
  
  // Show win message
  messageText.textContent = `🎉 Congratulations! You matched all pairs in ${moves} moves and ${timer} seconds!`;
  messageElement.style.display = 'block';
  
  // Disable card clicks
  cards.forEach(card => {
    card.removeEventListener('click', flipCard);
  });
}

// Event listeners
restartButton.addEventListener('click', initGame);

// Start the game when page loads
window.addEventListener('load', () => {
  initGame();
});