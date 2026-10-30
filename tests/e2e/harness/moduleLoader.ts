import fs from 'node:fs';
import path from 'node:path';
import type {
  GoodreadsRawRow,
  ParsedGoodreadsBook,
  ExistingVaultBook,
  DuplicateScanResult,
  ImportOptions,
  ImportResult,
} from './types';
import type { KitapPluginSettings } from '../../../src/types';
import type { App } from 'obsidian';
import type KitapPlugin from '../../../src/main';

export function isModuleAvailable(relativePath: string): boolean {
  const fullPath = path.resolve(__dirname, '../../../src', relativePath);
  return fs.existsSync(fullPath);
}

export interface GoodreadsModules {
  csvParser?: {
    parseGoodreadsCsv: (csvContent: string) => GoodreadsRawRow[];
  };
  mapper?: {
    mapGoodreadsRow: (row: GoodreadsRawRow, settings: KitapPluginSettings) => ParsedGoodreadsBook;
    cleanGoodreadsIsbn?: (isbnRaw?: string | null) => string;
    normalizeGoodreadsDate?: (dateStr?: string | null) => string;
    normalizeUserRating?: (value?: string | null) => number | undefined;
    normalizeAverageRating?: (value?: string | null) => number | undefined;
    cleanReviewHtml?: (html?: string | null) => string;
    mapGoodreadsShelf?: (
      shelfRaw: string | undefined,
      options: string[],
      defaultStatus: string
    ) => { status: string; isCustomShelf: boolean; customShelfName?: string };
    cleanBookTitle?: (title?: string | null) => { cleanTitle: string; seriesTitle?: string };
  };
  vaultScanner?: {
    scanVaultBooks: (app: App, targetFolder?: string) => Promise<ExistingVaultBook[]>;
  };
  duplicateDetector?: {
    detectDuplicates: (csvBooks: ParsedGoodreadsBook[], vaultBooks: ExistingVaultBook[]) => DuplicateScanResult;
  };
  frontmatterUpdater?: {
    updateFrontmatterNonDestructive: (
      fileContent: string,
      updatedProperties: Record<string, unknown>
    ) => { updatedContent: string; changed: boolean };
  };
  importer?: {
    GoodreadsImporter: new (
      app: App,
      plugin: KitapPlugin
    ) => {
      importBooks: (scanResult: DuplicateScanResult, options: ImportOptions) => Promise<ImportResult>;
    };
  };
}

export async function loadGoodreadsModules(): Promise<GoodreadsModules> {
  const modules: GoodreadsModules = {};

  if (isModuleAvailable('goodreads/csvParser.ts')) {
    const m = await import('../../../src/goodreads/csvParser');
    modules.csvParser = { parseGoodreadsCsv: m.parseGoodreadsCsv };
  }
  if (isModuleAvailable('goodreads/mapper.ts')) {
    const m = await import('../../../src/goodreads/mapper');
    modules.mapper = {
      mapGoodreadsRow: m.mapGoodreadsRow,
      cleanGoodreadsIsbn: m.cleanGoodreadsIsbn,
      normalizeGoodreadsDate: m.normalizeGoodreadsDate,
      normalizeUserRating: m.normalizeUserRating,
      normalizeAverageRating: m.normalizeAverageRating,
      cleanReviewHtml: m.cleanReviewHtml,
      mapGoodreadsShelf: m.mapGoodreadsShelf,
      cleanBookTitle: m.cleanBookTitle,
    };
  }
  if (isModuleAvailable('goodreads/vaultScanner.ts')) {
    const m = await import('../../../src/goodreads/vaultScanner');
    modules.vaultScanner = { scanVaultBooks: m.scanVaultBooks };
  }
  if (isModuleAvailable('goodreads/duplicateDetector.ts')) {
    const m = await import('../../../src/goodreads/duplicateDetector');
    modules.duplicateDetector = { detectDuplicates: m.detectDuplicates };
  }
  if (isModuleAvailable('goodreads/frontmatterUpdater.ts')) {
    const m = await import('../../../src/goodreads/frontmatterUpdater');
    modules.frontmatterUpdater = {
      updateFrontmatterNonDestructive: m.updateFrontmatterNonDestructive,
    };
  }
  if (isModuleAvailable('goodreads/importer.ts')) {
    const m = await import('../../../src/goodreads/importer');
    modules.importer = { GoodreadsImporter: m.GoodreadsImporter };
  }

  return modules;
}
