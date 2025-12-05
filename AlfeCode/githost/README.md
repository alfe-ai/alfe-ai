
githost
======

This folder contains `git-server.sh`, a helper script to set up a simple SSH-key-only Git server on Debian 12/13.

Quick start (on the server):

1. Copy your public SSH key to the admin machine.
2. Run as root: `sudo ./git-server.sh install`
3. Add a key: `sudo ./git-server.sh add-key /path/to/yourkey.pub "your-email@example.com"`
4. Create a repository: `sudo ./git-server.sh create-repo myproject` (uses the `git` user if present, otherwise your current user)
5. From a client with the corresponding private key: `git clone git@server:myproject.git`

Notes:
- The script creates a system `git` user with home `/srv/git` and uses `git-shell` to restrict shell access. If you skip creating
  the `git` user, repository ownership falls back to the account running `create-repo`.
- SSH is configured to disallow password authentication and restrict the `git` user to `git-shell`.
- Per-key forced commands (like limiting a key to a single repository) are possible by editing `/srv/git/.ssh/authorized_keys` and prefixing keys manually with a `command="..."` directive.
- This script is intentionally minimal for clarity; review it before running in production.


Local no-auth option (localhost-only)
------------------------------------

You can run a local, no-auth git daemon bound to localhost to allow anonymous access from the same machine:

- After installation, create repos with `sudo ./git-server.sh create-repo myproject`.
- Start the localhost-only daemon: `sudo ./git-server.sh start-daemon`.
- Clone locally: `git clone git://127.0.0.1/myproject.git`.

This daemon is explicitly bound to `127.0.0.1` so only processes on the host can access it; it does not accept external network connections.
