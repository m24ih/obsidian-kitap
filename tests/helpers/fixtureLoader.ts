import fs from 'node:fs';
import path from 'node:path';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

export function loadKitapyurduFixture(filename: string): string {
  const filePath = path.join(FIXTURES_DIR, 'kitapyurdu', filename);
  return fs.readFileSync(filePath, 'utf-8');
}
