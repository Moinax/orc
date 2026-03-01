import path from 'path';
import { generateClient } from '../../generator/client-generator';
import type { OrcConfig } from '../../generator/config';

export async function runGenerate(
  config: OrcConfig,
  options: { client?: string; spec?: string },
): Promise<void> {
  const runtimePackage = config.runtimePackage || '@moinax/orc';

  let clients = config.clients;

  if (options.client) {
    clients = clients.filter((c) => c.name.toLowerCase() === options.client!.toLowerCase());
    if (clients.length === 0) {
      console.error(`Error: Client "${options.client}" not found in configuration.`);
      console.log('Available clients:', config.clients.map((c) => c.name).join(', '));
      process.exit(1);
    }
  }

  if (options.spec && !options.client) {
    console.error('Error: --spec requires --client to be specified');
    process.exit(1);
  }

  console.log('ORC - OpenAPI Rest Client Generator');
  console.log('====================================');
  console.log(`Generating ${clients.length} client(s): ${clients.map((c) => c.name).join(', ')}`);
  if (options.spec) {
    console.log(`Using custom spec: ${options.spec}`);
  }

  const results = [];
  for (const clientConfig of clients) {
    try {
      const result = await generateClient(clientConfig, {
        specOverride: options.spec,
        runtimePackage,
      });
      results.push(result);
    } catch (error) {
      console.error(`\nError generating ${clientConfig.name}Client:`, (error as Error).message);
      process.exit(1);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('All clients generated successfully!');
  console.log('='.repeat(60));

  for (const result of results) {
    console.log(`\n${result.name}Client resources: ${result.resourceNames.join(', ')}`);
  }
}
