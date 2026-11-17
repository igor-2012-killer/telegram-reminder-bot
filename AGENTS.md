# Notes for agents

Automated checks are the contract. Link these instead of copying the rules into new docs.

- Reminder access: `npm test` (`test/reminderAccessGuard.test.ts`) and `npm run lint` (`no-restricted-syntax` in `eslint.config.mjs`). Use the helpers in `src/services/reminderAccess.ts`.
- Image and lockfile hygiene: `npm test` (`test/dockerSecrets.test.ts`).
- Lint: `npm run lint` (`eslint.config.mjs`).
- Format: `npm run format:check` (`.prettierrc.json`).
- Types: `npm run typecheck` (`tsconfig.json` for `src/`, `tsconfig.tests.json` for `test/` and `scripts/`).

Bug reports, feature requests, and whether a change needs a test stay in `.github/CONTRIBUTING.md`.
