#!/usr/bin/env python3
import random

def guess_number():
    number = random.randint(1, 100)
    attempts = 0
    print("Welcome to the Number Guessing Game!")
    while True:
        try:
            guess = int(input("Enter your guess (1-100): "))
            attempts += 1
            if guess < number:
                print("Too low!")
            elif guess > number:
                print("Too high!")
            else:
                print(f"Congratulations! You guessed the number in {attempts} attempts!")
                break
        except ValueError:
            print("Please enter a valid number.")

if __name__ == "__main__":
    guess_number()