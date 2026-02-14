import random

def play_game():
    number = random.randint(1, 10)
    guess = None
    while guess != number:
        guess = int(input("Guess a number between 1 and 10: "))
        if guess < number:
            print("Too low!\n")
        else:
            print("Too high!\n")
    print("Congratulations! You guessed it!\n")

if __name__ == "__main__":
    play_game()