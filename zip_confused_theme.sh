#!/bin/bash
# Create a ZIP archive of the Shopify theme.
# If an existing archive is found, delete it before creating a new one.

ZIP_NAME="confused-apparel-theme.zip"
THEME_DIR="confused-apparel-theme"

# Remove old archive if it exists
if [ -f "$ZIP_NAME" ]; then
    rm "$ZIP_NAME"
fi

# Create the archive
zip -r "$ZIP_NAME" "$THEME_DIR"

