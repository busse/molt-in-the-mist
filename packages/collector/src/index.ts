import { Command } from 'commander';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Collector } from './collector.js';
import type { CollectorConfig } from './types.js';

/**
 * Resolve the Moltbook API key from (in priority order):
 *   1. Explicit --api-key flag
 *   2. MOLTBOOK_API_KEY environment variable
 *   3. ClawdHub global config (written by `clawdhub login` / `pnpm login`)
 */
function resolveApiKey(explicit?: string): string | undefined {
  if (explicit) return explicit;

  const envKey = process.env.MOLTBOOK_API_KEY;
  if (envKey) return envKey;

  // Try reading the ClawdHub global config where `molthub login` stores tokens
  try {
    const configPath = getClawdHubConfigPath();
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (raw?.token) {
        return raw.token;
      }
    }
  } catch {
    // Ignore errors reading clawdhub config
  }

  return undefined;
}

function getClawdHubConfigPath(): string {
  const override = process.env.CLAWDHUB_CONFIG_PATH?.trim();
  if (override) return path.resolve(override);

  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'clawdhub', 'config.json');
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) return path.join(xdg, 'clawdhub', 'config.json');
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA;
    if (appData) return path.join(appData, 'clawdhub', 'config.json');
  }
  return path.join(home, '.config', 'clawdhub', 'config.json');
}

const program = new Command();

program
  .name('molt-collector')
  .description('Collect data from Moltbook for social network analysis')
  .version('1.0.0');

program
  .command('collect', { isDefault: true })
  .description('Collect posts, comments, and agent data from Moltbook')
  .option('-o, --output <dir>', 'Output directory for collected data', '../../data')
  .option('-k, --api-key <key>', 'Moltbook API key (or MOLTBOOK_API_KEY env, or clawdhub login token)')
  .option('-m, --mode <mode>', 'Collection mode: full or influencer-first', 'influencer-first')
  .option('-t, --top <n>', 'Number of top influencers to target', '200')
  .option('-s, --submolts <names>', 'Comma-separated submolt names to collect')
  .option('--since <date>', 'Only collect data since this date (ISO format)')
  .option('--max-pages <n>', 'Max pages to fetch per sort/submolt combination', '10')
  .option('--page-size <n>', 'Number of items per page', '50')
  .option('-v, --verbose', 'Enable verbose logging', false)
  .action(async (options) => {
    const apiKey = resolveApiKey(options.apiKey);

    const config: CollectorConfig = {
      outputDir: path.resolve(options.output),
      apiKey,
      mode: options.mode as 'full' | 'influencer-first',
      influencerThreshold: parseInt(options.top, 10),
      submolts: options.submolts?.split(',').map((s: string) => s.trim()),
      since: options.since,
      verbose: options.verbose,
      sortOrders: ['hot', 'top', 'new', 'rising'],
      maxPages: parseInt(options.maxPages, 10),
      pageSize: parseInt(options.pageSize, 10),
    };

    console.log('Molt-in-the-Mist Collector');
    console.log(`  Mode:   ${config.mode}`);
    console.log(`  Output: ${config.outputDir}`);
    console.log(`  Auth:   ${apiKey ? 'API key configured' : 'No API key (will attempt unauthenticated)'}`);
    if (config.submolts) {
      console.log(`  Submolts: ${config.submolts.join(', ')}`);
    }
    console.log('');

    if (!apiKey) {
      console.warn('Warning: No API key found. Run `pnpm login` to authenticate via ClawdHub,');
      console.warn('         or set MOLTBOOK_API_KEY, or pass --api-key.\n');
    }

    const collector = new Collector(config);
    await collector.run();
  });

program.parse();
