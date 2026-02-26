#!/usr/bin/env python3
"""
Simple Number Guessing Game
Guess a number between 1 and 100 in as few attempts as possible!
"""

import random

def main():
    print("🎮 Welcome to the Number Guessing Game! 🎮")
    print("=" * 40)
    print("I'm thinking of a number between 1 and 100.")
    print("Can you guess what it is?")
    print()
    
    # Generate random number between 1 and 100
    secret_number = random.randint(1, 100)
    attempts = 0
    guessed = False
    
    while not guessed:
        try:
            # Get user input
            guess = int(input("Enter your guess: "))
            attempts += 1
            
            # Check the guess
            if guess < secret_number:
                print("Too low! Try a higher number.")
            elif guess > secret_number:
                print("Too high! Try a lower number.")
            else:
                # Correct guess
                print(f"\n🎉 Congratulations! You guessed it!")
                print(f"The number was {secret_number}")
                print(f"It took you {attempts} attempts.")
                guessed = True
                
                # Give a rating based on attempts
                if attempts <= 3:
                    print("🏆 Amazing! You're a mind reader!")
                elif attempts <= 6:
                    print("👍 Great job!")
                elif attempts <= 10:
                    print("😊 Good effort!")
                else:
                    print("😅 Better luck next time!")
                    
        except ValueError:
            print("Please enter a valid number!")
        print()

if __name__ == "__main__":
    main()