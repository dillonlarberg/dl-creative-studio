#!/usr/bin/env bash

set -euo pipefail

usage() {
    cat <<'EOF'
Usage:
  scripts/setup-agent-worktrees.sh [options] <feature-slug> <agent-name> [<agent-name> ...]

Example:
  scripts/setup-agent-worktrees.sh --base main --spec docs/superpowers/specs/2026-03-20-segment-tool-design.md --plan docs/superpowers/plans/2026-03-20-segment-tool.md segment-tool ui proxy tests

Options:
  --base <branch>         Base branch for worker branches. Default: current branch
  --integrator <name>     Integrator name recorded in the coordination file. Default: current user
  --spec <path>           Spec path recorded in the coordination file
  --plan <path>           Plan path recorded in the coordination file
  --runs-dir <path>       Coordination output directory. Default: docs/superpowers/runs
  --dry-run               Print actions without creating branches, worktrees, or files
  -h, --help              Show this help

Behavior:
  - Creates one branch per agent: agent/<feature-slug>-<agent-name>
  - Creates one sibling worktree per agent: ../<repo>-<feature-slug>-<agent-name>
  - Writes a dated coordination file to the runs directory
EOF
}

slugify() {
    printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//'
}

run() {
    if [[ "$dry_run" == "true" ]]; then
        printf '[dry-run] %s\n' "$*"
        return 0
    fi

    "$@"
}

git_run() {
    if [[ "$dry_run" == "true" ]]; then
        printf '[dry-run] git -C %s %s\n' "$project_root" "$*"
        return 0
    fi

    git -C "$project_root" "$@"
}

base_branch=""
integrator="${USER:-integrator}"
spec_path="TBD"
plan_path="TBD"
runs_dir="docs/superpowers/runs"
dry_run="false"
feature_slug=""
agents=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        --base)
            base_branch="${2:-}"
            shift 2
            ;;
        --integrator)
            integrator="${2:-}"
            shift 2
            ;;
        --spec)
            spec_path="${2:-}"
            shift 2
            ;;
        --plan)
            plan_path="${2:-}"
            shift 2
            ;;
        --runs-dir)
            runs_dir="${2:-}"
            shift 2
            ;;
        --dry-run)
            dry_run="true"
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        -*)
            printf 'Unknown option: %s\n' "$1" >&2
            usage >&2
            exit 1
            ;;
        *)
            if [[ -z "$feature_slug" ]]; then
                feature_slug="$(slugify "$1")"
            else
                agents+=("$(slugify "$1")")
            fi
            shift
            ;;
    esac
done

if [[ -z "$feature_slug" || "${#agents[@]}" -eq 0 ]]; then
    usage >&2
    exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "${script_dir}/.." && pwd)"
project_name="$(basename "$project_root")"

if [[ -z "$base_branch" ]]; then
    base_branch="$(git -C "$project_root" branch --show-current)"
fi

if [[ -z "$base_branch" ]]; then
    printf 'Could not determine a base branch. Pass --base explicitly.\n' >&2
    exit 1
fi

if ! git -C "$project_root" rev-parse --verify "$base_branch" >/dev/null 2>&1; then
    printf 'Base branch does not exist locally: %s\n' "$base_branch" >&2
    exit 1
fi

date_stamp="$(date +%F)"
coordination_dir="${project_root}/${runs_dir}"
coordination_file="${coordination_dir}/${date_stamp}-${feature_slug}-coordination.md"

if [[ "$dry_run" == "false" && -e "$coordination_file" ]]; then
    printf 'Coordination file already exists: %s\n' "$coordination_file" >&2
    exit 1
fi

run mkdir -p "$coordination_dir"

branches=()
worktrees=()

for agent in "${agents[@]}"; do
    branch="agent/${feature_slug}-${agent}"
    worktree_rel="../${project_name}-${feature_slug}-${agent}"
    worktree_abs="$(cd "${project_root}/.." && pwd)/${project_name}-${feature_slug}-${agent}"

    branches+=("$branch")
    worktrees+=("$worktree_rel")

    if git -C "$project_root" rev-parse --verify "$branch" >/dev/null 2>&1; then
        printf 'Branch already exists, reusing: %s\n' "$branch"
    else
        git_run branch "$branch" "$base_branch"
    fi

    if [[ -d "$worktree_abs" ]]; then
        printf 'Worktree path already exists, skipping create: %s\n' "$worktree_rel"
        continue
    fi

    git_run worktree add "$worktree_abs" "$branch"
done

if [[ "$dry_run" == "true" ]]; then
    printf '[dry-run] Would write coordination file: %s\n' "$coordination_file"
    exit 0
fi

{
    printf '# Feature Coordination\n\n'
    printf '## Summary\n\n'
    printf -- '- Feature: `%s`\n' "$feature_slug"
    printf -- '- Date: `%s`\n' "$date_stamp"
    printf -- '- Integrator: `%s`\n' "$integrator"
    printf -- '- Spec: `%s`\n' "$spec_path"
    printf -- '- Plan: `%s`\n\n' "$plan_path"

    printf '## Global Rules\n\n'
    printf -- '- Each worker owns only the files listed in their section.\n'
    printf -- '- Shared hot files must have a single owner for the full run.\n'
    printf -- '- Workers run targeted verification only; the integrator runs full verification before merge.\n'
    printf -- '- Optional local lock files can live under `.agent-locks/` and must stay untracked.\n\n'

    printf '## Merge Order\n\n'
    index=1
    for branch in "${branches[@]}"; do
        printf '%d. `%s`\n' "$index" "$branch"
        index=$((index + 1))
    done
    printf '\n## Agents\n\n'

    for i in "${!agents[@]}"; do
        agent="${agents[$i]}"
        branch="${branches[$i]}"
        worktree="${worktrees[$i]}"

        printf '### `%s`\n\n' "$agent"
        printf -- '- Branch: `%s`\n' "$branch"
        printf -- '- Worktree: `%s`\n' "$worktree"
        printf -- '- Status: `planned`\n'
        printf -- '- Depends on: `none`\n'
        printf -- '- Owns:\n'
        printf -- '  - `TBD`\n'
        printf -- '- Avoid:\n'
        printf -- '  - `TBD`\n'
        printf -- '- Targeted verify:\n'
        printf -- '  - `TBD`\n'
        printf -- '- Handoff notes:\n'
        printf -- '  - `TBD`\n\n'
    done

    printf '## Integrator Checklist\n\n'
    printf -- '- Merge branches in the order above.\n'
    printf -- '- Resolve shared-file conflicts before running verification.\n'
    printf -- '- Run `npm run lint`\n'
    printf -- '- Run `npm test`\n'
    printf -- '- Run `npm run build`\n'
    printf -- '- Run `cd functions && npm run build`\n\n'

    printf '## Open Questions\n\n'
    printf -- '- `TBD`\n'
} > "$coordination_file"

printf 'Created coordination file: %s\n' "$coordination_file"
printf 'Created %d agent worktree(s).\n' "${#agents[@]}"
