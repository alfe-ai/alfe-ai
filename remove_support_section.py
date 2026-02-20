import os
from pathlib import Path

def remove_support_section():
    file_path = Path("README.md")
    lines = file_path.read_text().splitlines()
    
    # Filter out the lines containing the section to remove
    new_lines = [line for line in lines 
                if not (line.strip().startswith("Support") or 
                        (len(line.strip()) < 3 and any("Coming soon." in l for l in lines)))]
    
    # Write the modified content back to the file
    file_path.write_text('\n'.join(new_lines) + '\n')

if __name__ == "__main__":
    remove_support_section()
