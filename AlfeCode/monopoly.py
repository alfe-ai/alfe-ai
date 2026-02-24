#!/usr/bin/env python3

"""
Simple Monopoly game implementation in Python
Run this file to play Monopoly directly in the console
"""

import random
import json
import sys
import os

class Player:
    def __init__(self, name: str, position: int = 0, money: int = 1500):
        self.name = name
        self.position = position
        self.money = money
        self.properties = []
        self.in_jail = False
        self.jail_turns = 0
        self.is_bankrupt = False
        
    def __str__(self):
        return f"Player {self.name}: ${self.money}, Position: {self.position}"
    
    def move(self, steps: int, board_size: int = 40):
        self.position = (self.position + steps) % board_size
    
    def pay(self, amount: int, to_player=None):
        if self.money >= amount:
            self.money -= amount
            if to_player:
                to_player.money += amount
            return True
        return False
    
    def receive(self, amount: int):
        self.money += amount

class Property:
    def __init__(self, name: str, price: int, rent: int, color: str = "none"):
        self.name = name
        self.price = price
        self.rent = rent
        self.color = color
        self.owner = None
        self.houses = 0
        self.mortgaged = False
        
    def __str__(self):
        return f"{self.name} (${self.price}) - Owner: {self.owner or 'None'}"

class Game:
    def __init__(self, player_names: list):
        self.player_names = player_names
        self.players = [Player(name) for name in player_names]
        self.current_player_index = 0
        self.game_over = False
        self.board = self.create_board()
        self.dice_history = []
        
    def create_board(self) -> list:
        """Create a simple Monopoly board with properties"""
        properties = [
            # Go (0)
            Property("Go", 0, 0, "GO"),
            # Brown properties
            Property("Mediterranean Avenue", 60, 2, "Brown"),
            Property("Baltic Avenue", 60, 4, "Brown"),
            # Community Chest (3)
            Property("Community Chest", 0, 0, "Chest"),
            # Light Blue properties
            Property("Oriental Avenue", 100, 6, "Light Blue"),
            Property("Vermont Avenue", 100, 6, "Light Blue"),
            Property("Connecticut Avenue", 120, 8, "Light Blue"),
            # Jail (10)
            Property("Jail", 0, 0, "Jail"),
            # Pink properties
            Property("St. Charles Place", 140, 10, "Pink"),
            Property("States Avenue", 140, 10, "Pink"),
            Property("Virginia Avenue", 160, 12, "Pink"),
            # Utility (18)
            Property("Electric Company", 150, 0, "Utility"),
            # Orange properties
            Property("St. James Place", 180, 14, "Orange"),
            Property("Tennessee Avenue", 180, 14, "Orange"),
            Property("New York Avenue", 200, 16, "Orange"),
            # Free Parking (20)
            Property("Free Parking", 0, 0, "Free"),
            # Red properties
            Property("Kentucky Avenue", 220, 18, "Red"),
            Property("Indiana Avenue", 220, 18, "Red"),
            Property("Illinois Avenue", 240, 20, "Red"),
            # Railroad (25)
            Property("B&O Railroad", 200, 0, "Railroad"),
            # Yellow properties
            Property("Atlantic Avenue", 260, 22, "Yellow"),
            Property("Ventnor Avenue", 260, 22, "Yellow"),
            Property("Water Works", 150, 0, "Utility"),
            Property("Marvin Gardens", 280, 24, "Yellow"),
            # Go To Jail (31)
            Property("Go To Jail", 0, 0, "Jail"),
            # Green properties
            Property("Pacific Avenue", 300, 26, "Green"),
            Property("North Carolina Avenue", 300, 26, "Green"),
            Property("Pennsylvania Avenue", 320, 28, "Green"),
            # Railroad (35)
            Property("Short Line", 200, 0, "Railroad"),
            # Blue properties
            Property("Park Place", 350, 35, "Blue"),
            Property("Boardwalk", 400, 50, "Blue"),
        ]
        return properties
    
    def roll_dice(self) -> tuple:
        """Roll two dice and return the result."""
        dice1 = random.randint(1, 6)
        dice2 = random.randint(1, 6)
        self.dice_history.append((dice1, dice2))
        return (dice1, dice2)
    
    def get_current_player(self):
        return self.players[self.current_player_index]
    
    def next_player(self):
        """Move to next player."""
        self.current_player_index = (self.current_player_index + 1) % len(self.players)
    
    def is_game_over(self) -> bool:
        """Check if game is over (only one player left)."""
        active_players = [p for p in self.players if not p.is_bankrupt]
        return len(active_players) <= 1
    
    def can_afford(self, player: Player, amount: int) -> bool:
        """Check if player can afford an amount."""
        return player.money >= amount
    
    def buy_property(self, player: Player):
        """Player buys current property."""
        current_position = player.position
        property = self.board[current_position]
        
        if property.owner or property.mortgaged or property.price == 0:
            return False
            
        if self.can_afford(player, property.price):
            player.pay(property.price)
            property.owner = player.name
            player.properties.append(property.name)
            return True
        return False
    
    def pay_rent(self, player: Player):
        """Pay rent on current property."""
        current_position = player.position
        property = self.board[current_position]
        
        # If it's owned (not free spaces) and not mortgaged
        if property.owner and not property.mortgaged:
            # Check if owner has the property in the current player's possession
            owner = self.get_player_by_name(property.owner)
            if owner:
                if player != owner:
                    # Pay rent to owner
                    if player.money >= property.rent:
                        player.pay(property.rent, owner)
                        return True
        return False
    
    def get_player_by_name(self, player_name) -> Player:
        """Get player object by name."""
        for player in self.players:
            if player.name == player_name:
                return player
        return None

