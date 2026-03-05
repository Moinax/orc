import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { generateClient } from '../../src/generator/client-generator';

const fixtureDir = path.join(__dirname, '..', 'fixtures');

describe('Integration: generateClient', () => {
  it('generates a client from petstore spec (dry-run)', async () => {
    const specPath = path.join(fixtureDir, 'petstore.json');

    const result = await generateClient(
      {
        name: 'Petstore',
        spec: specPath,
        output: '/tmp/orc-test-output',
      },
      {
        write: false,
        runtimePackage: '@moinax/orc',
      },
    );

    expect(result.name).toBe('Petstore');
    expect(result.resourceNames).toContain('Pets');
    expect(result.resourceNames).toContain('Owners');
    expect(result.files).toBeDefined();
    expect(result.files!.length).toBeGreaterThan(0);

    // Check that we have the expected files
    const filePaths = result.files!.map((f) => path.basename(f.path));
    expect(filePaths).toContain('schemas.ts');
    expect(filePaths).toContain('PetstoreClient.ts');
    expect(filePaths).toContain('Resource.ts');
    expect(filePaths).toContain('index.ts');

    // Check schemas.ts content
    const schemasFile = result.files!.find((f) => f.path.endsWith('schemas.ts'));
    expect(schemasFile).toBeDefined();
    expect(schemasFile!.content).toContain("import { z } from 'zod'");
    expect(schemasFile!.content).toContain('petSchema');
    expect(schemasFile!.content).toContain('export type Pet');
    expect(schemasFile!.content).toContain('ownerSchema');
    expect(schemasFile!.content).toContain('export type Owner');
    expect(schemasFile!.content).toContain('vaccinationSchema');
    expect(schemasFile!.content).toContain('paginationParamsSchema');
    expect(schemasFile!.content).toContain('paginationResponseSchema');

    // Check for enum extraction (species and status enums)
    expect(schemasFile!.content).toContain('as const');
    expect(schemasFile!.content).toContain('z.enum(');

    // Check client file content
    const clientFile = result.files!.find((f) => f.path.endsWith('PetstoreClient.ts'));
    expect(clientFile).toBeDefined();
    expect(clientFile!.content).toContain("import { Client, ClientOptions } from '@moinax/orc'");
    expect(clientFile!.content).toContain('export default class PetstoreClient extends Client');
    expect(clientFile!.content).toContain('PetsResource');

    // Check Resource.ts uses the runtime package
    const resourceFile = result.files!.find((f) => f.path.endsWith('Resource.ts'));
    expect(resourceFile).toBeDefined();
    expect(resourceFile!.content).toContain("import { Resource as BaseResource } from '@moinax/orc'");

    // Check resource files
    const petsResource = result.files!.find((f) => path.basename(f.path) === 'Pets.resource.ts');
    expect(petsResource).toBeDefined();
    expect(petsResource!.content).toContain('PetsResource');
    expect(petsResource!.content).toContain('getList');
    expect(petsResource!.content).toContain('create');
    expect(petsResource!.content).toContain('getDetail');
    expect(petsResource!.content).toContain('update');
    expect(petsResource!.content).toContain('delete');

    // Check the nested vaccinations resource
    const resourceFiles = result.files!.filter((f) => f.path.includes('.resource.ts'));
    const hasVaccinationsResource = resourceFiles.some((f) => f.content.includes('PetsVaccinationsResource'));
    expect(hasVaccinationsResource).toBe(true);
  });

  it('generates with date schema imports', async () => {
    const specPath = path.join(fixtureDir, 'petstore.json');

    const result = await generateClient(
      {
        name: 'Petstore',
        spec: specPath,
        output: '/tmp/orc-test-output',
      },
      {
        write: false,
        runtimePackage: '@moinax/orc',
      },
    );

    const schemasFile = result.files!.find((f) => f.path.endsWith('schemas.ts'));
    expect(schemasFile).toBeDefined();

    // The petstore spec has date fields, so date schemas should be imported
    expect(schemasFile!.content).toContain("from '@moinax/orc'");
  });

  it('uses custom runtime package name', async () => {
    const specPath = path.join(fixtureDir, 'petstore.json');

    const result = await generateClient(
      {
        name: 'Petstore',
        spec: specPath,
        output: '/tmp/orc-test-output',
      },
      {
        write: false,
        runtimePackage: 'my-custom-runtime',
      },
    );

    const clientFile = result.files!.find((f) => f.path.endsWith('PetstoreClient.ts'));
    expect(clientFile!.content).toContain("from 'my-custom-runtime'");

    const resourceFile = result.files!.find((f) => f.path.endsWith('Resource.ts'));
    expect(resourceFile!.content).toContain("from 'my-custom-runtime'");
  });

  it('generates resources index with exports', async () => {
    const specPath = path.join(fixtureDir, 'petstore.json');

    const result = await generateClient(
      {
        name: 'Petstore',
        spec: specPath,
        output: '/tmp/orc-test-output',
      },
      { write: false },
    );

    const indexFile = result.files!.find(
      (f) => f.path.endsWith('resources/index.ts') || f.path.endsWith('resources\\index.ts'),
    );
    expect(indexFile).toBeDefined();
    expect(indexFile!.content).toContain('export {');
  });

  it('generates prefixed schemas with schemaPrefix', async () => {
    const specPath = path.join(fixtureDir, 'petstore.json');

    const result = await generateClient(
      {
        name: 'Petstore',
        spec: specPath,
        output: '/tmp/orc-test-output',
        schemaPrefix: 'Charge',
      },
      {
        write: false,
        runtimePackage: '@moinax/orc',
      },
    );

    const schemasFile = result.files!.find((f) => f.path.endsWith('schemas.ts'));
    expect(schemasFile).toBeDefined();

    // Schema consts and types should be prefixed
    expect(schemasFile!.content).toContain('export const chargePetSchema = ');
    expect(schemasFile!.content).toContain('export type ChargePet = ');
    expect(schemasFile!.content).toContain('chargeOwnerSchema');
    expect(schemasFile!.content).toContain('export type ChargeOwner');

    // Pagination schemas should NOT be prefixed
    expect(schemasFile!.content).toContain('export const paginationParamsSchema = ');
    expect(schemasFile!.content).toContain('export type PaginationParams = ');
    expect(schemasFile!.content).toContain('export const paginationResponseSchema = ');
    expect(schemasFile!.content).toContain('export type PaginationResponse = ');

    // Enums should be prefixed
    expect(schemasFile!.content).not.toMatch(/export const petSpecies =/);

    // Resource files should reference prefixed schema names
    const petsResource = result.files!.find((f) => path.basename(f.path) === 'Pets.resource.ts');
    expect(petsResource).toBeDefined();
    expect(petsResource!.content).toContain('chargePetSchema');
    expect(petsResource!.content).toContain('ChargePet');
  });

  it('generates main index with re-exports', async () => {
    const specPath = path.join(fixtureDir, 'petstore.json');

    const result = await generateClient(
      {
        name: 'Petstore',
        spec: specPath,
        output: '/tmp/orc-test-output',
      },
      { write: false },
    );

    const mainIndex = result.files!.find(
      (f) => f.path.endsWith('generated/index.ts') || f.path.endsWith('generated\\index.ts'),
    );
    expect(mainIndex).toBeDefined();
    expect(mainIndex!.content).toContain('PetstoreClient');
    expect(mainIndex!.content).toContain("from './schemas'");
    expect(mainIndex!.content).toContain("from './resources'");
  });
});
