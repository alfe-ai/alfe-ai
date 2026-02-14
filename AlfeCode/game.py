import random

def play_game():
    number = random.randint(1, 10)
    guess = None
    while guess != number:
        guess = int(input("Guess a number between 1 and 10: "))
        if guess < number:
            print("Too low!")
        else:
            print("Too high!")
    print("Congratulations! You guessed it!")

if __name__ == "__main__":
    play_game()