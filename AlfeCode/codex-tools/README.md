# Codex Tools

Utility scripts for working with the Sterling Codex runner live here. The notes below cover the
basic environment setup that several scripts assume when running on Debian-based hosts.

## Prerequisites

### ripgrep (`rg`)
The scripts reference the `rg` executable for fast text searches. On Debian 12 the package is
called `ripgrep` (not `rg`). Install it with:

```bash
sudo apt update
sudo apt install ripgrep
```

If `ripgrep` is still missing, verify that the standard Debian repositories are enabled in
`/etc/apt/sources.list`. You can optionally enable the Bookworm backports repository for newer
versions:

```bash
echo "deb http://deb.debian.org/debian bookworm-backports main contrib non-free" \
  | sudo tee /etc/apt/sources.list.d/backports.list
sudo apt update
sudo apt -t bookworm-backports install ripgrep
```

As an alternative, install via Cargo if Rust is available:

```bash
cargo install ripgrep
```

This places `rg` in `~/.cargo/bin`; add that directory to your `PATH` if needed. You can also build
from source by downloading the release tarball, running `cargo build --release`, and copying the
resulting `target/release/rg` binary into a directory on your `PATH`.

### Python 3
Some workflows expect Python to be available. Debian 12 ships Python 3, but the `python` command is
not installed by default. Install it with:

```bash
sudo apt update
sudo apt install python3 python3-pip
```

Start the interpreter with `python3`. If you prefer to invoke it with `python`, create a symlink:

```bash
sudo ln -s /usr/bin/python3 /usr/local/bin/python
```

For isolated dependencies, create a virtual environment:

```bash
python3 -m venv venv
source venv/bin/activate
```

Install project-specific packages inside the virtual environment with `pip install <package>`.

## Scripts

- `run_codex.sh` – launches the Sterling Codex runner UI.
- `test_codex_runner.sh` – helper script for validating the runner setup.
- `git_fpush.sh` – force pushes the current branch to its remote (use with caution).
- `codex-runner_angent-instructions.md` – Agent instructions for operating the runner.

These scripts assume the prerequisites above are installed and available on your `PATH`.
