# Hangman Game

A simple command-line Hangman game implemented in Bash.

## How to run

1. Make the script executable (if not already):
   ```bash
   chmod +x hangman.sh
   ```

2. Run the game:
   ```bash
   ./hangman.sh
   ```

## Game Rules

- Guess the hidden word by entering one letter at a time
- You have 6 attempts to guess the word correctly
- Each wrong guess will display a part of the hangman
- You win by guessing all letters of the word before running out of attempts

## Features

- Random word selection from a predefined list
- Visual representation of hangman at each attempt
- Clear display of guessed letters
- Win/loss conditions with appropriate messages