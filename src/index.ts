import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile } from 'fs/promises';
import { join } from 'path';

const execFileAsync = promisify(execFile);

export interface ReleaseNotesOptions {
  output?: string;
  from?: string;
  to?: string;
  limit?: number;
  releaseNotes?: boolean;
  baseUrl?: string;
  last?: boolean;
}

interface Commit {
  hash: string;
  message: string;
  author_name: string;
  author_email: string;
  date: string;
  body: string;
}

export async function generateReleaseNotes(
  options: ReleaseNotesOptions = {}
): Promise<void> {
  const {
    output = 'RELEASE_NOTES.md',
    from,
    limit,
    releaseNotes = false,
    baseUrl,
    last = false,
  } = options;

  let to = options.to || 'HEAD';

  // Check if we're in a git repository
  try {
    await execFileAsync('git', ['rev-parse', '--git-dir']);
  } catch {
    throw new Error('Not a git repository');
  }

  // Handle --last flag: get the latest tag
  if (last) {
    try {
      const { stdout } = await execFileAsync('git', [
        'describe',
        '--tags',
        '--abbrev=0',
      ]);
      to = stdout.trim();
      console.log(`📍 Latest tag found: ${to}`);
    } catch {
      throw new Error('No tags found in repository');
    }
  }

  // Auto-detect previous tag if 'to' is specified but 'from' is not
  let fromCommit = from;
  if (!fromCommit && to && to !== 'HEAD') {
    try {
      // Get the tag before the specified 'to' tag
      const { stdout } = await execFileAsync('git', [
        'describe',
        '--tags',
        '--abbrev=0',
        `${to}^`,
      ]);
      fromCommit = stdout.trim();
      console.log(`📍 Auto-detected previous tag: ${fromCommit}`);
    } catch {
      // If no previous tag found, continue without 'from'
    }
  }

  // Build git log command arguments
  const args = ['log', '--format=%H%n%s%n%an%n%ae%n%aI%n%b%n---END---'];

  if (limit) {
    args.push(`-${limit}`);
  }

  // Add revision range
  if (fromCommit) {
    args.push(`${fromCommit}..${to}`);
  } else {
    args.push(to);
  }

  // Execute git log
  const { stdout } = await execFileAsync('git', args);

  if (!stdout.trim()) {
    throw new Error('No commits found');
  }

  // Parse commits
  const commits = parseGitLog(stdout);

  if (commits.length === 0) {
    throw new Error('No commits found');
  }

  // Generate markdown content
  const markdown = releaseNotes
    ? generateReleaseNotesMarkdown(commits, fromCommit, to, baseUrl)
    : generateMarkdown(commits, fromCommit, to);

  // Write to file
  const outputPath = join(process.cwd(), output);
  await writeFile(outputPath, markdown, 'utf-8');
}

function parseGitLog(output: string): Commit[] {
  const commits: Commit[] = [];
  const commitBlocks = output
    .split('---END---\n')
    .filter((block) => block.trim());

  for (const block of commitBlocks) {
    const lines = block.split('\n');
    if (lines.length < 5) continue;

    const hash = lines[0];
    const message = lines[1];
    const author_name = lines[2];
    const author_email = lines[3];
    const date = lines[4];
    const body = lines.slice(5).join('\n').trim();

    commits.push({
      hash,
      message,
      author_name,
      author_email,
      date,
      body,
    });
  }

  return commits;
}

function generateMarkdown(
  commits: Commit[],
  from?: string,
  to?: string
): string {
  const date = new Date().toISOString().split('T')[0];
  let markdown = `# Release Notes\n\n`;
  markdown += `Generated: ${date}\n\n`;

  if (from) {
    markdown += `Range: ${from}..${to}\n\n`;
  } else {
    markdown += `Up to: ${to}\n\n`;
  }

  markdown += `Total commits: ${commits.length}\n\n`;
  markdown += `---\n\n`;

  for (const commit of commits) {
    markdown += `## ${commit.message}\n\n`;
    markdown += `- **Hash:** ${commit.hash}\n`;
    markdown += `- **Author:** ${commit.author_name} <${commit.author_email}>\n`;
    markdown += `- **Date:** ${commit.date}\n`;

    if (commit.body) {
      markdown += `\n${commit.body}\n`;
    }

    markdown += `\n---\n\n`;
  }

  return markdown;
}

function generateReleaseNotesMarkdown(
  commits: Commit[],
  from?: string,
  to?: string,
  baseUrl?: string
): string {
  const date = new Date().toISOString().split('T')[0];
  let markdown = `# Release Notes\n\n`;
  markdown += `Generated: ${date}\n\n`;

  if (from) {
    markdown += `Range: ${from}..${to}\n\n`;
  } else {
    markdown += `Up to: ${to}\n\n`;
  }

  // Group commits by type (only include those with ticket numbers)
  const features: Commit[] = [];
  const fixes: Commit[] = [];

  for (const commit of commits) {
    const message = commit.message;
    // Only include commits with ticket numbers in parentheses
    if (/^feat\(\d+\):/i.test(message)) {
      features.push(commit);
    } else if (/^fix\(\d+\):/i.test(message)) {
      fixes.push(commit);
    }
  }

  // User Stories section
  if (features.length > 0) {
    markdown += `## User Stories\n\n`;
    for (const commit of features) {
      markdown += formatCommitWithLink(commit, 'feat', 'US', baseUrl);
    }
    markdown += `\n`;
  }

  // Bugs section
  if (fixes.length > 0) {
    markdown += `## Bugs\n\n`;
    for (const commit of fixes) {
      markdown += formatCommitWithLink(commit, 'fix', 'BUG', baseUrl);
    }
    markdown += `\n`;
  }

  // Summary
  markdown += `---\n\n`;
  markdown += `**Total:** ${features.length} feature(s), ${fixes.length} fix(es)\n`;

  return markdown;
}

function formatCommitWithLink(
  commit: Commit,
  type: string,
  label: string,
  baseUrl?: string
): string {
  // Extract ticket number from commit message (e.g., feat(2024): message)
  const match = commit.message.match(
    new RegExp(`^${type}\\((\\d+)\\):\\s*(.*)`, 'i')
  );

  if (match) {
    const ticketNumber = match[1];
    const message = match[2];

    if (baseUrl) {
      const link = `${baseUrl}/${ticketNumber}`;
      return `- [${label} ${ticketNumber}](${link}): ${message}\n`;
    } else {
      return `- ${label} ${ticketNumber}: ${message}\n`;
    }
  }

  // Fallback for commits without ticket numbers
  const message = commit.message.replace(
    new RegExp(`^${type}(\\([^)]+\\))?:\\s*`, 'i'),
    ''
  );
  let result = `- ${message}\n`;
  if (commit.body) {
    result += `  ${commit.body.replace(/\n/g, '\n  ')}\n`;
  }
  return result;
}
