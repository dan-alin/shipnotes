#!/usr/bin/env node

import { Command } from 'commander';
import { generateReleaseNotes } from './index.js';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

interface SectionMapping {
  section: string;
  pattern: string;
  label: string;
}

interface Config {
  baseUrl?: string;
  releaseNotes?: boolean;
  output?: string;
  sections?: SectionMapping[];
}

const CONFIG_FILE = 'shipnotes.json';

// Get package.json path relative to this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '../package.json');
const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));

async function loadConfig(): Promise<Config> {
  const configPath = join(process.cwd(), CONFIG_FILE);

  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const content = await readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn(
      `⚠️  Failed to load config file: ${error instanceof Error ? error.message : error}`
    );
    return {};
  }
}

const program = new Command();

program
  .name('shipnotes')
  .description('Generate release notes from git history')
  .version(packageJson.version);

program
  .command('generate')
  .alias('g')
  .description('Generate release notes from git commit history')
  .option('-o, --output <file>', 'Output file path')
  .option('-f, --from <commit>', 'Start from commit/tag (exclusive)')
  .option('-t, --to <commit>', 'End at commit/tag (inclusive)', 'HEAD')
  .option('-l, --limit <number>', 'Limit number of commits', parseInt)
  .option(
    '-r, --release-notes',
    'Generate release notes format with grouped tickets (feat/fix)'
  )
  .option(
    '--no-release-notes',
    'Generate standard changelog format (overrides config)'
  )
  .option(
    '-b, --base-url <url>',
    'Base URL for linking tickets (e.g., https://jira.company.com/browse)'
  )
  .option('--last', 'Generate release notes for the last tag')
  .action(async (options) => {
    try {
      // Load config file
      const config = await loadConfig();

      // Merge config with CLI options (CLI options take precedence)
      const mergedOptions = {
        output: options.output || config.output || 'RELEASE_NOTES.md',
        from: options.from,
        to: options.to,
        limit: options.limit,
        releaseNotes:
          options.releaseNotes !== undefined
            ? options.releaseNotes
            : (config.releaseNotes ?? false),
        baseUrl: options.baseUrl || config.baseUrl,
        last: options.last,
        sections: config.sections,
      };

      await generateReleaseNotes(mergedOptions);
      console.log(`✅ Release notes generated: ${mergedOptions.output}`);
    } catch (error) {
      console.error(
        '❌ Error:',
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize configuration file')
  .action(async () => {
    const { initConfig } = await import('./init-config.js');
    await initConfig();
  });

program.parse();
