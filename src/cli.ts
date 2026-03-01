import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import { createJiti } from 'jiti';
import type { OrcConfig } from './generator/config';
import { runGenerate } from './cli/commands/generate';
import { runInit } from './cli/commands/init';

const CONFIG_NAMES = ['orc.config.ts', 'orc.config.js', 'orc.config.mjs'];

async function loadConfig(): Promise<OrcConfig> {
  const cwd = process.cwd();

  for (const configName of CONFIG_NAMES) {
    const configPath = path.join(cwd, configName);
    if (fs.existsSync(configPath)) {
      console.log(`Using config: ${configPath}`);
      const jiti = createJiti(cwd, { interopDefault: true });
      const config = await jiti.import(configPath) as OrcConfig;
      return config;
    }
  }

  throw new Error(
    `No config file found. Create one with 'orc init' or add one of: ${CONFIG_NAMES.join(', ')}`,
  );
}

const program = new Command();

program
  .name('orc')
  .description('ORC - OpenAPI Rest Client Generator')
  .version('0.1.0');

program
  .command('generate')
  .description('Generate TypeScript API clients from OpenAPI specs')
  .option('-c, --client <name>', 'Generate a specific client only')
  .option('-s, --spec <url>', 'Override spec URL (requires --client)')
  .action(async (options) => {
    const config = await loadConfig();
    await runGenerate(config, options);
  });

program
  .command('init')
  .description('Scaffold a new orc.config.ts file')
  .action(async () => {
    await runInit();
  });

program.parse();
