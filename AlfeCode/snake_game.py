import random
import curses
import time

def main(stdscr):
    # Initialize curses
    curses.curs_set(0)  # Hide cursor
    stdscr.nodelay(1)  # Non-blocking input
    stdscr.timeout(150)  # Refresh speed (milliseconds)
    
    # Set up game area
    sh, sw = stdscr.getmaxyx()
    game_area = stdscr.subwin(sh-1, sw, 0, 0)  # Leave one line for score
    game_area.keypad(1)
    
    # Initial snake position and direction
    snake = [
        [sh//2, sw//4],
        [sh//2, sw//4 - 1],
        [sh//2, sw//4 - 2]
    ]
    
    # Initial food position
    food = [sh//2, sw//2]
    
    # Initial direction
    direction = curses.KEY_RIGHT
    
    # Initial score
    score = 0
    
    # Draw initial food
    game_area.addch(food[0], food[1], curses.ACS_DIAMOND)
    
    # Game loop
    while True:
        # Check for key press
        key = game_area.getch()
        
        # Handle direction changes
        if key == curses.KEY_UP and direction != curses.KEY_DOWN:
            direction = curses.KEY_UP
        elif key == curses.KEY_DOWN and direction != curses.KEY_UP:
            direction = curses.KEY_DOWN
        elif key == curses.KEY_LEFT and direction != curses.KEY_RIGHT:
            direction = curses.KEY_LEFT
        elif key == curses.KEY_RIGHT and direction != curses.KEY_LEFT:
            direction = curses.KEY_RIGHT
        
        # Calculate new head position based on direction
        head = snake[0][:]
        if direction == curses.KEY_UP:
            head[0] -= 1
        elif direction == curses.KEY_DOWN:
            head[0] += 1
        elif direction == curses.KEY_LEFT:
            head[1] -= 1
        elif direction == curses.KEY_RIGHT:
            head[1] += 1
        
        # Check collision with walls
        if (head[0] in [0, sh-1] or 
            head[1] in [0, sw-1] or 
            head in snake):
            break
        
        # Add new head to snake
        snake.insert(0, head)
        
        # Check if food is eaten
        if head == food:
            # Increase score
            score += 10
            
            # Generate new food at random position
            while True:
                food = [
                    random.randint(1, sh-2),
                    random.randint(1, sw-2)
                ]
                if food not in snake:
                    break
            
            # Draw new food
            game_area.addch(food[0], food[1], curses.ACS_DIAMOND)
        else:
            # Remove tail if no food eaten
            tail = snake.pop()
            game_area.addch(tail[0], tail[1], ' ')
        
        # Draw snake
        game_area.addch(head[0], head[1], curses.ACS_BLOCK)
        
        # Update score display
        stdscr.addstr(0, 2, f"Score: {score}")
        stdscr.refresh()
        
        # Clear screen and redraw
        game_area.refresh()
    
    # Game over screen
    game_area.clear()
    game_area.addstr(sh//2, sw//2 - 5, "Game Over!")
    game_area.addstr(sh//2 + 1, sw//2 - 8, f"Final Score: {score}")
    game_area.addstr(sh//2 + 2, sw//2 - 12, "Press any key to exit")
    game_area.refresh()
    
    # Wait for keypress before ending
    game_area.getch()

if __name__ == "__main__":
    curses.wrapper(main)