#!/usr/bin/env node

// Simple Text Adventure Game
// This is a simple text-based adventure game implemented in Node.js

class SimpleGame {
    constructor() {
        this.playerName = "";
        this.currentLocation = "start";
        this.inventory = [];
        this.gameState = "playing"; // playing, won, lost
        this.locations = {
            start: {
                name: "The Beginning",
                description: "You are at the entrance of a mysterious forest. Paths lead north and east.",
                exits: { north: "forest", east: "cave" }
            },
            forest: {
                name: "Dark Forest",
                description: "You're in a dark forest. You can hear mysterious sounds around you. Paths lead south and west.",
                exits: { south: "start", west: "cave" }
            },
            cave: {
                name: "Mysterious Cave",
                description: "You enter a cave. It's dark but you can see some glittering items on the ground. Path leads east and west.",
                exits: { east: "start", west: "treasure" }
            },
            treasure: {
                name: "Treasure Room",
                description: "Congratulations! You found the treasure room. You win the game!",
                exits: {}
            }
        };
    }

    startGame() {
        console.log("=== Welcome to the Simple Adventure Game ===");
        console.log("Enter your name:");
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question("", (name) => {
            this.playerName = name || "Adventurer";
            console.log(`\nHello, ${this.playerName}!`);
            this.showLocation();
            rl.close();
        });
    }

    showLocation() {
        const location = this.locations[this.currentLocation];
        console.log(`\n${location.name}`);
        console.log(location.description);
        console.log(`\nExits: ${Object.keys(location.exits).join(", ")}`);
    }

    move(direction) {
        const location = this.locations[this.currentLocation];
        if (location.exits[direction]) {
            this.currentLocation = location.exits[direction];
            this.showLocation();
            this.checkWinCondition();
        } else {
            console.log("You can't go that way.");
        }
    }

    checkWinCondition() {
        if (this.currentLocation === "treasure") {
            console.log("🎉 Congratulations! You've found the treasure and won the game! 🎉");
            this.gameState = "won";
        }
    }

    // Simple command parser
    parseCommand(input) {
        const command = input.trim().toLowerCase();
        
        switch (command) {
            case 'north':
            case 'n':
                this.move('north');
                break;
            case 'south':
            case 's':
                this.move('south');
                break;
            case 'east':
            case 'e':
                this.move('east');
                break;
            case 'west':
            case 'w':
                this.move('west');
                break;
            case 'look':
                this.showLocation();
                break;
            case 'inventory':
            case 'i':
                console.log("Inventory:", this.inventory.join(", ") || "empty");
                break;
            case 'help':
                console.log("\nCommands:");
                console.log("north, south, east, west - Move in that direction");
                console.log("look - Look at current location");
                console.log("inventory - Show your inventory");
                console.log("help - Show this help");
                console.log("quit - Quit the game");
                break;
            case 'quit':
                console.log("Thanks for playing!");
                process.exit(0);
                break;
            default:
                console.log("Unknown command. Type 'help' for available commands.");
        }
    }

    // Handle user input
    handleInput(input) {
        if (this.gameState === "playing") {
            this.parseCommand(input);
        }
    }
}

// Initialize and start the game
const game = new SimpleGame();
game.startGame();

// For testing purposes, create a CLI interface
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.on('line', (input) => {
    game.handleInput(input);
});

rl.on('close', () => {
    console.log("Goodbye!");
});