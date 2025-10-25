import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile } from 'fs/promises';
import { join } from 'path';

const execFileAsync = promisify(execFile);

export interface SectionMapping {
  section: string;
  pattern: string;
  label: string;
}

export interface ReleaseNotesOptions {
  output?: string;
  from?: string;
  to?: string;
  limit?: number;
  releaseNotes?: boolean;
  baseUrl?: string;
  last?: boolean;
  sections?: SectionMapping[];
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
    ? generateReleaseNotesMarkdown(
        commits,
        fromCommit,
        to,
        baseUrl,
        options.sections
      )
    : generateMarkdown(commits, fromCommit, to, options.sections);

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
  to?: string,
  sections?: SectionMapping[]
): string {
  const date = new Date().toISOString().split('T')[0];

  // Generate title based on version tags
  let title = 'RELEASE NOTES';
  if (to && to !== 'HEAD') {
    if (from) {
      title = `RELEASE NOTES ${to} - ${from}`;
    } else {
      title = `RELEASE NOTES ${to}`;
    }
  }

  let markdown = `# ${title}\n\n`;
  markdown += `Generated: ${date}\n\n`;

  if (from) {
    markdown += `Range: ${from}..${to}\n\n`;
  } else {
    markdown += `Up to: ${to}\n\n`;
  }

  // Default sections if not provided
  const defaultSections: SectionMapping[] = [
    { section: 'Features', pattern: '^feat', label: '' },
    { section: 'Bug Fixes', pattern: '^fix', label: '' },
    { section: 'Other Changes', pattern: '.*', label: '' },
  ];

  const activeSections = sections || defaultSections;

  // Group commits by section
  const groupedCommits: Map<string, Commit[]> = new Map();
  const matchedCommits = new Set<string>();

  for (const mapping of activeSections) {
    groupedCommits.set(mapping.section, []);
  }

  // Match commits to sections
  for (const commit of commits) {
    const message = commit.message;

    for (const mapping of activeSections) {
      // Skip "catch-all" patterns for now
      if (mapping.pattern === '.*') continue;

      const regex = new RegExp(mapping.pattern, 'i');
      if (regex.test(message)) {
        groupedCommits.get(mapping.section)?.push(commit);
        matchedCommits.add(commit.hash);
        break; // Only add to first matching section
      }
    }
  }

  // Add unmatched commits to catch-all section (if exists)
  const catchAllSection = activeSections.find((s) => s.pattern === '.*');
  if (catchAllSection) {
    for (const commit of commits) {
      if (!matchedCommits.has(commit.hash)) {
        groupedCommits.get(catchAllSection.section)?.push(commit);
      }
    }
  }

  // Render sections
  let totalCount = 0;
  for (const mapping of activeSections) {
    const sectionCommits = groupedCommits.get(mapping.section) || [];
    if (sectionCommits.length > 0) {
      markdown += `## ${mapping.section}\n\n`;
      for (const commit of sectionCommits) {
        // Extract clean message (remove conventional commit prefix if present)
        let cleanMessage = commit.message;
        const conventionalMatch = commit.message.match(
          /^(\w+)(\([^)]+\))?:\s*(.*)$/
        );
        if (conventionalMatch) {
          cleanMessage = conventionalMatch[3];
        }
        markdown += `- ${cleanMessage}\n`;
      }
      markdown += `\n`;
      totalCount += sectionCommits.length;
    }
  }

  // Summary
  markdown += `---\n\n`;
  markdown += `**Total:** ${totalCount} commit(s)\n`;

  return markdown;
}

function generateReleaseNotesMarkdown(
  commits: Commit[],
  from?: string,
  to?: string,
  baseUrl?: string,
  sections?: SectionMapping[]
): string {
  const date = new Date().toISOString().split('T')[0];

  // Generate title based on version tags
  let title = 'RELEASE NOTES';
  if (to && to !== 'HEAD') {
    if (from) {
      title = `RELEASE NOTES ${to} - ${from}`;
    } else {
      title = `RELEASE NOTES ${to}`;
    }
  }

  let markdown = `# ${title}\n\n`;
  markdown += `Generated: ${date}\n\n`;

  if (from) {
    markdown += `Range: ${from}..${to}\n\n`;
  } else {
    markdown += `Up to: ${to}\n\n`;
  }

  // Default sections if not provided
  const defaultSections: SectionMapping[] = [
    { section: 'User Stories', pattern: '^feat\\(\\d+\\):', label: 'US' },
    { section: 'Bugs', pattern: '^fix\\(\\d+\\):', label: 'BUG' },
  ];

  const activeSections = sections || defaultSections;

  // Group commits by section
  const groupedCommits: Map<string, Commit[]> = new Map();

  for (const mapping of activeSections) {
    groupedCommits.set(mapping.section, []);
  }

  for (const commit of commits) {
    const message = commit.message;

    for (const mapping of activeSections) {
      const regex = new RegExp(mapping.pattern, 'i');
      if (regex.test(message)) {
        groupedCommits.get(mapping.section)?.push(commit);
        break; // Only add to first matching section
      }
    }
  }

  // Render sections
  let totalCount = 0;
  for (const mapping of activeSections) {
    const sectionCommits = groupedCommits.get(mapping.section) || [];
    if (sectionCommits.length > 0) {
      markdown += `## ${mapping.section}\n\n`;
      for (const commit of sectionCommits) {
        const patternType = mapping.pattern.match(/\^([^\\(]+)/)?.[1] || 'feat';
        markdown += formatCommitWithLink(
          commit,
          patternType,
          mapping.label,
          baseUrl
        );
      }
      markdown += `\n`;
      totalCount += sectionCommits.length;
    }
  }

  // Summary
  markdown += `---\n\n`;
  markdown += `**Total:** ${totalCount} commit(s)\n`;

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
