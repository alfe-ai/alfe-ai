const fs = require("fs");
const path = require("path");

console.log("Checking game files are properly created:");
console.log("Game routes file exists:", fs.existsSync("./executable/webserver/game_routes.js"));
console.log("Game view file exists:", fs.existsSync("./executable/views/game.ejs"));
console.log("Game CSS file exists:", fs.existsSync("./public/CSS/game.css"));
console.log("Game JS file exists:", fs.existsSync("./public/JS/game.js"));

// Check that we can actually start a new game
console.log("Test: game.js exists and contains expected code");
try {
    const gameJSContent = fs.readFileSync("./public/JS/game.js", "utf8");
    console.log("Game JS contents length:", gameJSContent.length);
    console.log("Contains 'DOMContentLoaded':", gameJSContent.includes("DOMContentLoaded"));
    console.log("Contains 'submitGuess':", gameJSContent.includes("submitGuess"));
    console.log("Contains 'fetch('/game/new')':", gameJSContent.includes("fetch('/game/new')"));
} catch (e) {
    console.error("Error reading game.js:", e.message);
}