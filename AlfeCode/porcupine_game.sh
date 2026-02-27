#!/bin/bash

# Porcupine Game - A fun terminal-based game
# Objective: Help the porcupine collect as many apples as possible while avoiding spikes!

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# Game variables
game_over=false
score=0
level=1
player_x=10
player_y=10
apples=()
spikes=()
game_width=20
game_height=15
delay=0.3

# Clear screen function
clear_screen() {
    clear
}

# Draw game board
draw_board() {
    clear_screen
    echo -e "${CYAN}=== PORCUPINE GAME ===${NC}"
    echo -e "${YELLOW}Use ASWD keys to move, Q to quit${NC}"
    echo -e "${GREEN}Score: ${score}  Level: ${level}${NC}"
    echo ""
    
    # Create the game board
    for ((y=0; y<game_height; y++)); do
        for ((x=0; x<game_width; x++)); do
            # Draw player (porcupine)
            if [[ $x -eq $player_x && $y -eq $player_y ]]; then
                echo -ne "${RED}P${NC}"
            # Draw apples
            else
                apple_found=false
                for ((i=0; i<${#apples[@]}; i+=2)); do
                    if [[ ${apples[i]} -eq $x && ${apples[i+1]} -eq $y ]]; then
                        echo -ne "${GREEN}A${NC}"
                        apple_found=true
                        break
                    fi
                done
                if [[ "$apple_found" == false ]]; then
                    # Draw spikes
                    spike_found=false
                    for ((i=0; i<${#spikes[@]}; i+=2)); do
                        if [[ ${spikes[i]} -eq $x && ${spikes[i+1]} -eq $y ]]; then
                            echo -ne "${RED}S${NC}"
                            spike_found=true
                            break
                        fi
                    done
                    if [[ "$spike_found" == false ]]; then
                        # Draw empty space
                        echo -ne " "
                    fi
                fi
            fi
        done
        echo ""
    done
    echo ""
}

# Initialize game
init_game() {
    player_x=10
    player_y=10
    score=0
    level=1
    apples=()
    spikes=()
    
    # Generate initial apples and spikes
    generate_apples 5
    generate_spikes 3
}

# Generate apples
generate_apples() {
    local count=$1
    for ((i=0; i<count; i++)); do
        local x=$((RANDOM % (game_width-2) + 1))
        local y=$((RANDOM % (game_height-2) + 1))
        apples+=($x $y)
    done
}

# Generate spikes
generate_spikes() {
    local count=$1
    for ((i=0; i<count; i++)); do
        local x=$((RANDOM % (game_width-2) + 1))
        local y=$((RANDOM % (game_height-2) + 1))
        spikes+=($x $y)
    done
}

# Move player
move_player() {
    local new_x=$player_x
    local new_y=$player_y
    
    case $1 in
        "w"|"W") 
            new_y=$((player_y - 1))
            ;;
        "s"|"S") 
            new_y=$((player_y + 1))
            ;;
        "a"|"A") 
            new_x=$((player_x - 1))
            ;;
        "d"|"D") 
            new_x=$((player_x + 1))
            ;;
    esac
    
    # Check bounds
    if [[ $new_x -ge 0 && $new_x -lt $game_width && $new_y -ge 0 && $new_y -lt $game_height ]]; then
        player_x=$new_x
        player_y=$new_y
    fi
}

# Check collisions
check_collisions() {
    # Check apple collision
    for ((i=0; i<${#apples[@]}; i+=2)); do
        if [[ ${apples[i]} -eq $player_x && ${apples[i+1]} -eq $player_y ]]; then
            # Collect apple
            score=$((score + 10))
            # Remove the apple
            unset apples[$i]
            unset apples[$((i+1))]
            apples=("${apples[@]}") # Re-index array
            # Add a new apple
            generate_apples 1
            # Increase level every 50 points
            if [[ $((score % 50)) -eq 0 && $score -ne 0 ]]; then
                level=$((level + 1))
                delay=$(echo "$delay * 0.9" | bc -l)
            fi
        fi
    done
    
    # Check spike collision
    for ((i=0; i<${#spikes[@]}; i+=2)); do
        if [[ ${spikes[i]} -eq $player_x && ${spikes[i+1]} -eq $player_y ]]; then
            game_over=true
        fi
    done
}

# Main game loop
game_loop() {
    while [[ "$game_over" == false ]]; do
        draw_board
        
        # Non-blocking input (this is simplified for the terminal)
        echo -e "${YELLOW}Use WASD to move, Q to quit${NC}"
        read -n1 -s key
        case $key in
            "q"|"Q") 
                game_over=true
                echo -e "${RED}Game ended!${NC}"
                ;;
            "w"|"W"|"s"|"S"|"a"|"A"|"d"|"D")
                move_player $key
                check_collisions
                ;;
        esac
    done
}

# Show game over screen
show_game_over() {
    clear_screen
    echo -e "${RED}=== GAME OVER ===${NC}"
    echo -e "${YELLOW}Final Score: ${score}${NC}"
    echo -e "${BLUE}Level Reached: ${level}${NC}"
    echo -e "${PURPLE}Thanks for playing the Porcupine Game!${NC}"
}

# Main
main() {
    clear_screen
    echo -e "${CYAN}Welcome to the Porcupine Game!${NC}"
    echo -e "${GREEN}Help the porcupine collect apples while avoiding spikes!${NC}"
    echo ""
    echo -e "${YELLOW}Use ASWD keys to move and Q to quit${NC}"
    echo ""
    read -p "Press Enter to start..."
    
    init_game
    game_loop
    show_game_over
}

# Run main function
main