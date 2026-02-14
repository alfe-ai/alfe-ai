import random

words = ["python", "hangman", "game"]
word = random.choice(words)
guessed_letters = set()
attempts = 6

while attempts > 0:
    # Display current state
    display = ' '.join([letter if letter in guessed_letters else '_' for letter in word])
    print(display)
    # Get user input
    guess = input("Guess a letter: ").lower()
    if guess in guessed_letters:
        print("Already guessed")
        continue
    guessed_letters.add(guess)
    if guess in word:
        print("Correct!")
    else:
        attempts -= 1
        print(f"Wrong! Attempts left: {attempts}")
    if all(letter in guessed_letters for letter in word):
        print("You win!")
        break
else:
    print("You lose! The word was {word}")