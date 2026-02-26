#!/usr/bin/env python3
"""
Simple Guess the Number Game
Try to guess the secret number between 1 and 100 in as few attempts as possible!
"""

import random

def main():
    print("🎮 Welcome to Guess the Number! 🎮")
    print("I'm thinking of a number between 1 and 100...")
    
    # Generate random secret number
    secret_number = random.randint(1, 100)
    attempts = 0
    
    while True:
        try:
            # Get user input
            guess = int(input("\nEnter your guess: "))
            attempts += 1
            
            # Check the guess
            if guess < secret_number:
                print("Too low! Try a higher number.")
            elif guess > secret_number:
                print("Too high! Try a lower number.")
            else:
                print(f"\n🎉 Congratulations! You guessed the number in {attempts} attempts!")
                break
                
        except ValueError:
            print("Please enter a valid number.")

if __name__ == "__main__":
    main()