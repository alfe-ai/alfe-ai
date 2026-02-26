#!/bin/bash

# Multicolor Snake Game in Shell
# Features: 
# - Colorful snake and food
# - Score tracking
# - Game over detection
# - Arrow key controls
# - Simple and clean terminal interface

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[0;37m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Game constants
WIDTH=30
HEIGHT=20
SPEED=0.2

# Game state variables
snake=()
snake_length=3
food_x=0
food_y=0
score=0
dir_x=1
dir_y=0
game_over=false

# Initialize game board
init_board() {
    # Create initial snake (horizontal)
    snake=()
    for ((i=0; i<snake_length; i++)); do
        snake+=($((WIDTH/2-i)),$((HEIGHT/2)))
    done
    
    # Place first food
    place_food
    
    # Initial direction (right)
    dir_x=1
    dir_y=0
    
    # Reset score
    score=0
    
    # Reset game over state
    game_over=false
}

# Place food at random location
place_food() {
    local valid_pos=false
    while [ "$valid_pos" = false ]; do
        food_x=$((RANDOM % (WIDTH-2) + 1))
        food_y=$((RANDOM % (HEIGHT-2) + 1))
        
        # Check if position is not on snake
        valid_pos=true
        for ((i=0; i<${#snake[@]}; i+=2)); do
            if [ "${snake[i]}" = "$food_x" ] && [ "${snake[i+1]}" = "$food_y" ]; then
                valid_pos=false
                break
            fi
        done
    done
}

# Draw game board
draw_board() {
    clear
    
    # Create a new board
    local board=""
    # Top border
    for ((i=0; i<WIDTH+2; i++)); do
        board+="="
    done
    board+="\n"
    
    # Game area
    for ((y=0; y<HEIGHT; y++)); do
        board+="|"
        for ((x=0; x<WIDTH; x++)); do
            # Check if position contains snake head or body
            local is_snake=false
            local snake_pos=""
            for ((i=0; i<${#snake[@]}; i+=2)); do
                if [ "${snake[i]}" = "$x" ] && [ "${snake[i+1]}" = "$y" ]; then
                    is_snake=true
                    snake_pos="$i"
                    break
                fi
            done
            
            if [ "$is_snake" = true ]; then
                # Snake head is first segment
                if [ "$snake_pos" = "0" ]; then
                    board+="${RED}O${NC}"
                else
                    # Different colors for snake body
                    local body_colors=("$GREEN" "$YELLOW" "$BLUE" "$MAGENTA" "$CYAN")
                    local color_index=$(( (snake_pos/2) % ${#body_colors[@]} ))
                    board+="${body_colors[$color_index]}o${NC}"
                fi
            elif [ "$x" = "$food_x" ] && [ "$y" = "$food_y" ]; then
                # Food
                board+="${BOLD}${RED}*${NC}"
            else
                board+=" "
            fi
        done
        board+="|\n"
    done
    
    # Bottom border
    for ((i=0; i<WIDTH+2; i++)); do
        board+="="
    done
    board+="\n"
    
    # Score and instructions
    board+="Score: $score\n"
    board+="Controls: ←↓↑→  Q: Quit\n"
    
    echo -e "$board"
}

# Move snake
move_snake() {
    # Calculate new head position
    local head_x=${snake[0]}
    local head_y=${snake[1]}
    local new_head_x=$((head_x + dir_x))
    local new_head_y=$((head_y + dir_y))
    
    # Check for collisions (walls)
    if [ "$new_head_x" -lt 0 ] || [ "$new_head_x" -ge "$WIDTH" ] || [ "$new_head_y" -lt 0 ] || [ "$new_head_y" -ge "$HEIGHT" ]; then
        game_over=true
        return
    fi
    
    # Check for self collision
    for ((i=0; i<${#snake[@]}; i+=2)); do
        if [ "${snake[i]}" = "$new_head_x" ] && [ "${snake[i+1]}" = "$new_head_y" ]; then
            # But allow collision with head itself (for direction change)
            if [ "$i" -ne 0 ]; then
                game_over=true
                return
            fi
        fi
    done
    
    # Add new head
    snake=($new_head_x,$new_head_y "${snake[@]}")
    
    # Check if food eaten
    if [ "$new_head_x" = "$food_x" ] && [ "$new_head_y" = "$food_y" ]; then
        # Increase score
        score=$((score + 10))
        # Place new food
        place_food
    else
        # Remove tail if no food eaten
        unset snake[${#snake[@]}-1]
        unset snake[${#snake[@]}-1]
    fi
}

# Handle input
handle_input() {
    # Capture key press without waiting for enter
    read -n1 -t 0.05 key 2>/dev/null || true
    
    case "$key" in
        'q'|'Q') exit 0 ;;
        'a'|'A') 
            if [ "$dir_x" = 0 ]; then
                dir_x=-1
                dir_y=0
            fi
            ;;
        'd'|'D') 
            if [ "$dir_x" = 0 ]; then
                dir_x=1
                dir_y=0
            fi
            ;;
        'w'|'W') 
            if [ "$dir_y" = 0 ]; then
                dir_x=0
                dir_y=-1
            fi
            ;;
        's'|'S') 
            if [ "$dir_y" = 0 ]; then
                dir_x=0
                dir_y=1
            fi
            ;;
        '') # No input (or timeout)
            ;;
        *) # Ignore other keys
            ;;
    esac
}

# Main game loop
main_loop() {
    init_board
    
    while [ "$game_over" = false ]; do
        draw_board
        handle_input
        move_snake
        sleep "$SPEED"
    done
    
    # Game over screen
    clear
    echo -e "${BOLD}${RED}GAME OVER!${NC}"
    echo -e "Final Score: ${BOLD}$score${NC}"
    echo -e "Press any key to exit..."
    read -n1 -s
}

# Check dependencies
if ! command -v clear &> /dev/null; then
    echo "Error: 'clear' command not found"
    exit 1
fi

# Start the game
main_loop