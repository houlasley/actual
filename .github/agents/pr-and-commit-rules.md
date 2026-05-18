# PR and Commit Rules for AI Agents

This is the single source of truth for all commit and pull request rules that AI agents must follow when working with Actual Budget.

## Commit Rules

### [AI] Prefix Requirement

**ALL commit messages MUST be prefixed with `[AI]`.** This is a mandatory requirement with no exceptions.

**Examples:**

- `[AI] Fix type error in account validation`
- `[AI] Add support for new transaction categories`
- `Fix type error in account validation` (MISSING PREFIX - NOT ALLOWED)
- `Add support for new transaction categories` (MISSING PREFIX - NOT ALLOWED)

### Git Safety Rules

- **Never** update git config
- **Never** run destructive git operations (force push, hard reset) unless the user explicitly requests it
- **Never** skip hooks (`--no-verify`, `--no-gpg-sign`)
- **Never** force push to `main`/`master`
- **Never** commit unless explicitly asked by the user

## Automatic PR on Issue Completion

When working on a GitHub issue, **automatically create a pull request when the work is complete** — do not wait to be asked.

Steps to follow after finishing issue work:

1. Complete the Pre-Commit Quality Checklist above
2. Push the branch to the remote
3. Open a PR with:
   - Title prefixed with `[AI]`
   - The `"AI generated"` label
   - The issue linked in the body (e.g., `Closes #<issue-number>`)
   - PR template left blank (do not fill it in)

## Pre-Commit Quality Checklist

Before committing, ensure all of the following:

- [ ] Commit message is prefixed with `[AI]`
- [ ] `yarn typecheck` passes
- [ ] `yarn lint:fix` has been run
- [ ] Relevant tests pass
- [ ] User-facing strings are translated
- [ ] Code style conventions followed (see `AGENTS.md` for full style guide)

## Pull Request Rules

### [AI] Prefix Requirement

**ALL pull request titles MUST be prefixed with `[AI]`.** This is a mandatory requirement with no exceptions.

**Examples:**

- `[AI] Fix type error in account validation`
- `[AI] Add support for new transaction categories`
- `Fix type error in account validation` (MISSING PREFIX - NOT ALLOWED)

### Labels

Add the **"AI generated"** label to all AI-created pull requests. This helps maintainers understand the nature of the contribution.

## Quick-Reference Workflow

Follow these steps when committing and creating PRs:

1. Make your changes
2. Run `yarn typecheck` — fix any errors
3. Run `yarn lint:fix` — fix any remaining lint errors
4. Run relevant tests (`yarn test` for all, or workspace-specific)
5. Stage files and commit with `[AI]` prefix — do not skip hooks
6. Push the branch to the remote
7. Create a PR (automatically, without waiting to be asked):
   - Use `[AI]` prefix in the title
   - Add the `"AI generated"` label
   - Link the issue with `Closes #<issue-number>`
   - Leave the PR template blank (do not fill it in)
