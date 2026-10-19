import fs from 'node:fs';
import path from 'node:path';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

export function loadKitapyurduFixture(filename: string): string {
  const filePath = path.join(FIXTURES_DIR, 'kitapyurdu', filename);
  return fs.readFileSync(filePath, 'utf-8');
}

export function load1000KitapFixture(filename: string): string {
  const filePath = path.join(FIXTURES_DIR, '1000kitap', filename);
  return fs.readFileSync(filePath, 'utf-8');
}

export function load1000KitapJsonFixture<T = unknown>(filename: string): T {
  const content = load1000KitapFixture(filename);
  return JSON.parse(content) as T;
}
