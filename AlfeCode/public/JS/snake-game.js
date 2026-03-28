// Snake Game JavaScript
class SnakeGame {
  constructor() {
    this.canvas = document.getElementById('game-board');
    this.ctx = this.canvas.getContext('2d');
    this.scoreElement = document.getElementById('score');
    this.highScoreElement = document.getElementById('high-score');
    this.startBtn = document.getElementById('start-btn');
    this.pauseBtn = document.getElementById('pause-btn');
    this.resetBtn = document.getElementById('reset-btn');
    
    this.gridSize = 20;
    this.tileCount = this.canvas.width / this.gridSize;
    
    this.snake = [];
    this.food = {};
    this.dx = 0;
    this.dy = 0;
    this.score = 0;
    this.highScore = localStorage.getItem('snakeHighScore') || 0;
    this.gameRunning = false;
    this.gamePaused = false;
    this.gameLoop = null;
    
    this.initializeGame();
    this.setupEventListeners();
  }
  
  initializeGame() {
    // Initialize the snake in the center of the board
    this.snake = [
      {x: 10, y: 10},
      {x: 9, y: 10},
      {x: 8, y: 10}
    ];
    
    this.generateFood();
    this.score = 0;
    this.dx = 1;
    this.dy = 0;
    
    this.updateScore();
    this.highScoreElement.textContent = this.highScore;
    this.draw();
  }
  
  setupEventListeners() {
    // Start button
    this.startBtn.addEventListener('click', () => {
      if (!this.gameRunning) {
        this.startGame();
      } else if (this.gamePaused) {
        this.resumeGame();
      }
    });
    
    // Pause button
    this.pauseBtn.addEventListener('click', () => {
      if (this.gameRunning && !this.gamePaused) {
        this.pauseGame();
      }
    });
    
    // Reset button
    this.resetBtn.addEventListener('click', () => {
      this.resetGame();
    });
    
    // Keyboard controls
    document.addEventListener('keydown', (e) => {
      // Prevent arrow keys from scrolling the page
      if ([37, 38, 39, 40, 65, 87, 68, 83].includes(e.keyCode)) {
        e.preventDefault();
      }
      
      // Only process key events when game is running
      if (!this.gameRunning) return;
      
      // Space key to pause/resume
      if (e.keyCode === 32) {
        if (this.gamePaused) {
          this.resumeGame();
        } else {
          this.pauseGame();
        }
        return;
      }
      
      // Prevent 180-degree turns
      switch (e.keyCode) {
        case 37: // Left arrow
        case 65: // A
          if (this.dx === 0) {
            this.dx = -1;
            this.dy = 0;
          }
          break;
        case 38: // Up arrow
        case 87: // W
          if (this.dy === 0) {
            this.dx = 0;
            this.dy = -1;
          }
          break;
        case 39: // Right arrow
        case 68: // D
          if (this.dx === 0) {
            this.dx = 1;
            this.dy = 0;
          }
          break;
        case 40: // Down arrow
        case 83: // S
          if (this.dy === 0) {
            this.dx = 0;
            this.dy = 1;
          }
          break;
      }
    });
  }
  
  startGame() {
    if (this.gameRunning) return;
    
    this.gameRunning = true;
    this.gamePaused = false;
    this.gameLoop = setInterval(() => {
      if (!this.gamePaused) {
        this.update();
        this.draw();
      }
    }, 100);
    
    this.startBtn.textContent = "Resume Game";
  }
  
  pauseGame() {
    this.gamePaused = true;
    this.pauseBtn.textContent = "Resume";
  }
  
  resumeGame() {
    this.gamePaused = false;
    this.pauseBtn.textContent = "Pause";
  }
  
  resetGame() {
    if (this.gameLoop) {
      clearInterval(this.gameLoop);
    }
    
    this.gameRunning = false;
    this.gamePaused = false;
    this.startBtn.textContent = "Start Game";
    this.pauseBtn.textContent = "Pause";
    
    this.initializeGame();
  }
  
  generateFood() {
    let newFood;
    let overlapping;
    
    do {
      overlapping = false;
      newFood = {
        x: Math.floor(Math.random() * this.tileCount),
        y: Math.floor(Math.random() * this.tileCount)
      };
      
      // Check if food is on snake
      for (let segment of this.snake) {
        if (segment.x === newFood.x && segment.y === newFood.y) {
          overlapping = true;
          break;
        }
      }
    } while (overlapping);
    
    this.food = newFood;
  }
  
  update() {
    // Move snake
    const head = {x: this.snake[0].x + this.dx, y: this.snake[0].y + this.dy};
    
    // Check wall collision
    if (head.x < 0 || head.x >= this.tileCount || head.y < 0 || head.y >= this.tileCount) {
      this.gameOver();
      return;
    }
    
    // Check self collision
    for (let i = 0; i < this.snake.length; i++) {
      if (this.snake[i].x === head.x && this.snake[i].y === head.y) {
        this.gameOver();
        return;
      }
    }
    
    // Add new head
    this.snake.unshift(head);
    
    // Check food collision
    if (this.food.x === head.x && this.food.y === head.y) {
      // Increase score
      this.score += 10;
      this.updateScore();
      
      // Generate new food
      this.generateFood();
    } else {
      // Remove tail if no food was eaten
      this.snake.pop();
    }
  }
  
