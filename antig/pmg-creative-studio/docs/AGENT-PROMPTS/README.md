# Agent Prompts

Reusable prompts for dispatching coding agents (Claude Code, Cursor, Copilot, etc.) on the modular rebuild.

| Prompt | When to use |
|---|---|
| [`extract-app-from-monolith.md`](./extract-app-from-monolith.md) | You're claiming one of the 7 remaining apps (resize-image, new-image, edit-video, etc.) and lifting it out of `UseCaseWizardPage.tsx` into the new modular framework. |
| [`contribute-to-template-builder.md`](./contribute-to-template-builder.md) | You're modifying or improving the Dynamic Template Builder app — filling placeholder steps, polishing UI, fixing bugs, adding features. |

Each prompt is a copy-paste-ready block your agent can act on immediately. They include the required reading list, hard constraints, deliverables, and the commit/PR format.

## Conventions

- One PR per app or per piece of work. Don't bundle.
- Branch off `dev`. Land on `dev`. `main` is reserved for the final cutover.
- Don't deploy. The cutover ships everything in one coordinated `firebase deploy` when Diego declares it.
- Don't modify `WizardShell`, `_registry`, or `src/apps/types.ts` inside an extraction or contribution PR. If the framework contract is missing something, raise it in `#studio-eng` and we'll patch the framework in a separate PR.

## Adding a new prompt

If you find yourself writing a long agent prompt twice, add it here as a `.md` file and link it from the table above.
