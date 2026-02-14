import random

def play_number_guessing_game():
    """A fun number guessing game where the player guesses a number between 1 and 10."""
    print("🎮 Welcome to the Number Guessing Game! 🎮")
    print("I'm thinking of a number between 1 and 10...")
    
    number = random.randint(1, 10)
    guess = None
    attempts = 0
    
    while guess != number:
        try:
            guess = int(input("Enter your guess: "))
            attempts += 1
            
            if guess < number:
                print("📉 Too low! Try a higher number.")
            elif guess > number:
                print("📈 Too high! Try a lower number.")
            else:
                print(f"🎉 Congratulations! You guessed it in {attempts} attempts!")
        except ValueError:
            print("❌ Please enter a valid number!")

if __name__ == "__main__":
    play_number_guessing_game()