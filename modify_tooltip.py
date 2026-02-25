#!/usr/bin/env python3

import os
import re

# Read the EJS file
ejs_file_path = "/git/sterling/ab6788f1-3688-48a1-a686-efc84bb67ac0/alfe-ai-1772063466681/AlfeCode/executable/views/codex_runner.ejs"
with open(ejs_file_path, 'r', encoding='utf-8') as file:
    content = file.read()

# Find the tooltip JavaScript section
tooltip_pattern = re.compile(
    r'// Tooltip logic\n\(function\(\)\{\n(.*?)\n\}\)\(\);',
    re.DOTALL
)

match = tooltip_pattern.search(content)
if match:
    # Extract the current tooltip JavaScript code
    current_tooltip_js = match.group(0)
    
    # Create new tooltip logic that only disappears after run submission
    new_tooltip_js = '''// Tooltip logic
(function(){
    const tooltip = document.getElementById('promptTooltip');
    const promptField = document.getElementById('prompt');
    const tooltipCookie = 'promptTooltipShown';
    const tooltipLoggedInCookie = 'promptTooltipSuppressedForLoggedIn';
    const config = window.CodexRunnerConfig || {};

    // Check if user is logged in based on actual account data.
    const isUserLoggedIn = !!(config.initialAccountInfo && config.initialAccountInfo.email);

    // Function to check if cookie exists
    function hasCookie(cookieName) {
        return document.cookie.split(';').some((cookie) => {
            const [name, value] = cookie.trim().split('=');
            return name === cookieName;
        });
    }

    function setCookie(cookieName, cookieValue, maxAgeDays) {
        const expirationDate = new Date();
        expirationDate.setTime(expirationDate.getTime() + (maxAgeDays * 24 * 60 * 60 * 1000));
        document.cookie = `${cookieName}=${cookieValue};expires=${expirationDate.toUTCString()};path=/`;
    }

    // For logged-in users, always suppress this tooltip and persist with a cookie.
    if (isUserLoggedIn) {
        setCookie(tooltipLoggedInCookie, 'true', 30);
        setCookie(tooltipCookie, 'true', 30);
        if (tooltip) {
            tooltip.classList.remove('show');
        }
        return;
    }

    // Show tooltip after a brief delay if user is not logged in and has not seen it before.
    if (!hasCookie(tooltipCookie) && !hasCookie(tooltipLoggedInCookie)) {
        setTimeout(() => {
            if (tooltip && promptField) {
                tooltip.classList.add('show');
                setCookie(tooltipCookie, 'true', 30);
            }
        }, 1000);
    }

    // Add click handler to dismiss tooltip (no auto-hide after 5 seconds)
    if (tooltip && promptField) {
        tooltip.addEventListener('click', function() {
            tooltip.classList.remove('show');
            setCookie(tooltipCookie, 'true', 30);
        });
    }

    // Hide tooltip when user starts typing
    if (promptField) {
        promptField.addEventListener('focus', function() {
            if (tooltip) {
                tooltip.classList.remove('show');
            }
        });
    }
    
    // Track if a run has been submitted
    const runButton = document.getElementById('runButton');
    if (runButton) {
        runButton.addEventListener('click', function() {
            // Only hide tooltip when user submits the first run
            if (tooltip) {
                tooltip.classList.remove('show');
            }
        });
    }
})();'''

    # Replace the old tooltip code with new tooltip code
    updated_content = content.replace(current_tooltip_js, new_tooltip_js)
    
    # Write the updated content back to the file
    with open(ejs_file_path, 'w', encoding='utf-8') as file:
        file.write(updated_content)
    
    print("Tooltip logic successfully updated in codex_runner.ejs")
else:
    print("Could not find the tooltip JavaScript section")