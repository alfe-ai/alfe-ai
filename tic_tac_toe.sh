#!/bin/bash

# Tic Tac Toe Game in Bash

# Initialize the board
board=()
for i in {1..9}; do
    board[i]=" "
done

# Function to display the board
display_board() {
    echo " ${board[1]} | ${board[2]} | ${board[3]} "
    echo "---|---|---"
    echo " ${board[4]} | ${board[5]} | ${board[6]} "
    echo "---|---|---"
    echo " ${board[7]} | ${board[8]} | ${board[9]} "
}

# Function to check for a win
check_win() {
    local player=$1
    
    # Check rows
    if [[ "${board[1]}" == "$player" && "${board[2]}" == "$player" && "${board[3]}" == "$player" ]] ||
       [[ "${board[4]}" == "$player" && "${board[5]}" == "$player" && "${board[6]}" == "$player" ]] ||
       [[ "${board[7]}" == "$player" && "${board[8]}" == "$player" && "${board[9]}" == "$player" ]] ||
       # Check columns
       [[ "${board[1]}" == "$player" && "${board[4]}" == "$player" && "${board[7]}" == "$player" ]] ||
       [[ "${board[2]}" == "$player" && "${board[5]}" == "$player" && "${board[8]}" == "$player" ]] ||
       [[ "${board[3]}" == "$player" && "${board[6]}" == "$player" && "${board[9]}" == "$player" ]] ||
       # Check diagonals
       [[ "${board[1]}" == "$player" && "${board[5]}" == "$player" && "${board[9]}" == "$player" ]] ||
       [[ "${board[3]}" == "$player" && "${board[5]}" == "$player" && "${board[7]}" == "$player" ]]; then
        return 0  # Win
    else
        return 1  # No win
    fi
}

# Function to check for a tie
check_tie() {
    for i in {1..9}; do
        if [[ "${board[i]}" == " " ]]; then
            return 1  # Not a tie, there are empty spaces
        fi
    done
    return 0  # Tie
}

# Function to get valid player move
get_move() {
    local player=$1
    local move
    
    while true; do
        echo "Player $player, enter position (1-9):"
        read -r move
        
        # Check if input is a number
        if ! [[ "$move" =~ ^[0-9]+$ ]]; then
            echo "Invalid input. Please enter a number between 1 and 9."
            continue
        fi
        
        # Check if position is within range
        if [ "$move" -lt 1 ] || [ "$move" -gt 9 ]; then
            echo "Position must be between 1 and 9."
            continue
        fi
        
        # Check if position is already taken
        if [[ "${board[move]}" != " " ]]; then
            echo "Position $move is already taken. Try again."
            continue
        fi
        
        # Valid move
        board[move]=$player
        break
    done
}

# Main game loop
echo "Welcome to Tic Tac Toe!"
echo "Player X goes first."

# Game loop
while true; do
    # Display current board
    echo ""
    display_board
    
    # Player X's turn
    get_move "X"
    
    # Check for win
    if check_win "X"; then
        echo ""
        display_board
        echo "Player X wins!"
        break
    fi
    
    # Check for tie
    if check_tie; then
        echo ""
        display_board
        echo "It's a tie!"
        break
    fi
    
    # Display current board
    echo ""
    display_board
    
    # Player O's turn
    get_move "O"
    
    # Check for win
    if check_win "O"; then
        echo ""
        display_board
        echo "Player O wins!"
        break
    fi
    
    # Check for tie
    if check_tie; then
        echo ""
        display_board
        echo "It's a tie!"
        break
    fi
done