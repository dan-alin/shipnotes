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

## Conventional Commits

For best results with `--release-notes` mode, use conventional commits:

```bash
feat(123): add user authentication
fix(456): resolve login bug
```

Commits must follow the pattern `feat(<number>):` or `fix(<number>):` to be included in release notes mode.
