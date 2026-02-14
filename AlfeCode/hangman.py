import random

words = ["python", "hangman", "game", "code"]
word = random.choice(words)
guessed = ['_'] * len(word)
attempts = 6

while attempts > 0 and '_' in guessed:
    print('\'.join(guessed))
    guess = input("Guess a letter: ").lower()
    if guess in word:
        for i, letter in enumerate(word):
            if letter == guess:
                guessed[i] = letter
    else:
        attempts -= 1
        print(f"Incorrect! Attempts left: {attempts}"

if '_' not in guessed:
    print("You won!\nThe word was: {word}")
else:
    print("You lost!\nThe word was: {word}")