const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the AlfeCode directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve the main game page
app.get('/', (req, res) =-&gt; {
  res.sendFile(path.join(__dirname, 'public', 'cat-game.html'));
});

// Start the server
app.listen(PORT, () =&gt; {
  console.log(`Cat Cafe game server running at http://localhost:${PORT}`);
});