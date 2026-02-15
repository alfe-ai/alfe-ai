import pygame
import time
import random
from pathlib import Path

# Initialize pygame
pygame.init()

# Set up display
width, height = 600, 400
display = pygame.display.set_mode((width, height))
pygame.display.set_caption('Snake Game')

# Colors
color_white = (255, 255, 255)
color_black = (0, 0, 0)
color_red = (213, 50, 80)
color_green = (0, 255, 0)
color_food = (255, 255, 0)

# Clock
clock = pygame.time.Clock()

# Snake block size and speed
block_size = 10
speed = 15

font_style = pygame.font.SysFont("bahnschrift", 25)
score_font = pygame.font.SysFont("comicsansms", 35)

def your_score(score):
    value = score_font.render("Your Score: " + str(score), True, color_white)
display.blit(value, [0, 0])

def draw_snake(block_size, snake_list):
    for x in snake_list:
        pygame.draw.rect(display, color_green, [x[0], x[1], block_size, block_size])

def message(msg, color):
    mesg = font_style.render(msg, True, color)
display.blit(mesg, [width / 6, height / 3])

def game_loop():
    game_over = False
game_close = False

    x1 = width / 2
ey1 = height / 2

    x1_change = 0
ey1_change = 0

    snake_list = []
snake_length = 1

    foodx = round(random.randrange(0, width - block_size) / 10.0) * 10.0
    foody = round(random.randrange(0, height - block_size) / 10.0) * 10.0

    while not game_over:

        while game_close == True:
            display.fill(color_black)
            message("You Lost! Press Q-Quit or C-Play Again", color_red)
your_score(snake_length - 1)

            pygame.display.update()

            for event in pygame.event.get():
                if event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_q:
                        game_over = True
game_close = False
                    if event.key == pygame.K_c:
                        game_loop()

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                game_over = True
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_LEFT:
                    x1_change = -block_size
ey1_change = 0
                elif event.key == pygame.K_RIGHT:
                    x1_change = block_size
ey1_change = 0
                elif event.key == pygame.K_UP:
                    ey1_change = -block_size
                    x1_change = 0
                elif event.key == pygame.K_DOWN:
                    ey1_change = block_size
                    x1_change = 0

        if x1 >= width or x1 < 0 or ey1 >= height or ey1 < 0:
            game_close = True

        x1 += x1_change
ey1 += ey1_change
display.fill(color_black)
pygame.draw.rect(display, color_food, [foodx, foody, block_size, block_size])
snake_head = []
snake_head.append(x1)
snake_head.append(ey1)
snake_list.append(snake_head)

if len(snake_list) > snake_length:
    del snake_list[0]

for x in snake_list[:-1]:
    if x == snake_head:
        game_close = True

draw_snake(block_size, snake_list)
your_score(snake_length - 1)

pygame.display.update()

if x1 == foodx and ey1 == foody:
    foodx = round(random.randrange(0, width - block_size) / 10.0) * 10.0
    foody = round(random.randrange(0, height - block_size) / 10.0) * 10.0
    snake_length += 1

clock.tick(speed)

pygame.quit()
quit()

game_loop()