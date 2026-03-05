import fs from 'fs';
import path from 'path';
import { EnumRegistry } from './enum-registry';
import { ResourceGenerator } from './resource-generator';
import { ZodGenerator } from './zod-generator';
import { writeFile, type GeneratedFile } from './file-writer';
import { loadSpec } from './spec-loader';
import {
  validateFileName,
  validateOutputPath,
  pascalCase,
  singularize,
  camelCase,
} from './utils';
import type { ClientConfig } from './config';

export interface GenerateResult {
  name: string;
  resourceNames: string[];
  files?: GeneratedFile[];
}

export async function generateClient(
  config: ClientConfig,
  options: {
    specOverride?: string;
    write?: boolean;
    runtimePackage?: string;
  } = {},
): Promise<GenerateResult> {
  const { name, output } = config;
  const specUrl = options.specOverride || config.spec;
  const shouldWrite = options.write !== false;
  const runtimePackage = options.runtimePackage || '@moinax/orc';

  validateOutputPath(output);

  const outputDir = path.join(output, 'generated');
  const clientClassName = `${name}Client`;

  validateFileName(clientClassName, 'client class name');

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Generating ${clientClassName}...`);
  console.log(`${'='.repeat(60)}`);

  // Clean up previously generated files
  if (shouldWrite && fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true });
    console.log(`\nCleaned up ${outputDir}`);
  }

  // Fetch/load OpenAPI spec
  const spec = await loadSpec(specUrl);

  // Create shared enum registry
  const enumRegistry = new EnumRegistry(config.schemaPrefix);

  // Create resource generator
  const resourceGenerator = new ResourceGenerator(spec.paths, spec.components?.schemas, clientClassName, {
    stripPathPrefix: config.stripPathPrefix,
    enumRegistry,
    runtimePackage,
    schemaPrefix: config.schemaPrefix,
  });

  // Generate resources FIRST (registers query param enums)
  console.log('\nGenerating resource classes...');
  const { resources, tree, inlineSchemas } = resourceGenerator.generateAll();

  // Generate schemas (including inline schemas from resources)
  console.log('\nGenerating Zod schemas...');
  const zodGenerator = new ZodGenerator(spec.components?.schemas, enumRegistry, config.schemaPrefix);
  zodGenerator.addInlineSchemas(inlineSchemas);
  const schemasCode = zodGenerator.generateSchemas(runtimePackage);

  const generatedFiles: GeneratedFile[] = [];

  // schemas.ts
  generatedFiles.push({
    path: path.join(outputDir, 'schemas.ts'),
    content: schemasCode,
  });

  // Resource files
  const resourceNames: string[] = [];
  for (const [resourceName, code] of Object.entries(resources)) {
    validateFileName(resourceName, 'resource name');
    generatedFiles.push({
      path: path.join(outputDir, 'resources', `${resourceName}.resource.ts`),
      content: code,
    });
    resourceNames.push(resourceName);
  }

  // Resources index
  const resourceIndexCode = resourceNames
    .map((resourceName) => `export { ${resourceName}Resource } from './${resourceName}.resource';`)
    .join('\n');
  generatedFiles.push({
    path: path.join(outputDir, 'resources', 'index.ts'),
    content: resourceIndexCode,
  });

  // Resource base class
  const resourceBaseCode = `import type ${clientClassName} from './${clientClassName}';
import { Resource as BaseResource } from '${runtimePackage}';

export class Resource extends BaseResource {
  protected declare client: ${clientClassName};

  constructor(client: ${clientClassName}) {
    super(client);
  }
}
`;
  generatedFiles.push({
    path: path.join(outputDir, 'Resource.ts'),
    content: resourceBaseCode,
  });

  // Get top-level resources
  const topLevelResources: Array<{ propertyName: string; className: string }> = [];
  for (const [childName] of tree.children) {
    const className = pascalCase(childName);
    topLevelResources.push({
      propertyName: singularize(camelCase(childName)),
      className,
    });
  }

  // Client class
  console.log(`\nGenerating ${clientClassName}...`);
  const resourceImports = topLevelResources.map((r) => `${r.className}Resource`).join(',\n  ');
  const resourceProperties = topLevelResources
    .map((r) => `public ${r.propertyName}: ${r.className}Resource;`)
    .join('\n  ');
  const resourceInstantiations = topLevelResources
    .map((r) => `this.${r.propertyName} = new ${r.className}Resource(this);`)
    .join('\n    ');

  const clientCode = `import { Client, ClientOptions } from '${runtimePackage}';

import {
  ${resourceImports},
} from './resources';

export default class ${clientClassName} extends Client {
  ${resourceProperties}

  constructor(baseUrl: string, options: ClientOptions = {}) {
    super(baseUrl, options);
    ${resourceInstantiations}
  }
}
`;
  generatedFiles.push({
    path: path.join(outputDir, `${clientClassName}.ts`),
    content: clientCode,
  });

  // Main index
  const mainIndexCode = `export { default as ${clientClassName} } from './${clientClassName}';
export * from './schemas';
export * from './resources';
`;
  generatedFiles.push({
    path: path.join(outputDir, 'index.ts'),
    content: mainIndexCode,
  });

  // Write files if not in dry-run mode
  if (shouldWrite) {
    for (const file of generatedFiles) {
      await writeFile(file.path, file.content);
    }
  }

  console.log(`\n${clientClassName} generation complete!`);

  return {
    name,
    resourceNames: topLevelResources.map((r) => r.className),
    files: shouldWrite ? undefined : generatedFiles,
  };
}
