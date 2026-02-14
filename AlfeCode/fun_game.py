import random

def guess_the_number():
    number = random.randint(1, 100)
    attempts = 0
    print("Welcome to Guess the Number!")
    while True:
        guess = int(input("Guess a number between 1 and 100: "))
        attempts += 1
        if guess < number:
            print("Too low! Try again.")
        elif guess > number:
            print("Too high! Try again.")
        else:
            print(f"Congratulations! You guessed the number in {attempts} attempts!")
            break

if __name__ == "__main__":
    guess_the_number()