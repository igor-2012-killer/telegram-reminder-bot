# Contributing to Telegram Reminder Bot

First off, thanks for taking the time to contribute! 🎉

## How Can I Contribute?

### Reporting Bugs

- Use the **Bug Report** template.
- Check if the bug was already reported.
- Provide a clear description and steps to reproduce.

### Suggesting Enhancements

- Use the **Feature Request** template.
- Explain why this feature would be useful.

### Pull Requests

1.  Fork the repo and create your branch from `master`.
2.  If you've added code that should be tested, add tests.
3.  `npm test`, `npm run lint`, `npm run format:check`, and `npm run typecheck` must pass. `AGENTS.md` lists what each check locks.
4.  Issue that pull request!

## Project Setup

1.  `npm install`
2.  `cp .env.example .env` (Add your bot token)
3.  `npm run dev`

## Code Style

Run `npm run lint` and `npm run format:check` instead of restating style rules here. `npm run typecheck` covers `src/`, `test/`, and `scripts/`.

Thank you! 👋
