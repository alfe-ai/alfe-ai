# AlSH.ai — AI code agent for full-project execution

> AlSH.ai is an AI code agent for full-project execution.

AlSH.ai runs real end-to-end coding jobs against full repositories: it checks out code, executes an agent run from your prompt, and produces a reviewable diff you can merge. It’s fully open source (MIT), with a hosted experience plus an evolving self-host path.

**Come for the code agent. Stay for the workspace.**

**Formerly Alfe.** AlSH.ai is the continuation of the Alfe project—same core direction, new name and product identity. You may still see “Alfe” referenced in code, docs, and legacy URLs while the transition finishes.

## Key features

- **AI code agent (primary): full-project execution**
  - Runs against git repos (branch-based runs, patch generation, diff review, merge workflow).
  - Optimized for “do the work” prompts rather than chat-only assistance.
- **AI chat (supporting)**
  - Workspace chat for planning, debugging, and iteration across a project.
- **Project management (GitHub-style tasks)**
  - Lightweight task boards / PM workflows tied to execution.
- **AI search (Kagi-style)**
  - Fast, query-first search workflows designed to support coding and research inside the workspace.
- **AI image design**
  - Generate and iterate on images inside the same workspace used for building.
- **Git hosting / repo workflows**
  - Repo operations and run outputs designed around standard git collaboration.

## Screenshots and demo

> If you’re looking for a short demo video: it’s in progress. For now, here are a few UI screenshots from the current repo history.

![AlSH.ai screenshot](https://github.com/user-attachments/assets/15fb43ea-563c-499b-8e04-f54c95e24cc5)

![AlSH.ai screenshot](https://github.com/user-attachments/assets/9e6ecda4-3454-474e-b270-b7a0b7414153)

![AlSH.ai screenshot](https://github.com/user-attachments/assets/b07d3e2c-9750-4533-b208-d6e5f68c439a)

## Model architecture

AlSH.ai’s value is the **agent + workflow layer**: repo execution, branching, diffs, task/workspace integration, and the UI that ties it together. Models are **swappable backends**—you should be able to choose based on speed, cost, and privacy requirements.

### Premium model path

- **Default engine (paid/hosted):** **KAT-Coder-Pro V2**
- **Routing:** via **OpenRouter** through **StreamLake**
- **Billing:** subscription + credits
- **Framing:** KAT is the premium default today, but it’s not the product—AlSH.ai is designed to keep model backends interchangeable over time.

### Self-hosted and open model path

- **Supported open path:** **Qwen3-Coder-30B-A3B**
- **Positioning:** secondary path (capacity-limited), primarily for control/cost/privacy—**not** the primary monetization story.

## Getting started and deploy

The repo is fully MIT licensed and open source, but **self-deployment documentation is still being improved**. If you want to run your own instance today, start with the existing technical docs and scripts in this repo:

- **AlfeCode (code agent / repo execution)**
  - Debian standardized deployment guide: [`AlfeCode/deploy/debian/README.md`](AlfeCode/deploy/debian/README.md)
  - Related scripts live alongside the guide (e.g., bootstrap + installers).
- **Aurora (workspace UI / services)**
  - Current run notes: [`RUNNING.md`](RUNNING.md)
  - Service-level notes: [`Aurora/README.md`](Aurora/README.md) and [`Aurora/.env.example`](Aurora/.env.example)
- **LLM routing / proxy configuration**
  - LiteLLM notes: [`litellm/readme.md`](litellm/readme.md)
  - Model config example: [`litellm/litellm-config.yaml`](litellm/litellm-config.yaml)

If you hit gaps or outdated steps, please **open an issue**—tightening the self-host flow is an active effort.

## License

MIT. See [`LICENSE`](LICENSE).

## Contact

- hello@lochner.tech

## Company

Built by Lochner Technology (lochner.tech).
