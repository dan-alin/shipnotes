# notegen

Generate release notes from git commit history.

## Installation

### Local (recommended for projects)

```bash
# With npm
npm install --save-dev @definitely-not-devs/notegen

# With pnpm
pnpm add -D @definitely-not-devs/notegen

# With yarn
yarn add -D @definitely-not-devs/notegen
```

### Global (use across multiple projects)

```bash
# With npm
npm install -g @definitely-not-devs/notegen

# With pnpm
pnpm add -g @definitely-not-devs/notegen

# With yarn
yarn global add @definitely-not-devs/notegen
```

With global installation, use `notegen` directly without `npx`.

## Quick Start

1. Initialize configuration:

```bash
npx notegen init
```

This creates a `notegen.json` file in your project:

```json
{
  "baseUrl": "https://jira.company.com/browse",
  "releaseNotes": true,
  "output": "CHANGELOG.md"
}
```

2. Generate release notes:

```bash
npx notegen generate
```

## Usage

### Basic Usage

```bash
# Generate release notes for all commits
npx notegen generate

# Or add to package.json scripts:
{
  "scripts": {
    "release-notes": "notegen generate"
  }
}

# Then run:
pnpm release-notes
```

### Advanced Options

```bash
# Specify output file
npx notegen generate -o CHANGELOG.md

# Generate for specific commit range
npx notegen generate --from v1.0.0 --to v2.0.0

# Generate for a specific tag (auto-detects previous tag)
npx notegen generate --to v2.0.0

# Generate for the latest tag (auto-detects last and previous tag)
npx notegen generate --last --release-notes

# Limit number of commits
npx notegen generate --limit 10

# Generate release notes format (grouped by feat/fix with tickets)
npx notegen generate --release-notes

# With ticket links
npx notegen generate --release-notes --base-url https://jira.company.com/browse
```

## Options

- `-o, --output <file>` - Output file path (default: `RELEASE_NOTES.md`)
- `-f, --from <commit>` - Start from commit/tag (exclusive)
- `-t, --to <commit>` - End at commit/tag (inclusive, default: `HEAD`)
- `-l, --limit <number>` - Limit number of commits
- `-r, --release-notes` - Generate release notes format with grouped tickets (feat/fix)
- `--no-release-notes` - Generate standard changelog format (overrides config)
- `-b, --base-url <url>` - Base URL for linking tickets
- `--last` - Generate release notes for the last tag (auto-detects previous tag)

CLI options override configuration file settings.

## Commit Processing

### Chronological Order

Commits are processed in **reverse chronological order** (newest to oldest). This ensures the most recent changes appear first in your release notes.

### Revert Commit Handling

The tool automatically handles revert commits to keep your release notes accurate:

**How it works:**

1. **Detects revert commits** - Identifies commits starting with "Revert" or "revert"
2. **Extracts reverted tickets** - Finds ticket references (US-123, BUG-456, etc.) in the revert commit
3. **Removes earlier commits** - Filters out commits with those ticket IDs that came _before_ the revert
4. **Preserves newer commits** - Keeps commits with the same ticket ID if they came _after_ the revert

**Example timeline:**

```bash
# Commit history (oldest to newest)
git commit -m "feat: add feature US-123"        # ✗ Will be removed
git commit -m "Revert: feat US-123"             # ✗ Revert itself removed
git commit -m "feat: re-add feature US-123"     # ✓ Kept (after revert)
```

**Result:** Only the final implementation of US-123 appears in release notes.

**Supported revert formats:**

```bash
# Standard git revert
Revert "feat: add feature US-123"

# Manual revert with ticket in message
revert: remove feature US-123

# Revert with ticket in body
Revert "feat: add feature"

US: 123
```

This prevents duplicate or incorrect entries when features are reverted and re-implemented.

## Modes

### Basic Mode (default, or with `--no-release-notes`)

Groups commits by conventional commit prefixes and scopes:

```bash
feat(api): add user authentication
fix(ui): resolve login bug
chore: update dependencies
```

Generates a hierarchical changelog:

```markdown
## Features

### api

- add user authentication

### ui

- update dashboard

## Bug Fixes

### api

- resolve login bug
```

Commits are grouped by type (feat/fix/other), then by scope. Commits without a scope appear under "Other".

Custom sections from config are **not used** in basic mode.

If your config has `"releaseNotes": true` by default, you can override it with `--no-release-notes` to use basic mode.

### Release Notes Mode (`--release-notes`)

Groups commits by ticket references for tracking. The ticket reference can be in either the commit message or body:

```bash
# In commit message (single -m)
git commit -m "feat: add user authentication US-123"
```

```bash
# In commit footer (multiple -m or editor)
feat: add user authentication

US: 123
```

```bash
fix: resolve login bug

BUG: 456
```

