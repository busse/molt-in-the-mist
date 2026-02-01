import { Command } from 'commander';
import dotenv from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Collector } from './collector.js';
import { MoltbookApiClient } from './api-client.js';
import type { CollectorConfig } from './types.js';

dotenv.config();

const program = new Command();

program
  .name('molt-collector')
  .description('Collect data from Moltbook for social network analysis')
  .version('1.0.0');

program
  .command('collect', { isDefault: true })
  .description('Collect posts, comments, and agent data from Moltbook')
  .option('-o, --output <dir>', 'Output directory for collected data', '../../data')
  .option('-k, --api-key <key>', 'Moltbook API key (or set MOLTBOOK_API_KEY env)', process.env.MOLTBOOK_API_KEY)
  .option('-m, --mode <mode>', 'Collection mode: full or influencer-first', 'influencer-first')
  .option('-t, --top <n>', 'Number of top influencers to target', '200')
  .option('-s, --submolts <names>', 'Comma-separated submolt names to collect')
  .option('--since <date>', 'Only collect data since this date (ISO format)')
  .option('--max-pages <n>', 'Max pages to fetch per sort/submolt combination', '10')
  .option('--page-size <n>', 'Number of items per page', '50')
  .option('--dry-run', 'Validate API responses without saving data (for testing)', false)
  .option('--graph-only', 'Save only graph data with redacted content', false)
  .option('-v, --verbose', 'Enable verbose logging', false)
  .action(async (options) => {
    const config: CollectorConfig = {
      outputDir: path.resolve(options.output),
      apiKey: options.apiKey,
      mode: options.mode as 'full' | 'influencer-first',
      influencerThreshold: parseInt(options.top, 10),
      submolts: options.submolts?.split(',').map((s: string) => s.trim()),
      since: options.since,
      verbose: options.verbose,
      sortOrders: ['hot', 'top', 'new', 'rising'],
      maxPages: parseInt(options.maxPages, 10),
      pageSize: parseInt(options.pageSize, 10),
      dryRun: options.dryRun,
      graphOnly: options.graphOnly,
    };

    console.log('Molt-in-the-Mist Collector');
    console.log(`  Mode:   ${config.mode}`);
    console.log(`  Output: ${config.outputDir}`);
    if (config.dryRun) {
      console.log(`  Dry Run: enabled (validate only, no data saved)`);
    }
    if (config.graphOnly) {
      console.log(`  Graph Only: enabled (content redacted)`);
    }
    if (config.submolts) {
      console.log(`  Submolts: ${config.submolts.join(', ')}`);
    }
    console.log('');

    const collector = new Collector(config);
    await collector.run();
  });

program
  .command('register')
  .description('Register a new agent with Moltbook and receive an API key')
  .requiredOption('-n, --name <name>', 'Agent name')
  .requiredOption('-d, --description <desc>', 'Agent description')
  .option('--save', 'Save the API key to .env in the project root', false)
  .action(async (options) => {
    const client = new MoltbookApiClient();

    console.log('Molt-in-the-Mist — Agent Registration');
    console.log(`  Registering agent: ${options.name}`);
    console.log('');

    try {
      const result = await client.registerAgent({
        name: options.name,
        description: options.description,
      });

      const apiKey = result.api_key ?? result.apiKey ?? result.key;
      const agentName = result.agent?.name ?? options.name;
      const claimUrl = result.claim_url;

      console.log('Registration successful!');
      console.log('');
      console.log(`  Agent:   ${agentName}`);
      console.log(`  API Key: ${apiKey ?? '(not returned)'}`);
      if (claimUrl) {
        console.log(`  Claim:   ${claimUrl}`);
        console.log('');
        console.log('  Your human must visit the claim URL to complete verification.');
      }

      if (apiKey) {
        console.log('');
        console.log('  WARNING: Save your API key now. It cannot be retrieved later.');
        console.log('  Only send your API key to https://www.moltbook.com (with www).');
      } else if (!claimUrl) {
        console.log('');
        console.log('  NOTE: Moltbook did not return an API key or claim URL.');
        console.log('  If this seems wrong, retry later or check the Moltbook portal.');
      }

      if (options.save && apiKey) {
        const repoRoot = process.env.INIT_CWD || process.cwd();
        const envPath = path.resolve(repoRoot, '.env');
        const envLine = `MOLTBOOK_API_KEY=${apiKey}\n`;

        if (fs.existsSync(envPath)) {
          const existing = fs.readFileSync(envPath, 'utf-8');
          if (existing.includes('MOLTBOOK_API_KEY=')) {
            const updated = existing.replace(/^MOLTBOOK_API_KEY=.*$/m, `MOLTBOOK_API_KEY=${apiKey}`);
            fs.writeFileSync(envPath, updated, 'utf-8');
          } else {
            fs.appendFileSync(envPath, envLine, 'utf-8');
          }
        } else {
          fs.writeFileSync(envPath, envLine, 'utf-8');
        }
        console.log(`  Saved to ${envPath}`);
      } else if (!options.save && apiKey) {
        console.log('');
        console.log('  To use with the collector, set:');
        console.log(`    export MOLTBOOK_API_KEY=${apiKey}`);
        console.log('  Or add to your .env file.');
      }
    } catch (error) {
      console.error(`Registration failed: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  });

program.parse();
