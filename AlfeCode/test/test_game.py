#!/usr/bin/env python3

# Simple Test Game
print("Welcome to the Test Game!")

def play_game():
    print("You are in a room with two doors.")
    choice = input("Which door do you choose? (1 or 2): ")
    if choice == "1":
        print("You found treasure! Congratulations!")
    elif choice == "2":
        print("You hit a wall. Game over.")
    else:
        print("Invalid choice. Try again.")

if __name__ == "__main__":
    play_game()