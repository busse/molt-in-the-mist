import { Command } from 'commander';
import * as path from 'node:path';
import { Collector } from './collector.js';
import type { CollectorConfig } from './types.js';

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
    };

    console.log('Molt-in-the-Mist Collector');
    console.log(`  Mode:   ${config.mode}`);
    console.log(`  Output: ${config.outputDir}`);
    if (config.submolts) {
      console.log(`  Submolts: ${config.submolts.join(', ')}`);
    }
    console.log('');

    const collector = new Collector(config);
    await collector.run();
  });

program.parse();
