#!/usr/bin/env python3
"""Script to add an elephant story to the about page and stage changes."""

from pathlib import Path

# Read the about.html file
about_path = Path("/git/sterling/b9a3f01e-013f-4988-96ba-f733d59dd247/alfe-ai-1771881255274/Aurora/public/about.html")
content = about_path.read_text()

# Create the elephant story
elephant_story = '''
  <hr>

  <div style="margin-top:18px;">
    <h2 style="color:var(--accent);text-shadow:0 2px 18px rgba(138,43,226,0.12)">The Story of the Elephants</h2>
    <p style="line-height:1.75">
      In the vast savannas of Africa, where the sun paints the sky in hues of gold and amber, 
      there roams a magnificent species known for its intelligence, memory, and social bonds—the elephant. 
      These gentle giants can weigh over 6 tons and live for more than 70 years, witnessing generations 
      of their family herds.
    </p>
    <p style="line-height:1.75">
      Elephants communicate through a complex system of rumbles, trumpets, and even seismic signals 
      that travel through the ground. They remember individuals, places, and experiences for decades, 
      a testament to their remarkable cognitive abilities. In many cultures, elephants symbolize 
      wisdom, strength, and good fortune.
    </p>
    <p style="line-height:1.75">
      Just as elephants protect their young and work together as a herd, our Alfe AI platform is 
      designed to assist, protect, and support users in their digital endeavors—whether navigating 
      software development challenges or managing creative projects with precision and care.
    </p>
    <p class="muted" style="margin-top:1rem">
      Inspired by nature's engineers, we strive to build AI systems that are thoughtful, enduring, 
      and beneficial to all.
    </p>
  </div>
'''

# Insert the story before the final closing div
content = content.replace(
    '  </div>\n</body>',
    elephant_story + '\n  </div>\n</body>'
)

# Write the updated content
about_path.write_text(content)
print("Elephant story added successfully to about.html!")
