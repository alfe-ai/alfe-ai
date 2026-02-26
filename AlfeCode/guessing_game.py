#!/usr/bin/env python3
"""
Simple Number Guessing Game
Guess a number between 1 and 100 in as few attempts as possible!
"""

import random

def main():
    print("🎯 Welcome to the Number Guessing Game! 🎯")
    print("=" * 40)
    
    # Generate random number between 1 and 100
    secret_number = random.randint(1, 100)
    max_attempts = 7
    attempts = 0
    
    print(f"I'm thinking of a number between 1 and 100.")
    print(f"You have {max_attempts} attempts to guess it!")
    print("-" * 40)
    
    while attempts < max_attempts:
        try:
            # Get user input
            guess = int(input(f"Attempt {attempts + 1}: Enter your guess: "))
            attempts += 1
            
            # Check guess
            if guess < 1 or guess > 100:
                print("Please enter a number between 1 and 100!")
                attempts -= 1  # Don't count invalid guesses
                continue
                
            if guess == secret_number:
                print(f"🎉 Congratulations! You guessed the number in {attempts} attempts!")
                if attempts <= 3:
                    print("🏆 Amazing! You're a mind reader!")
                elif attempts <= 5:
                    print("👍 Good job!")
                else:
                    print("👌 Not bad!")
                return
            elif guess < secret_number:
                print("📈 Too low! Try a higher number.")
            else:
                print("📉 Too high! Try a lower number.")
                
            # Show remaining attempts
            remaining = max_attempts - attempts
            if remaining > 0:
                print(f"You have {remaining} attempts remaining.")
            print("-" * 40)
            
        except ValueError:
            print("Please enter a valid number!")
            attempts -= 1  # Don't count invalid input
            
    # Player ran out of attempts
    print(f"💀 Game Over! You've run out of attempts.")
    print(f"The number was {secret_number}. Better luck next time!")

if __name__ == "__main__":
    main()