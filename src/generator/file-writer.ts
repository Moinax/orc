import fs from 'fs';
import path from 'path';

export async function writeFile(filepath: string, content: string): Promise<void> {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filepath, content);
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
