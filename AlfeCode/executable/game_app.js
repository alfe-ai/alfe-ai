// Simple game route for the Alfe AI platform
const express = require("express");
const path = require("path");

// This is a minimal game implementation with a simple Express server setup
const gameApp = express();

// Serve static files from the public directory
gameApp.use(express.static(path.join(__dirname, "public")));

// Route to serve the game html page
gameApp.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "game.html"));
});

// Export the app so it can be integrated into the main application
module.exports = gameApp;