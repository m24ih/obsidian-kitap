// Ambient declarations for Goodreads import modules to enable progressive testability

declare module '*/src/goodreads/types' {
  export type GoodreadsRawRow = import('./harness/types').GoodreadsRawRow;
  export type ParsedGoodreadsBook = import('./harness/types').ParsedGoodreadsBook;
  export type ExistingVaultBook = import('./harness/types').ExistingVaultBook;
  export type DuplicateScanResult = import('./harness/types').DuplicateScanResult;
  export type ImportOptions = import('./harness/types').ImportOptions;
  export type ImportResult = import('./harness/types').ImportResult;
}

declare module '*/src/goodreads/csvParser' {
  export function parseGoodreadsCsv(csvContent: string): import('./harness/types').GoodreadsRawRow[];
}

declare module '*/src/goodreads/mapper' {
  export function mapGoodreadsRow(
    row: import('./harness/types').GoodreadsRawRow,
    settings: import('../../src/types').KitapPluginSettings
  ): import('./harness/types').ParsedGoodreadsBook;
  export function cleanGoodreadsIsbn(isbnRaw: string): string;
  export function normalizeGoodreadsDate(dateStr: string): string;
  export function normalizeGoodreadsRating(ratingStr: string): number | '';
  export function mapShelfToReadingStatus(
    shelf: string,
    options: string[],
    defaultStatus: string
  ): string;
  export function sanitizeGoodreadsReview(htmlReview: string): string;
}

declare module '*/src/goodreads/vaultScanner' {
  export function scanVaultBooks(
    app: import('obsidian').App,
    targetFolder?: string
  ): Promise<import('./harness/types').ExistingVaultBook[]>;
}

declare module '*/src/goodreads/duplicateDetector' {
  export function detectDuplicates(
    csvBooks: import('./harness/types').ParsedGoodreadsBook[],
    vaultBooks: import('./harness/types').ExistingVaultBook[]
  ): import('./harness/types').DuplicateScanResult;
}

declare module '*/src/goodreads/frontmatterUpdater' {
  export function updateFrontmatterNonDestructive(
    fileContent: string,
    updatedProperties: Record<string, unknown>
  ): { updatedContent: string; changed: boolean };
}

declare module '*/src/goodreads/importer' {
  export class GoodreadsImporter {
    constructor(
      app: import('obsidian').App,
      plugin: import('../../src/main').default
    );
    importBooks(
      scanResult: import('./harness/types').DuplicateScanResult,
      options: import('./harness/types').ImportOptions
    ): Promise<import('./harness/types').ImportResult>;
  }
}

declare module '*/src/goodreads/enrichmentService' {
  export class GoodreadsEnrichmentService {
    constructor(
      aggregator: import('../../src/providers/aggregator').BookAggregator,
      settings: import('../../src/types').KitapPluginSettings
    );
    enrichBook(
      book: import('./harness/types').ParsedGoodreadsBook,
      signal?: AbortSignal
    ): Promise<import('./harness/types').ParsedGoodreadsBook>;
  }
}

declare module '*/src/modal/goodreadsImportModal' {
  export class GoodreadsImportModal extends import('obsidian').Modal {
    constructor(
      app: import('obsidian').App,
      plugin: import('../../src/main').default
    );
  }
}