  updateScore() {
    this.scoreElement.textContent = this.score;
    
    // Update high score if needed
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('snakeHighScore', this.highScore);
      this.highScoreElement.textContent = this.highScore;
    }
  }
  
  draw() {
    // Clear canvas
    this.ctx.fillStyle = '#0a0f18';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw grid
    this.ctx.strokeStyle = 'rgba(125, 211, 252, 0.1)';
    this.ctx.lineWidth = 0.5;
    for (let i = 0; i < this.tileCount; i++) {
      this.ctx.beginPath();
      this.ctx.moveTo(i * this.gridSize, 0);
      this.ctx.lineTo(i * this.gridSize, this.canvas.height);
      this.ctx.stroke();
      
      this.ctx.beginPath();
      this.ctx.moveTo(0, i * this.gridSize);
      this.ctx.lineTo(this.canvas.width, i * this.gridSize);
      this.ctx.stroke();
    }
    
    // Draw snake
    this.snake.forEach((segment, index) => {
      if (index === 0) {
        // Draw head with different color
        this.ctx.fillStyle = '#8a2be2';
      } else {
        // Draw body with gradient color
        const intensity = 150 + Math.floor(100 * (index / this.snake.length));
        this.ctx.fillStyle = `rgb(${intensity}, 100, ${intensity})`;
      }
      
      this.ctx.fillRect(
        segment.x * this.gridSize,
        segment.y * this.gridSize,
        this.gridSize - 1,
        this.gridSize - 1
      );
      
      // Add eyes to head
      if (index === 0) {
        this.ctx.fillStyle = '#000';
        
        // Draw eyes based on direction
        const eyeSize = this.gridSize / 5;
        if (this.dx === 1) { // Right
          this.ctx.fillRect(
            (segment.x + 0.7) * this.gridSize,
            (segment.y + 0.2) * this.gridSize,
            eyeSize,
            eyeSize
          );
          this.ctx.fillRect(
            (segment.x + 0.7) * this.gridSize,
            (segment.y + 0.6) * this.gridSize,
            eyeSize,
            eyeSize
          );
        } else if (this.dx === -1) { // Left
          this.ctx.fillRect(
            (segment.x + 0.2) * this.gridSize,
            (segment.y + 0.2) * this.gridSize,
            eyeSize,
            eyeSize
          );
          this.ctx.fillRect(
            (segment.x + 0.2) * this.gridSize,
            (segment.y + 0.6) * this.gridSize,
            eyeSize,
            eyeSize
          );
        } else if (this.dy === 1) { // Down
          this.ctx.fillRect(
            (segment.x + 0.2) * this.gridSize,
            (segment.y + 0.7) * this.gridSize,
            eyeSize,
            eyeSize
          );
          this.ctx.fillRect(
            (segment.x + 0.6) * this.gridSize,
            (segment.y + 0.7) * this.gridSize,
            eyeSize,
            eyeSize
          );
        } else if (this.dy === -1) { // Up
          this.ctx.fillRect(
            (segment.x + 0.2) * this.gridSize,
            (segment.y + 0.2) * this.gridSize,
            eyeSize,
            eyeSize
          );
          this.ctx.fillRect(
            (segment.x + 0.6) * this.gridSize,
            (segment.y + 0.2) * this.gridSize,
            eyeSize,
            eyeSize
          );
        }
      }
    });
    
    // Draw food
    this.ctx.fillStyle = '#ff4d4d';
    this.ctx.beginPath();
    this.ctx.arc(
      this.food.x * this.gridSize + this.gridSize/2,
      this.food.y * this.gridSize + this.gridSize/2,
      this.gridSize/2 - 2,
      0,
      Math.PI * 2
    );
    this.ctx.fill();
    
    // Add shine effect to food
    this.ctx.fillStyle = '#ffcccc';
    this.ctx.beginPath();
    this.ctx.arc(
      this.food.x * this.gridSize + this.gridSize/3,
      this.food.y * this.gridSize + this.gridSize/3,
      this.gridSize/6,
      0,
      Math.PI * 2
    );
    this.ctx.fill();
  }
  
  gameOver() {
    if (this.gameLoop) {
      clearInterval(this.gameLoop);
    }
    
    this.gameRunning = false;
    this.gamePaused = false;
    
    // Display game over message
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    this.ctx.fillStyle = '#ff4d4d';
    this.ctx.font = 'bold 30px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('Game Over!', this.canvas.width/2, this.canvas.height/2 - 20);
    
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '20px Arial';
    this.ctx.fillText(`Score: ${this.score}`, this.canvas.width/2, this.canvas.height/2 + 30);
    
    this.startBtn.textContent = "Start Game";
  }
}

// Initialize the game when page loads
document.addEventListener('DOMContentLoaded', () => {
  new SnakeGame();
});