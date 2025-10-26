# shipnotes

Generate release notes from git commit history.

## Installation

### Local (recommended for projects)

```bash
# With npm
npm install --save-dev shipnotes

# With pnpm
pnpm add -D shipnotes

# With yarn
yarn add -D shipnotes
```

### Global (use across multiple projects)

```bash
# With npm
npm install -g shipnotes

# With pnpm
pnpm add -g shipnotes

# With yarn
yarn global add shipnotes
```

With global installation, use `shipnotes` directly without `npx`.

## Quick Start

1. Initialize configuration:

```bash
npx shipnotes init
```

This creates a `shipnotes.json` file in your project:

```json
{
  "baseUrl": "https://jira.company.com/browse",
  "releaseNotes": true,
  "output": "CHANGELOG.md"
}
```

2. Generate release notes:

```bash
npx shipnotes generate
```

## Usage

### Basic Usage

```bash
# Generate release notes for all commits
npx shipnotes generate

# Or add to package.json scripts:
{
  "scripts": {
    "release-notes": "shipnotes generate"
  }
}

# Then run:
pnpm release-notes
```

### Advanced Options

```bash
# Specify output file
npx shipnotes generate -o CHANGELOG.md

# Generate for specific commit range
npx shipnotes generate --from v1.0.0 --to v2.0.0

# Generate for a specific tag (auto-detects previous tag)
npx shipnotes generate --to v2.0.0

# Generate for the latest tag (auto-detects last and previous tag)
npx shipnotes generate --last --release-notes

# Limit number of commits
npx shipnotes generate --limit 10

# Generate release notes format (grouped by feat/fix with tickets)
npx shipnotes generate --release-notes

# With ticket links
npx shipnotes generate --release-notes --base-url https://jira.company.com/browse
```

## Options

- `-o, --output <file>` - Output file path (default: `RELEASE_NOTES.md`)
- `-f, --from <commit>` - Start from commit/tag (exclusive)
- `-t, --to <commit>` - End at commit/tag (inclusive, default: `HEAD`)
- `-l, --limit <number>` - Limit number of commits
- `-r, --release-notes` - Generate release notes format with grouped tickets (feat/fix)
- `-b, --base-url <url>` - Base URL for linking tickets
- `--last` - Generate release notes for the last tag (auto-detects previous tag)

CLI options override configuration file settings.

## Modes

### Basic Mode (default)

Groups commits by conventional commit prefixes in the message:

```bash
feat: add user authentication
fix: resolve login bug
chore: update dependencies
```

Generates a simple changelog grouped by:

- **Features** (`feat:` commits)
- **Bug Fixes** (`fix:` commits)
- **Other Changes** (everything else)

Custom sections from config are **not used** in basic mode.

### Release Notes Mode (`--release-notes`)

Groups commits by footer references for ticket tracking:

```bash
feat: add user authentication

US: 123
```

```bash
fix: resolve login bug

BUG: 456
```

In release notes mode, commits are grouped by footer reference type (`US`, `BUG`, etc.) instead of the commit message prefix. Supported footer formats:

- `US: 123` or `US-123` → User Stories section
- `BUG: 456` or `BUG-456` → Bugs section
- Any custom pattern defined in your config

Commits without matching footer references are excluded from release notes mode.

## Custom Sections

You can configure custom sections in `shipnotes.json`:

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

Each section matches commits based on footer references. The `pattern` field looks for `<pattern>: <number>` or `<pattern>-<number>` in commit footers.
