// Rock Paper Scissors Game Test
// Simple game implementation to demonstrate test functionality

function playRockPaperScissors(player1, player2) {
  if (player1 === player2) {
    return 'tie';
  }
  
  if (
    (player1 === 'rock' && player2 === 'scissors') ||
    (player1 === 'paper' && player2 === 'rock') ||
    (player1 === 'scissors' && player2 === 'paper')
  ) {
    return 'player1';
  }
  
  return 'player2';
}

// Test the game functionality
test('Rock Paper Scissors game logic', () => {
  // Test ties
  expect(playRockPaperScissors('rock', 'rock')).toBe('tie');
  expect(playRockPaperScissors('paper', 'paper')).toBe('tie');
  expect(playRockPaperScissors('scissors', 'scissors')).toBe('tie');
  
  // Test player1 wins
  expect(playRockPaperScissors('rock', 'scissors')).toBe('player1');
  expect(playRockPaperScissors('paper', 'rock')).toBe('player1');
  expect(playRockPaperScissors('scissors', 'paper')).toBe('player1');
  
  // Test player2 wins
  expect(playRockPaperScissors('scissors', 'rock')).toBe('player2');
  expect(playRockPaperScissors('rock', 'paper')).toBe('player2');
  expect(playRockPaperScissors('paper', 'scissors')).toBe('player2');
});

test('Game function exists', () => {
  expect(typeof playRockPaperScissors).toBe('function');
});