def main():
    print("Welcome to Monopoly!")
    print("Enter number of players (2-6): ", end="")
    
    try:
        num_players = int(input())
        if num_players < 2 or num_players > 6:
            print("Invalid number of players. Using 2 players.")
            num_players = 2
    except:
        print("Invalid input. Using 2 players.")
        num_players = 2
    
    player_names = []
    for i in range(num_players):
        print(f"Enter name for player {i+1}: ", end="")
        name = input().strip() or f"Player{i+1}"
        player_names.append(name)
    
    game = Game(player_names)
    
    print("\nStarting game!\n")
    
    # Game loop
    while not game.is_game_over():
        current_player = game.get_current_player()
        print(f"\n{current_player.name}'s turn:")
        print(f"Money: ${current_player.money}")
        print(f"Position: {game.board[current_player.position].name}")
        
        # Roll dice
        dice1, dice2 = game.roll_dice()
        print(f"Rolled {dice1} and {dice2}")
        
        # Move player
        steps = dice1 + dice2
        current_player.move(steps)
        print(f"Moved to {game.board[current_player.position].name}")
        
        # Handle property actions
        current_property = game.board[current_player.position]
        
        if current_property.price > 0 and current_property.owner is None:
            # Property is available for purchase
            print(f"Property: {current_property.name} - Price: ${current_property.price}")
            if game.can_afford(current_player, current_property.price):
                print("Buy Property? (y/n): ", end="")
                try:
                    choice = input().strip().lower()
                    if choice == "y":
                        success = game.buy_property(current_player)
                        if success:
                            print(f"{current_player.name} bought {current_property.name}")
                        else:
                            print("Transaction failed.")
                    else:
                        print("Property not purchased.")
                except:
                    print("No action taken.")
            else:
                print("Can't afford this property.")
        elif current_property.owner and current_property.owner != current_player.name:
            # Pay rent to owner
            print(f"Owner: {current_property.owner}")
            if current_player.money >= current_property.rent:
                success = game.pay_rent(current_player)
                if success:
                    print(f"{current_player.name} paid ${current_property.rent} rent to {current_property.owner}")
                else:
                    print("Failed to pay rent.")
            else:
                print("Player is bankrupt!")
                current_player.is_bankrupt = True
                
        # Check if game is over
        if game.is_game_over():
            break
            
        print("\nPress Enter to continue...", end="")
        try:
            input()
        except:
            pass
            
        # Move to next player
        game.next_player()
    
    # Announce winner
    active_players = [p for p in game.players if not p.is_bankrupt]
    if len(active_players) == 1:
        print(f"\n🎉 {active_players[0].name} wins the game! 🎉")
    else:
        print("\nGame ended. No winner.")

if __name__ == "__main__":
    main()