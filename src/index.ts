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
  print?: boolean;
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
    print = false,
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

  // Build git log command arguments (reverse order: newest first)
  const args = [
    'log',
    '--reverse',
    '--format=%H%n%s%n%an%n%ae%n%aI%n%b%n---END---',
  ];

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
  let commits = parseGitLog(stdout);

  if (commits.length === 0) {
    throw new Error('No commits found');
  }

  // Filter out reverted commits
  commits = filterRevertedCommits(commits);

  // Generate markdown content
  const markdown = releaseNotes
    ? generateReleaseNotesMarkdown(
        commits,
        fromCommit,
        to,
        baseUrl,
        options.sections,
        last
      )
    : generateMarkdown(commits, fromCommit, to, last);

  // Output to console or write to file
  if (print) {
    console.log(markdown);
  } else {
    const outputPath = join(process.cwd(), output);
    await writeFile(outputPath, markdown, 'utf-8');
  }
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

function filterRevertedCommits(commits: Commit[]): Commit[] {
  // Track which commits should be removed
  const commitsToRemove = new Set<string>();
  const revertCommitHashes = new Set<string>();

  // Map ticket numbers to commit indices for chronological tracking
  const ticketCommits = new Map<string, number[]>();

  // Build index of ticket numbers to commit positions
  commits.forEach((commit, index) => {
    const searchText = `${commit.message}\n${commit.body}`;
    const ticketRegex = /(?:US|BUG)[_:\s#-]+([\w-]*\d[\w-]*)/gi;
    const matches = Array.from(searchText.matchAll(ticketRegex));

    for (const match of matches) {
      const ticketNumber = match[1];
      if (!ticketCommits.has(ticketNumber)) {
        ticketCommits.set(ticketNumber, []);
      }
      ticketCommits.get(ticketNumber)!.push(index);
    }
  });

  // Process commits to identify reverts and what they revert
  commits.forEach((commit, index) => {
    const isRevert = /^revert/i.test(commit.message);

    if (isRevert) {
      revertCommitHashes.add(commit.hash);

      // Extract ticket numbers from the revert commit
      const searchText = `${commit.message}\n${commit.body}`;
      const ticketRegex = /(?:US|BUG)[_:\s#-]+([\w-]*\d[\w-]*)/gi;
      const matches = Array.from(searchText.matchAll(ticketRegex));

      for (const match of matches) {
        const ticketNumber = match[1];
        const commitIndices = ticketCommits.get(ticketNumber) || [];

        // Remove all commits with this ticket that came BEFORE this revert
        for (const commitIndex of commitIndices) {
          if (commitIndex < index) {
            commitsToRemove.add(commits[commitIndex].hash);
          }
        }
      }
    }
  });

  // Filter out revert commits and reverted commits
  return commits.filter((commit) => {
    return (
      !revertCommitHashes.has(commit.hash) && !commitsToRemove.has(commit.hash)
    );
  });
}

function generateMarkdown(
  commits: Commit[],
  from?: string,
  to?: string,
  isLastTag = false
): string {
  const date = new Date().toISOString().split('T')[0];

  // Generate title based on version tags
  let title = 'RELEASE NOTES';
  if (to && to !== 'HEAD') {
    if (from && !isLastTag) {
      title = `RELEASE NOTES ${from} → ${to}`;
    } else {
      title = `RELEASE NOTES ${to}`;
    }
  }

  let markdown = `# ${title}\n\n`;
  markdown += `Generated: ${date}\n\n`;

  // Basic mode always uses conventional commit patterns (ignores custom sections)
  const conventionalSections: SectionMapping[] = [
    { section: 'Features', pattern: '^feat', label: '' },
    { section: 'Bug Fixes', pattern: '^fix', label: '' },
    { section: 'Other Changes', pattern: '.*', label: '' },
  ];

  const activeSections = conventionalSections;

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

      // Group by scope within each section
      const byScope: Map<string, Commit[]> = new Map();
      for (const commit of sectionCommits) {
        const conventionalMatch = commit.message.match(
          /^(\w+)(?:\(([^)]+)\))?:\s*(.*)$/
        );
        const scope = conventionalMatch?.[2] || 'Other';
        if (!byScope.has(scope)) {
          byScope.set(scope, []);
        }
        byScope.get(scope)?.push(commit);
      }

      // Sort scopes: specific scopes alphabetically, 'Other' last
      const sortedScopes = Array.from(byScope.keys()).sort((a, b) => {
        if (a === 'Other') return 1;
        if (b === 'Other') return -1;
        return a.localeCompare(b);
      });

      // Render by scope
      for (const scope of sortedScopes) {
        const scopeCommits = byScope.get(scope) || [];
        markdown += `### ${scope}\n\n`;
        for (const commit of scopeCommits) {
          // Extract clean message by removing type and scope prefix
          const match = commit.message.match(/^\w+(?:\([^)]+\))?:\s*(.*)$/);
          const cleanMessage = match?.[1] || commit.message;
          markdown += `- ${cleanMessage}\n`;
        }
        markdown += `\n`;
      }

      totalCount += sectionCommits.length;
    }
  }

  // Summary
  markdown += `---\n\n`;
  markdown += `**Total:** ${totalCount} item(s)\n`;

  return markdown;
}

