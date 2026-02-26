#!/bin/bash

# Simple Hangman Game in Bash

# Words for the game
WORDS=("python" "programming" "computer" "algorithm" "variable" "function" "string" "integer" "array" "object")
MAX_ATTEMPTS=6

# Select a random word
WORD="${WORDS[RANDOM % ${#WORDS[@]}]}"
WORD_LENGTH=${#WORD}
HIDDEN_WORD=$(printf "%*s" "$WORD_LENGTH" | tr ' ' '_')

# Track guessed letters
GUESSED_LETTERS=""

# Track wrong guesses
WRONG_GUESSES=0

# Display hangman figure based on wrong guesses
display_hangman() {
    case $WRONG_GUESSES in
        0)
            echo "  +---+"
            echo "  |   |"
            echo "      |"
            echo "      |"
            echo "      |"
            echo "      |"
            echo "========="
            ;;
        1)
            echo "  +---+"
            echo "  |   |"
            echo "  O   |"
            echo "      |"
            echo "      |"
            echo "      |"
            echo "========="
            ;;
        2)
            echo "  +---+"
            echo "  |   |"
            echo "  O   |"
            echo "  |   |"
            echo "      |"
            echo "      |"
            echo "========="
            ;;
        3)
            echo "  +---+"
            echo "  |   |"
            echo "  O   |"
            echo " /|   |"
            echo "      |"
            echo "      |"
            echo "========="
            ;;
        4)
            echo "  +---+"
            echo "  |   |"
            echo "  O   |"
            echo " /|\  |"
            echo "      |"
            echo "      |"
            echo "========="
            ;;
        5)
            echo "  +---+"
            echo "  |   |"
            echo "  O   |"
            echo " /|\  |"
            echo " /    |"
            echo "      |"
            echo "========="
            ;;
        6)
            echo "  +---+"
            echo "  |   |"
            echo "  O   |"
            echo " /|\  |"
            echo " / \  |"
            echo "      |"
            echo "========="
            ;;
    esac
}

# Display the word with guessed letters
display_word() {
    local display=""
    for ((i=0; i<WORD_LENGTH; i++)); do
        if [[ ${GUESSED_LETTERS} == *"${WORD:$i:1}"* ]]; then
            display="${display}${WORD:$i:1} "
        else
            display="${display}_ "
        fi
    done
    echo "$display"
}

# Check if game is over
game_over() {
    if [[ $WRONG_GUESSES -ge $MAX_ATTEMPTS ]]; then
        echo "You lost! The word was: $WORD"
        return 0
    fi
    
    # Check if all letters are guessed
    for ((i=0; i<WORD_LENGTH; i++)); do
        if [[ ${GUESSED_LETTERS} != *"${WORD:$i:1}"* ]]; then
            return 1
        fi
    done
    
    echo "Congratulations! You won! The word was: $WORD"
    return 0
}

# Main game loop
echo "Welcome to Hangman!"
echo "Try to guess the word by entering one letter at a time."
echo ""

while true; do
    display_hangman
    echo ""
    echo "Word: $(display_word)"
    echo "Wrong guesses: $WRONG_GUESSES/$MAX_ATTEMPTS"
    echo "Guessed letters: $GUESSED_LETTERS"
    echo ""
    
    # Check if game is over
    if game_over; then
        break
    fi
    
    # Get user input
    read -p "Enter a letter: " GUESS
    
    # Validate input
    if [[ ! $GUESS =~ ^[a-zA-Z]$ ]] || [[ ${#GUESS} -ne 1 ]]; then
        echo "Please enter a single letter."
        continue
    fi
    
    # Check if letter was already guessed
    if [[ ${GUESSED_LETTERS} == *"$GUESS"* ]]; then
        echo "You already guessed that letter!"
        continue
    fi
    
    # Add letter to guessed letters
    GUESSED_LETTERS="${GUESSED_LETTERS}$GUESS"
    
    # Check if letter is in the word
    if [[ ${WORD} == *"$GUESS"* ]]; then
        echo "Good guess!"
    else
        echo "Wrong guess!"
        WRONG_GUESSES=$((WRONG_GUESSES + 1))
    fi
    
    echo ""
done