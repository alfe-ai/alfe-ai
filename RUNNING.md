Overview

The Alfe AI “Aurora” service is a Node/Express app that serves the web UI (including the Mosaic panel) and exposes REST endpoints for Mosaic file management; it runs from the alfe-ai/Aurora workspace and stores Mosaic files under Aurora/mosaic/files.
Step-by-step

    Prepare your environment

        Copy Aurora/.env.example to .env and fill in any keys you need (e.g., OPENAI_API_KEY), adjust AURORA_PORT if you don’t want the default 3000, and you can set DISABLE_2FA=true for local testing.

        Use a recent Node.js runtime (the project is pure npm/Express) and install the Aurora dependencies:

        cd alfe-ai/Aurora
        npm install

        (package.json defines the runtime dependencies and the scripts you’ll run next).

    Start the backend

        Launch the web server with npm run web (or node src/server.js); it listens on AURORA_PORT/PORT (default 3000) and automatically creates/serves the Mosaic workspace at Aurora/mosaic/files, shielding any .git internals.

        The server exposes /api/mosaic/save, /api/mosaic/list, /api/mosaic/get, /api/mosaic/git-init, and /api/mosaic/path for the UI to persist files and optionally initialize a standalone Git repository inside that directory.

    Open the UI

        Visit http://localhost:3000/ (or your chosen port); the root route serves aurora.html, which is the main workspace shell.

        When the page loads, it immediately fetches the Mosaic file list and repo path via the endpoints above, readying the panel state on the client side.

    Enable the Mosaic panel

        The Mosaic panel is shown only on tabs whose type is PM AGI or Tasks; the client enforces this via mosaicAllowedTypes and hides the controls otherwise.

        Use the tab “Chat Settings” dialog (Rename Tab modal) or the global “Chat Settings” modal to change a tab’s type to PM AGI/Tasks and tick “Show mosaic panel.” Both dialogs expose the checkbox so you can toggle visibility per tab or globally.

    Work inside Mosaic

        Once enabled, the Mosaic panel appears in the main workspace with the repo path, file list, and an “Initialize Git Repository” button.

        The client can open/edit files, call /api/mosaic/save, and initialize Git from the UI; after clicking “Initialize Git Repository,” the UI refreshes the displayed path and alerts you whether a repo already existed or was just created.

Testing

⚠️ Not run (read-only analysis).