function generateReleaseNotesMarkdown(
  commits: Commit[],
  from?: string,
  to?: string,
  baseUrl?: string,
  sections?: SectionMapping[],
  isLastTag = false
): string {
  const date = new Date().toISOString().split('T')[0];

  // Generate title based on version tags
  let title = 'RELEASE NOTES';
  if (to && to !== 'HEAD') {
    if (from && !isLastTag) {
      title = `RELEASE NOTES ${from} → ${to}`;
    } else {
      title = `RELEASE NOTES ${to}`;
    }
  }

  let markdown = `# ${title}\n\n`;
  markdown += `Generated: ${date}\n\n`;

  // Default sections if not provided
  const defaultSections: SectionMapping[] = [
    { section: 'User Stories', pattern: 'US', label: 'US' },
    { section: 'Bugs', pattern: 'BUG', label: 'BUG' },
  ];

  const activeSections = sections || defaultSections;

  // Group commits by section based on footer references
  const groupedCommits: Map<string, Commit[]> = new Map();

  for (const mapping of activeSections) {
    groupedCommits.set(mapping.section, []);
  }

  for (const commit of commits) {
    // Check both message and body for reference type (e.g., US: 234, BUG: 45, US-234, BUG-45)
    const searchText = `${commit.message}\n${commit.body}`;

    for (const mapping of activeSections) {
      // Match patterns like: US_24, US-24, US:24, US 24, BUG#999
      // Requires at least one separator to avoid false matches
      const regex = new RegExp(
        `${mapping.pattern}[_\\-:\\s#]+([\\w\\-]*\\d[\\w\\-]*)`,
        'i'
      );
      if (regex.test(searchText)) {
        groupedCommits.get(mapping.section)?.push(commit);
        // Don't break - allow commit to appear in multiple sections if it has multiple ticket types
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
        markdown += formatCommitWithLink(
          commit,
          mapping.pattern,
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
  markdown += `**Total:** ${totalCount} item(s)\n`;

  return markdown;
}

function escapeMarkdown(text: string): string {
  // Escape Markdown special characters: \ ` * _ { } [ ] ( ) # + - . ! |
  return text.replace(/([\\`*_{}[\]()#+\-.!|])/g, '\\$1');
}

function formatCommitWithLink(
  commit: Commit,
  refType: string,
  label: string,
  baseUrl?: string
): string {
  // Extract all ticket numbers from commit message or body matching the reference type
  const searchText = `${commit.message}\n${commit.body}`;
  // Match patterns like: US_24, US-24, US:24, US 24, BUG#999
  // Requires at least one separator to avoid false matches
  const regex = new RegExp(
    `${refType}[_\\-:\\s#]+([\\w\\-]*\\d[\\w\\-]*)`,
    'gi'
  );
  const matches = Array.from(searchText.matchAll(regex));

  if (matches.length === 0) {
    // Fallback for commits without ticket numbers (skip them in release notes mode)
    return '';
  }

  // Generate a line for each ticket
  let result = '';
  for (const match of matches) {
    const ticketNumber = match[1];
    if (baseUrl) {
      const link = `${baseUrl}/${ticketNumber}`;
      // Escape Markdown special characters in label and ticket number
      const escapedLabel = escapeMarkdown(label);
      const escapedTicketNumber = escapeMarkdown(ticketNumber);
      result += `- [${escapedLabel} ${escapedTicketNumber}](${link})\n`;
    } else {
      result += `- ${label} ${ticketNumber}\n`;
    }
  }

  return result;
}
