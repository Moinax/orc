import fs from 'fs';
import path from 'path';
import prettier from 'prettier';

export async function formatCode(code: string, filepath: string): Promise<string> {
  try {
    const options = await prettier.resolveConfig(filepath);
    return prettier.format(code, { ...options, parser: 'typescript' });
  } catch (error) {
    console.warn(`Warning: Could not format ${filepath}:`, (error as Error).message);
    return code;
  }
}

export async function writeFile(filepath: string, content: string): Promise<void> {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const formatted = await formatCode(content, filepath);
  fs.writeFileSync(filepath, formatted);
  console.log(`Generated: ${filepath}`);
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export async function writeFiles(files: GeneratedFile[]): Promise<void> {
  for (const file of files) {
    await writeFile(file.path, file.content);
  }
}
