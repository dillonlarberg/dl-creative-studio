# Feature Coordination

## Summary

- Feature: `{{FEATURE_NAME}}`
- Date: `{{DATE}}`
- Integrator: `{{INTEGRATOR}}`
- Spec: `{{SPEC_PATH}}`
- Plan: `{{PLAN_PATH}}`

## Global Rules

- Each worker owns only the files listed in their section.
- Shared hot files must have a single owner for the full run.
- Workers run targeted verification only; the integrator runs full verification before merge.
- Optional local lock files can live under `.agent-locks/` and must stay untracked.

## Merge Order

1. `{{MERGE_STEP_1}}`
2. `{{MERGE_STEP_2}}`
3. `{{MERGE_STEP_3}}`

## Agents

### `{{AGENT_NAME}}`

- Branch: `{{BRANCH_NAME}}`
- Worktree: `{{WORKTREE_PATH}}`
- Status: `planned`
- Depends on: `{{DEPENDENCY}}`
- Owns:
  - `{{OWNED_FILE_1}}`
- Avoid:
  - `{{AVOID_FILE_1}}`
- Targeted verify:
  - `{{VERIFY_COMMAND}}`
- Handoff notes:
  - `{{HANDOFF_NOTE}}`

## Integrator Checklist

- Merge branches in the order above.
- Resolve shared-file conflicts before running verification.
- Run `npm run lint`
- Run `npm test`
- Run `npm run build`
- Run `cd functions && npm run build`

## Open Questions

- `{{OPEN_QUESTION_1}}`
