#!/usr/bin/env python3
"""
Simple Hangman Game
"""

import random

def get_random_word():
    """Select a random word from a predefined list."""
    words = [
        "python", "programming", "computer", "algorithm", "function",
        "variable", "string", "integer", "boolean", "list",
        "dictionary", "module", "package", "class", "object",
        "inheritance", "polymorphism", "encapsulation", "abstraction",
        "debugging", "testing", "deployment", "integration", "optimization"
    ]
    return random.choice(words).lower()

def display_hangman(incorrect_guesses):
    """Display the hangman figure based on incorrect guesses."""
    stages = [
        """
           -----
           |   |
           O   |
          /|\\  |
          / \\  |
               |
        --------
        """,
        """
           -----
           |   |
           O   |
          /|\\  |
          /    |
               |
        --------
        """,
        """
           -----
           |   |
           O   |
          /|\\  |
               |
               |
        --------
        """,
        """
           -----
           |   |
           O   |
          /|   |
               |
               |
        --------
        """,
        """
           -----
           |   |
           O   |
           |   |
               |
               |
        --------
        """,
        """
           -----
           |   |
           O   |
               |
               |
               |
        --------
        """,
        """
           -----
           |   |
               |
               |
               |
               |
        --------
        """
    ]
    return stages[incorrect_guesses]

def display_word_progress(word, guessed_letters):
    """Display the current progress of the word being guessed."""
    display = ""
    for letter in word:
        if letter in guessed_letters:
            display += letter + " "
        else:
            display += "_ "
    return display.strip()

def hangman_game():
    """Main hangman game function."""
    print("Welcome to Hangman!")
    print("Try to guess the word by suggesting letters.")
    print("You have 6 incorrect guesses before the hangman is complete.")
    print("-" * 50)
    
    # Get a random word
    word = get_random_word()
    guessed_letters = set()
    incorrect_guesses = 0
    max_incorrect = 6
    
    while incorrect_guesses < max_incorrect:
        # Display game state
        print(display_hangman(incorrect_guesses))
        print("Word:", display_word_progress(word, guessed_letters))
        print("Guessed letters:", " ".join(sorted(guessed_letters)))
        print("Incorrect guesses left:", max_incorrect - incorrect_guesses)
        
        # Get user input
        guess = input("\nGuess a letter: ").lower()
        
        # Validate input
        if len(guess) != 1 or not guess.isalpha():
            print("Please enter a single letter.")
            continue
            
        if guess in guessed_letters:
            print("You already guessed that letter!")
            continue
            
        # Add guess to guessed letters
        guessed_letters.add(guess)
        
        # Check if guess is in the word
        if guess in word:
            print("Good guess!")
            # Check if word is completely guessed
            if all(letter in guessed_letters for letter in word):
                print("\nCongratulations! You've guessed the word:", word)
                return
        else:
            print("Incorrect guess!")
            incorrect_guesses += 1
    
    # Game over - player lost
    print(display_hangman(incorrect_guesses))
    print("\nGame Over! You've been hanged!")
    print("The word was:", word)

if __name__ == "__main__":
    hangman_game()