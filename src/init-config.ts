#!/usr/bin/env node

import { writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import * as readline from 'readline';

interface Config {
  baseUrl?: string;
  releaseNotes?: boolean;
  output?: string;
}

const CONFIG_FILE = 'shipnotes.json';

function question(prompt: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function initConfig() {
  const configPath = join(process.cwd(), CONFIG_FILE);

  console.log('🔧 Initialize shipnotes configuration\n');

  // Check if config already exists
  if (existsSync(configPath)) {
    const overwrite = await question(
      `Configuration file already exists at ${configPath}. Overwrite? (y/N): `
    );
    if (overwrite.toLowerCase() !== 'y') {
      console.log('Configuration initialization cancelled.');
      return;
    }
  }

  // Prompt for configuration
  const baseUrl = await question(
    'Base URL for ticket links (e.g., https://jira.company.com/browse): '
  );
  const releaseNotesMode = await question(
    'Use release notes format by default? (y/N): '
  );
  const output = await question(
    'Default output file (press Enter for RELEASE_NOTES.md): '
  );

  const config: Config = {};

  if (baseUrl) {
    config.baseUrl = baseUrl;
  }

  if (releaseNotesMode.toLowerCase() === 'y') {
    config.releaseNotes = true;
  }

  if (output) {
    config.output = output;
  }

  // Write config file
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

  console.log(`\n✅ Configuration saved to ${configPath}`);
  console.log('\nYou can now run: shipnotes generate');
  console.log('\nNote: CLI options will override configuration file settings.');
}

// Only run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initConfig().catch((error) => {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
