#!/bin/bash

# Simple Hangman Game in Bash

# Words database
WORDS=("PYTHON" "JAVASCRIPT" "COMPUTER" "PROGRAMMING" "DEVELOPER" "CODE" "EDITOR" "FUNCTION" "VARIABLE" "LOOP")

# Function to display the hangman
display_hangman() {
    local attempts=$1
    echo "Attempts left: $((6 - attempts))"
    case $attempts in
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

# Function to display current state of the word
display_word() {
    local word=$1
    local guessed=$2
    local display=""
    
    for (( i=0; i<${#word}; i++ )); do
        char="${word:$i:1}"
        if [[ "${guessed}" == *"${char}"* ]]; then
            display="${display}${char} "
        else
            display="${display}_ "
        fi
    done
    
    echo "$display"
}

# Main game function
play_game() {
    # Select random word
    word_index=$((RANDOM % ${#WORDS[@]}))
    word=${WORDS[$word_index]}
    
    # Initialize variables
    guessed=""
    attempts=0
    max_attempts=6
    
    echo "Welcome to Hangman!"
    echo "Guess the word by entering one letter at a time."
    echo "You have $max_attempts attempts."
    echo
    
    # Game loop
    while [[ $attempts -lt $max_attempts ]]; do
        # Display hangman and current word
        display_hangman $attempts
        echo "Word: $(display_word "$word" "$guessed")"
        echo "Letters guessed: $guessed"
        echo
        
        # Get user input
        read -p "Enter a letter: " letter
        letter=$(echo "$letter" | tr '[:lower:]' '[:upper:]')
        
        # Validate input
        if [[ ! $letter =~ ^[A-Z]$ ]]; then
            echo "Please enter a single letter."
            continue
        fi
        
        # Check if letter was already guessed
        if [[ "${guessed}" == *"${letter}"* ]]; then
            echo "You already guessed that letter!"
            continue
        fi
        
        # Add letter to guessed letters
        guessed="${guessed}${letter}"
        
        # Check if letter is in the word
        if [[ "${word}" == *"${letter}"* ]]; then
            echo "Good guess!"
        else
            echo "Wrong guess!"
            attempts=$((attempts + 1))
        fi
        
        # Check if word is complete
        all_guessed=1
        for (( i=0; i<${#word}; i++ )); do
            char="${word:$i:1}"
            if [[ ! "${guessed}" == *"${char}"* ]]; then
                all_guessed=0
                break
            fi
        done
        
        if [[ $all_guessed -eq 1 ]]; then
            echo "Congratulations! You guessed the word: $word"
            return 0
        fi
        
        echo
    done
    
    # If we reach here, they've lost
    display_hangman $attempts
    echo "Game Over! The word was: $word"
    return 1
}

# Start the game
play_game