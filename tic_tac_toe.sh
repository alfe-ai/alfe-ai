#!/bin/bash

# Tic Tac Toe Game in Bash

# Initialize the board
board=(1 2 3 4 5 6 7 8 9)

# Function to display the board
display_board() {
    echo " ${board[0]} | ${board[1]} | ${board[2]} "
    echo "---|---|---"
    echo " ${board[3]} | ${board[4]} | ${board[5]} "
    echo "---|---|---"
    echo " ${board[6]} | ${board[7]} | ${board[8]} "
}

# Function to check for a win
check_win() {
    local player=$1
    # Check rows
    if [[ ${board[0]} == $player && ${board[1]} == $player && ${board[2]} == $player ]] || \
       [[ ${board[3]} == $player && ${board[4]} == $player && ${board[5]} == $player ]] || \
       [[ ${board[6]} == $player && ${board[7]} == $player && ${board[8]} == $player ]] || \
       # Check columns
       [[ ${board[0]} == $player && ${board[3]} == $player && ${board[6]} == $player ]] || \
       [[ ${board[1]} == $player && ${board[4]} == $player && ${board[7]} == $player ]] || \
       [[ ${board[2]} == $player && ${board[5]} == $player && ${board[8]} == $player ]] || \
       # Check diagonals
       [[ ${board[0]} == $player && ${board[4]} == $player && ${board[8]} == $player ]] || \
       [[ ${board[2]} == $player && ${board[4]} == $player && ${board[6]} == $player ]]; then
        return 0
    else
        return 1
    fi
}

# Function to check for a tie
check_tie() {
    for cell in "${board[@]}"; do
        if [[ $cell != "X" && $cell != "O" ]]; then
            return 1
        fi
    done
    return 0
}

# Function to validate input
validate_input() {
    local pos=$1
    if [[ $pos -ge 1 && $pos -le 9 ]]; then
        if [[ ${board[$((pos-1))]} != "X" && ${board[$((pos-1))]} != "O" ]]; then
            return 0
        fi
    fi
    return 1
}

# Main game loop
echo "Welcome to Tic Tac Toe!"
echo "Player 1: X, Player 2: O"
echo "Enter positions 1-9 to make your move."

current_player="X"
game_over=false

while [[ $game_over == false ]]; do
    echo
    display_board
    echo
    echo "Player $current_player's turn"
    read -p "Enter position (1-9): " position

    if validate_input $position; then
        board[$((position-1))]=$current_player
        
        if check_win $current_player; then
            echo
            display_board
            echo
            echo "Player $current_player wins!"
            game_over=true
        elif check_tie; then
            echo
            display_board
            echo
            echo "It's a tie!"
            game_over=true
        else
            # Switch player
            if [[ $current_player == "X" ]]; then
                current_player="O"
            else
                current_player="X"
            fi
        fi
    else
        echo "Invalid move! Please try again."
    fi
done