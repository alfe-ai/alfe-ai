// PlayDoh Game JavaScript
class PlayDohGame {
    constructor() {
        this.canvas = document.getElementById('playdohCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.currentColor = '#FF6B6B';
        this.brushSize = 15;
        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;
        this.activeColorElement = document.getElementById('currentColor');
        this.activeColorName = document.getElementById('activeColorName');
        this.brushSizeElement = document.getElementById('brushSize');
        
        // Set canvas size to match its display size
        this.resizeCanvas();
        
        // Initialize game
        this.init();
    }
    
    init() {
        // Set initial color display
        this.updateColorDisplay();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Draw initial background
        this.drawBackground();
    }
    
    resizeCanvas() {
        // Set canvas dimensions to match its display dimensions
        const displayWidth = this.canvas.clientWidth;
        const displayHeight = this.canvas.clientHeight;
        
        if (this.canvas.width !== displayWidth || this.canvas.height !== displayHeight) {
            this.canvas.width = displayWidth;
            this.canvas.height = displayHeight;
            this.drawBackground();
        }
    }
    
    drawBackground() {
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Add subtle grid pattern
        this.ctx.strokeStyle = '#f0f0f0';
        this.ctx.lineWidth = 1;
        
        // Vertical lines
        for (let x = 0; x < this.canvas.width; x += 20) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        
        // Horizontal lines
        for (let y = 0; y < this.canvas.height; y += 20) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    }
    
    setupEventListeners() {
        // Mouse events
        this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
        this.canvas.addEventListener('mousemove', this.draw.bind(this));
        this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
        this.canvas.addEventListener('mouseout', this.stopDrawing.bind(this));
        
        // Touch events for mobile
        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
        this.canvas.addEventListener('touchend', this.stopDrawing.bind(this));
        
        // Color selection
        document.querySelectorAll('.color-option').forEach(option => {
            option.addEventListener('click', (e) => {
                this.selectColor(e.target.dataset.color);
                this.updateActiveColor();
            });
        });
        
        // Clear button
        document.getElementById('clearBtn').addEventListener('click', () => {
            this.clearCanvas();
        });
        
        // Download button
        document.getElementById('downloadBtn').addEventListener('click', () => {
            this.downloadArt();
        });
        
        // Brush size controls
        document.getElementById('brushSizePlus').addEventListener('click', () => {
            this.changeBrushSize(5);
        });
        
        document.getElementById('brushSizeMinus').addEventListener('click', () => {
            this.changeBrushSize(-5);
        });
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.resizeCanvas();
            // Redraw canvas content after resize
            this.drawBackground();
        });
    }
    
    selectColor(color) {
        this.currentColor = color;
        this.updateColorDisplay();
    }
    
    updateColorDisplay() {
        this.activeColorElement.style.backgroundColor = this.currentColor;
        
        // Convert color to name for display
        const colorNames = {
            '#FF6B6B': 'Red',
            '#4ECDC4': 'Teal',
            '#45B7D1': 'Blue',
            '#96CEB4': 'Green',
            '#FFEAA7': 'Yellow',
            '#DDA0DD': 'Purple',
            '#FFB3BA': 'Pink',
            '#98D8C8': 'Light Green'
        };
        
        this.activeColorName.textContent = colorNames[this.currentColor] || 'Custom';
    }
    
    updateActiveColor() {
        // Remove active class from all color options
        document.querySelectorAll('.color-option').forEach(option => {
            option.classList.remove('active');
        });
        
        // Add active class to selected color
        document.querySelector(`.color-option[data-color="${this.currentColor}"]`).classList.add('active');
    }
    
    startDrawing(e) {
        this.isDrawing = true;
        [this.lastX, this.lastY] = this.getCoordinates(e);
    }
    
    handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.canvas.dispatchEvent(mouseEvent);
    }
    
    handleTouchMove(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.canvas.dispatchEvent(mouseEvent);
    }
    
    getCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        if (e.type.includes('touch')) {
            const touch = e.touches[0] || e.changedTouches[0];
            return [
                touch.clientX - rect.left,
                touch.clientY - rect.top
            ];
        }
        return [
            e.clientX - rect.left,
            e.clientY - rect.top
        ];
    }
    
    draw(e) {
        if (!this.isDrawing) return;
        
        const [x, y] = this.getCoordinates(e);
        
        this.ctx.beginPath();
        this.ctx.moveTo(this.lastX, this.lastY);
        this.ctx.lineTo(x, y);
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.lineWidth = this.brushSize;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.stroke();
        
        [this.lastX, this.lastY] = [x, y];
    }
    
    stopDrawing() {
        this.isDrawing = false;
    }
    
    clearCanvas() {
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawBackground();
    }
    
    changeBrushSize(delta) {
        this.brushSize = Math.max(5, Math.min(50, this.brushSize + delta));
        this.updateBrushSizeDisplay();
    }
    
    updateBrushSizeDisplay() {
        this.brushSizeElement.textContent = this.brushSize;
    }
    
    downloadArt() {
        const link = document.createElement('a');
        link.download = 'playdoh-art.png';
        link.href = this.canvas.toDataURL('image/png');
        link.click();
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new PlayDohGame();
});