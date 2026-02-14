// Test Game 2
const { Game } = require('../game');

describe('Game 2', () => {
  it('should initialize correctly', () => {
    const game = new Game('game2');
    expect(game.state).toEqual('initialized');
  });
});