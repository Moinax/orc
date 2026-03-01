import fs from 'fs';
import path from 'path';

const CONFIG_TEMPLATE = `import { defineConfig } from '@moinax/orc/config';

export default defineConfig({
  clients: [
    {
      name: 'MyApi',
      spec: 'https://api.example.com/openapi.json',
      output: 'src/lib/api/my-api-client',
    },
  ],
});
`;

export async function runInit(): Promise<void> {
  const configPath = path.join(process.cwd(), 'orc.config.ts');

  if (fs.existsSync(configPath)) {
    console.error(`Config file already exists: ${configPath}`);
    process.exit(1);
  }

  fs.writeFileSync(configPath, CONFIG_TEMPLATE);
  console.log(`Created config file: ${configPath}`);
  console.log('\nEdit the file to configure your API clients, then run:');
  console.log('  orc generate');
}