In release notes mode, commits are grouped by ticket reference type (`US`, `BUG`, etc.) instead of the commit message prefix.

**Supported ticket formats:**

- Numeric: `US123`, `US 123`, `US-123`, `US:123`, `US#123`
- Alphanumeric: `JIRA-ABC-123`, `BUG_456`, `US-2024-789`
- Multiple tickets per commit: `US 234 & BUG 456` (each ticket gets its own line)
- Mixed types: `US 234, BUG 456` (appears in both User Stories and Bugs sections)

**Requirements:**

- Pattern must be a complete word (e.g., `US` won't match in `FOCUS`)
- Ticket ID must contain at least one digit
- Supports custom patterns defined in your config

Commits without matching ticket references are excluded from release notes mode.

## Custom Sections

You can configure custom sections in `notegen.json`:

```json
{
  "sections": [
    {
      "section": "User Stories",
      "pattern": "US",
      "label": "US"
    },
    {
      "section": "Bugs",
      "pattern": "BUG",
      "label": "BUG"
    },
    {
      "section": "Improvements",
      "pattern": "IMPROVEMENT",
      "label": "IMPROVEMENT"
    }
  ]
}
```

Each section matches commits based on ticket references in either the commit message or body.

**Pattern matching rules:**

- The `pattern` must match as a complete word (word boundaries enforced)
- Ticket IDs must contain at least one digit
- Flexible separators: space, dash, colon, or no separator
- Supports alphanumeric ticket IDs (e.g., `JIRA-ABC-123`)
- Multiple tickets in one commit will create separate entries

**Example patterns:**

- `US` matches: `US123`, `US-123`, `US 123`, `US:123`, `US#123`, `US-ABC-123`
- `BUG` matches: `BUG456`, `BUG-456`, `BUG_789`
- Won't match: `FOCUS 123` (US is not a complete word), `US for` (no digit)

## Practical Examples

### Example 1: Simple Release with Reverts

**Git History:**

```bash
git commit -m "feat: add login feature" -m "US: 100"
git commit -m "fix: resolve auth bug" -m "BUG: 200"
git commit -m "feat: add dashboard" -m "US: 101"
git commit -m "Revert: fix auth" -m "BUG: 200"  # Reverting BUG-200
git commit -m "fix: proper auth fix" -m "BUG: 200"  # Re-implementing BUG-200
```

**Command:**

```bash
npx notegen generate --release-notes
```

**Output (RELEASE_NOTES.md):**

```markdown
# RELEASE NOTES

Generated: 2024-01-15

## User Stories

- US 100
- US 101

## Bugs

- BUG 200

---

**Total:** 3 item(s)
```

**What happened:**

- Original BUG-200 fix was removed (reverted)
- Revert commit itself was removed
- New BUG-200 fix is kept (after revert)
- All US items kept (not reverted)

### Example 2: Feature Development Cycle

**Git History:**

```bash
git commit -m "feat(auth): implement OAuth US-500"
git commit -m "feat(auth): add token refresh US-500"
git commit -m "fix(auth): handle edge case US-500"
git commit -m "Revert feat: OAuth not ready" -m "US: 500"
git commit -m "feat(api): add REST endpoints US-501"
git commit -m "feat(auth): implement SAML US-500"  # New approach
```

**Command:**

```bash
npx notegen generate --release-notes --base-url https://jira.company.com/browse
```

**Output:**

```markdown
# RELEASE NOTES

Generated: 2024-01-15

## User Stories

- [US 500](https://jira.company.com/browse/500)
- [US 501](https://jira.company.com/browse/501)

---

**Total:** 2 item(s)
```

**What happened:**

- First 3 commits with US-500 removed (OAuth implementation reverted)
- US-501 kept (different ticket)
- Final US-500 commit kept (SAML implementation after revert)

### Example 3: Multiple Tickets per Commit

**Git History:**

```bash
git commit -m "feat: combined feature" -m "US: 600\nUS: 601"
git commit -m "fix: combined fixes" -m "BUG: 700\nBUG: 701"
git commit -m "Revert: feature not ready" -m "US: 600"  # Only revert US-600
```

**Output:**

```markdown
# RELEASE NOTES

Generated: 2024-01-15

## User Stories

- US 601

## Bugs

- BUG 700
- BUG 701

---

**Total:** 3 item(s)
```

**What happened:**

- US-600 removed (reverted)
- US-601 kept (same commit, but different ticket - not reverted)
- All bug fixes kept (not reverted)

### Example 4: Version Range with Reverts

**Command:**

```bash
npx notegen generate --from v1.0.0 --to v2.0.0 --release-notes
```

Only processes commits between v1.0.0 and v2.0.0, applying revert logic within that range. Reverts outside the range don't affect commits inside the range.
