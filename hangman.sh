#!/bin/bash

# Simple Hangman Game
# This is a basic implementation of the hangman game in bash

# Word list for the game
WORDS=("python" "javascript" "computer" "programming" "algorithm" "function" "variable" "string" "integer" "boolean")
MAXTRIES=6

# Function to display the hangman
display_hangman() {
    local tries=$1
    echo ""
    
    case $tries in
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
    echo ""
}

# Function to display the secret word
display_word() {
    local word=$1
    local guessed=$2
    local display=""
    
    for (( i=0; i<${#word}; i++ )); do
        char="${word:$i:1}"
        if [[ "$guessed" == *"${char}"* ]]; then
            display="${display}${char} "
        else
            display="${display}_ "
        fi
    done
    
    echo "Word: $display"
}

# Function to check if a letter has been guessed
is_letter_guessed() {
    local letter=$1
    local guessed=$2
    
    if [[ "$guessed" == *"$letter"* ]]; then
        return 0  # True - letter has been guessed
    else
        return 1  # False - letter has not been guessed
    fi
}

# Function to check if player won
check_win() {
    local word=$1
    local guessed=$2
    
    for (( i=0; i<${#word}; i++ )); do
        char="${word:$i:1}"
        if [[ "$guessed" != *"$char"* ]]; then
            return 1  # False - player hasn't won yet
        fi
    done
    return 0  # True - player has won
}

# Function to check if player lost
check_loss() {
    local tries=$1
    local max_tries=$2
    
    if [[ $tries -ge $max_tries ]]; then
        return 0  # True - player lost
    else
        return 1  # False - player hasn't lost yet
    fi
}

# Main game function
main() {
    echo "Welcome to Simple Hangman!"
    echo "=========================="
    echo ""
    
    # Select a random word
    word_index=$((RANDOM % ${#WORDS[@]}))
    target_word="${WORDS[$word_index]}"
    
    # Initialize variables
    guessed_letters=""
    tries=0
    max_tries=$MAXTRIES
    
    # Game loop
    while true; do
        # Display game state
        display_hangman $tries
        display_word "$target_word" "$guessed_letters"
        echo "Tries left: $((max_tries - tries))"
        echo "Guessed letters: $guessed_letters"
        
        # Check for win condition
        check_win "$target_word" "$guessed_letters"
        if [[ $? -eq 0 ]]; then
            echo ""
            echo "Congratulations! You guessed the word: $target_word"
            echo "You won!"
            break
        fi
        
        # Check for loss condition
        check_loss $tries $max_tries
        if [[ $? -eq 0 ]]; then
            echo ""
            echo "Game Over! You lost!"
            echo "The word was: $target_word"
            break
        fi
        
        # Get player's guess
        read -p "Guess a letter: " guess
        
        # Validate input
        if [[ ${#guess} -ne 1 ]] || [[ ! "$guess" =~ [a-zA-Z] ]]; then
            echo ""
            echo "Please enter a single letter!"
            echo ""
            continue
        fi
        
        # Convert to lowercase
        guess=$(echo "$guess" | tr '[:upper:]' '[:lower:]')
        
        # Check if letter was already guessed
        if is_letter_guessed "$guess" "$guessed_letters"; then
            echo ""
            echo "You already guessed that letter!"
            echo ""
            continue
        fi
        
        # Add letter to guessed list
        guessed_letters="$guessed_letters$guess"
        
        # Check if letter is in the word
        if [[ "$target_word" == *"$guess"* ]]; then
            echo ""
            echo "Good guess!"
        else
            echo ""
            echo "Wrong guess!"
            tries=$((tries + 1))
        fi
        
        echo ""
    done
}

# Run the game
main