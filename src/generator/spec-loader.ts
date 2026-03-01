import fs from 'fs';
import path from 'path';
import type { OpenAPISpec } from './utils';

export async function loadSpec(specPath: string): Promise<OpenAPISpec> {
  // If it's a URL, fetch it
  if (specPath.startsWith('http://') || specPath.startsWith('https://')) {
    console.log(`Fetching OpenAPI spec from ${specPath}...`);
    const response = await fetch(specPath);
    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAPI spec: ${response.statusText}`);
    }
    const spec = (await response.json()) as OpenAPISpec;
    console.log(`OpenAPI spec version: ${spec.openapi}`);
    console.log(`API title: ${spec.info.title}`);
    return spec;
  }

  // Otherwise, read from file
  const resolvedPath = path.resolve(specPath);
  console.log(`Reading OpenAPI spec from ${resolvedPath}...`);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`OpenAPI spec file not found: ${resolvedPath}`);
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');

  let spec: OpenAPISpec;
  if (resolvedPath.endsWith('.yaml') || resolvedPath.endsWith('.yml')) {
    throw new Error('YAML specs are not supported yet. Please use JSON format.');
  } else {
    spec = JSON.parse(content) as OpenAPISpec;
  }

  console.log(`OpenAPI spec version: ${spec.openapi}`);
  console.log(`API title: ${spec.info.title}`);
  return spec;
}
