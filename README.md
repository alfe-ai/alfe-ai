<img width="2172" height="724" alt="image" src="https://github.com/user-attachments/assets/e22250eb-a6cf-4e6c-8cfb-f0bc2c1bc08a" />

# ALSH.ai | Alchemist Shell — AI code agent for full-project workflows

ALSH.ai runs real end-to-end coding jobs against full repositories: it checks out code, executes an agent run from your prompt, and produces a reviewable diff you can merge. It’s fully open source (MIT), with a hosted cloud experience plus a self-host path.

**Come for the code agent. Stay for the workspace.**

**Formerly Alfe.** ALSH.ai is the continuation of the Alfe project. You may still see “Alfe” referenced in code, docs, and legacy URLs while the transition finishes.

## Key features

- **AI code agent (primary): full-project workflows**
  - Runs against git repos (branch-based runs, patch generation, diff review, merge workflow).
  - Optimized for “do the work” prompts rather than chat-only assistance.
- **AI chat**
  - Workspace chat for planning and iteration.
- **Project management (GitHub-style tasks)**
  - Lightweight task boards / project management.
- **AI image design**
  - Generate and iterate on images inside the Chat workspace.
- **AI search (included in chat)**
  - Fast search.
- **Git hosting / repo workflows**
  - Repo operations for standard git collaboration.

## Screenshots

<img width="1772" height="1504" alt="image" src="https://github.com/user-attachments/assets/15fb43ea-563c-499b-8e04-f54c95e24cc5" />

<img width="1772" height="1504" alt="image" src="https://github.com/user-attachments/assets/9e6ecda4-3454-474e-b270-b7a0b7414153" />

<img width="1772" height="651" alt="image" src="https://github.com/user-attachments/assets/8b15c1f2-a448-43e7-b714-1242a04d80e6" />

<img width="772" height="1415" alt="image" src="https://github.com/user-attachments/assets/b07d3e2c-9750-4533-b208-d6e5f68c439a" />

<img width="1355" height="1017" alt="image" src="https://github.com/user-attachments/assets/e5aa1ffa-9f49-4863-aff0-80b1ee627896" />

<img width="1314" height="1162" alt="image" src="https://github.com/user-attachments/assets/f2011c6e-f1ef-4548-8310-db39ceb2359d" />

<img width="2083" height="749" alt="image" src="https://github.com/user-attachments/assets/d18cb826-4964-4289-9fbb-b42be684c321" />

<img width="603" height="1178" alt="image" src="https://github.com/user-attachments/assets/0493dece-3756-4ece-9a9f-a8f05df387e3" />

## Architecture

ALSH.ai’s value is the **agent + workflow layer**: repo execution, branching, diffs, task/workspace integration, and the UI that ties it together. Models are **swappable backends**—you should be able to choose based on speed, cost, and privacy requirements.

### Premium model path

- **Default engine (paid/cloud):** **KAT-Coder-Pro V2**
- **Routing:** via **OpenRouter** through **StreamLake**
- **Billing:** subscription + credits
- KAT is the premium default today, but it’s not the product—ALSH.ai is designed to keep model backends interchangeable over time.

### Self-hosted and open model path

- **Supported open path:** **Qwen3-Coder-30B-A3B**
- Secondary path (capacity-limited)

### Server architecture

Server Architecture is divided into separate components. For code.alsh.ai, it has separate front-end servers, a back-end working-environment server, a git host, a separate database server, and a separate LiteLLM proxy server.

The front-end is hosted as multiple round-robin webservers for easy scalability. The front-end servers do not retain any user information, so it is easy to scale up as many as needed, and it does not matter which front-end server the user connects to. The chat.alsh.ai has a separate front-end server, but shares the database server.

The back-end working-environment server, to start, hosts the users working environment and runs the AI code agent on the working environment, it also hosts the Qwen 32b LLM model on the GPU. As users grow I will scale to multiple back-end servers similar to the front-end. The LiteLLM proxy server routes for the chat.alsh.ai front-end and for the advanced Kwaipilot: KAT-Coder-Pro V2 model for the code agent.

The user data sent in chats/LLM prompts will be encrypted on disk/in database similar to Proton Mail encryption, so ideally data will not be accessible by ALSH.ai, only by users themselves. User git working directories will be encrypted the same way when the AI agent is not actively working on the users directory (This allows user code to remain as private as possible, if the user uses an external git integration like GitHub instead of the ALSH.ai git host.).

## Getting started and deploy

The repo is fully MIT licensed and open source, but **self-deployment documentation is still being improved, with plans for easier options such as Docker, Snap, and Flatpak**. If you want to run your own instance today, start with the existing technical docs and scripts in this repo:

- **AlfeCode (code UI / code agent / repo execution)**
  - Debian standardized deployment guide: [`AlfeCode/deploy/debian/README.md`](AlfeCode/deploy/debian/README.md)
  - Related scripts live alongside the guide (e.g., bootstrap + installers).
- **Aurora (chat workspace UI / services)**
  - Current run notes: [`RUNNING.md`](RUNNING.md)
  - Service-level notes: [`Aurora/README.md`](Aurora/README.md) and [`Aurora/.env.example`](Aurora/.env.example)
- **LLM routing / proxy configuration**
  - LiteLLM notes: [`litellm/readme.md`](litellm/readme.md)
  - Model config example: [`litellm/litellm-config.yaml`](litellm/litellm-config.yaml)

If you hit gaps or outdated steps, please **open an issue**—tightening the self-host flow is an active effort.

## License

MIT. See [`LICENSE`](LICENSE).

## Contact

- engineering@lochner.tech

## Company

Built by Lochner Technology ([lochner.tech](https://lochner.tech)).
