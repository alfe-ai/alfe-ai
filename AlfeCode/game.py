import random

def play_game():
    number = random.randint(1, 100)
    attempts = 0
    print("Guess the number between 1 and 100!")

    while True:
        try:
            guess = int(input("Your guess: "))
            attempts += 1

            if guess < number:
                print("Too low!")
            elif guess > number:
                print("Too high!")
            else:
                print(f"Congratulations! You guessed it in {attempts} attempts.")
                break
        except ValueError:
            print("Please enter a valid number.")

if __name__ == "__main__":
    play_game()