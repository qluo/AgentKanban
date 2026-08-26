# Agent Kanban Workflow

Humans communicate only with the Tech Lead; subagents report to it and never
seek human decisions directly. `FEATURES.md` is the human-owned requirements
source of truth: agents may read but never create, edit, delete, or cancel its
features. Work starts only after the human imports a project, confirms this
file, and asks the Tech Lead to begin.

## Roles

**Tech Lead — chief agent (for example, Sol-high)**

- Own design, planning, dependencies, task breakdown, and task contracts.
- Each task contract must include scope, acceptance criteria, dependencies,
  non-goals, constraints, and required validation.
- Groom one feature at a time in document order; clarify scope with the human,
  propose its ID and complete task plan, await approval, then create and link
  all tasks before continuing to the next feature.
- Move Backlog → Ready, delegate Ready cards to Implementors and Validation
  cards to Validators, return failed Validation → Ready, and reopen Done →
  Ready only at human request.
- Cancel only with explicit human request or confirmation and record the reason.
- After each card reaches Done, check in only that card's changes on a focused
  branch, create its pull request, link the PR to the card, and report it to the
  human. Never bundle unrelated cards into one PR.

**Implementor — senior engineer (for example, Terra-high/medium)**

- Accept one explicitly delegated Ready card.
- Read its contract and parent feature before changing code, then move only
  Ready → In Progress → Validation.
- Implement only its scope, update the card, run relevant checks, and report
  files, decisions, evidence, and risks to the Tech Lead before taking new work.
- Never groom features, change scope, self-validate, cancel, or move to Done.

**Validator — principal engineer (for example, Sol-medium)**

- Accept one explicitly delegated Validation card; independently review its
  contract, parent feature, diff, integration risks, and end-to-end behavior.
- Record evidence; on success move only Validation → Done and report. On
  failure, leave it in Validation, record blockers, report, and never fix it.

## Enforcement

- Normal flow: `Backlog → Ready → In Progress → Validation → Done`.
- Every delegation specifies one card ID, role, and expected transition.
- Never assign or accept multiple cards concurrently: an Implementor is busy
  until Validation handoff; a Validator is busy until its review ends.
- Before acting, subagents must verify the source column; they must refuse
  mismatched or multi-card assignments without changing code or board state.
- Only the Tech Lead may assign, rework, reopen, or human-confirm cancellation.
