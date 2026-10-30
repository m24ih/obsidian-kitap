/**
 * obsidian-kitap - Goodreads Import Coordinator (Milestone 4 — R1, R2, R3, R4)
 * Orchestrates offline-first note generation, optional provider enrichment,
 * local cover downloading, and non-destructive YAML frontmatter updates.
 * Zero external runtime dependencies. Zero `: any` or `as any` casts.
 */

import { App, normalizePath } from 'obsidian';
import type KitapPlugin from '../main';
import { DEFAULT_SETTINGS, type KitapPluginSettings } from '../types';
import { PropertyMapper } from '../settings/propertyMapping';
import { buildBookNoteContent } from '../templates/noteBuilder';
import { renderBookTemplate, sanitizeFileName } from '../templates/engine';
import { downloadBookCover } from '../utils/coverDownloader';
import { ensureFolderExists } from '../utils/fileUtils';
import { formatReviewSection } from './mapper';
import { updateFrontmatterNonDestructive } from './frontmatterUpdater';
import { GoodreadsEnrichmentService } from './enrichmentService';
import type {
  DuplicateScanResult,
  ImportErrorItem,
  ImportOptions,
  ImportResult,
  ParsedGoodreadsBook,
} from './types';

/**
 * Builds frontmatter properties for a newly created book note from Goodreads CSV data,
 * mapped through the user's configured property mappings.
 */
export function buildNewNoteFrontmatterPatch(
  book: ParsedGoodreadsBook,
  settings: KitapPluginSettings
): Record<string, unknown> {
  const meta = book.metadata;
  const rawProps: Record<string, unknown> = {
    tip: 'kitap',
    baslik: meta.title,
    yazar: meta.author,
    yayinevi: meta.publisher || '',
    cevirmen: meta.translator || '',
    isbn: meta.isbn || '',
    sayfa: meta.pages !== undefined && meta.pages > 0 ? meta.pages : '',
    okunan_sayfa:
      book.readingStatus.toLowerCase() === 'okundu' && meta.pages && meta.pages > 0
        ? meta.pages
        : 0,
    yayin_tarihi: meta.publishDate || '',
    fiyat: meta.price || '',
    format: meta.format || '',
    tur: meta.genres && meta.genres.length > 0 ? meta.genres : '',
    orijinal_baslik: meta.originalTitle || '',
    dil: meta.language || '',
    puan: meta.rating !== undefined && meta.rating > 0 ? meta.rating : '',
    kapak: meta.coverUrl || '',
    url: meta.url || '',
    okuma_durumu: book.readingStatus || settings.defaultReadingStatus || 'Okunacak',
    okunma_tarihi: book.dateReadIso || '',
    kisisel_puan: book.userRating !== undefined ? book.userRating : '',
  };

  const mapper = new PropertyMapper(settings.propertyMappings);
  return mapper.convertObject(rawProps);
}

/**
 * Builds non-destructive frontmatter update properties for an existing book note.
 * Only includes populated fields from the CSV/enriched record so existing vault
 * values are never overwritten with empty strings.
 */
export function buildExistingNoteUpdatePatch(
  book: ParsedGoodreadsBook,
  settings: KitapPluginSettings
): Record<string, unknown> {
  const meta = book.metadata;
  const rawPatch: Record<string, unknown> = {};

  if (book.readingStatus && book.readingStatus.trim()) {
    rawPatch.okuma_durumu = book.readingStatus.trim();
  }
  if (book.userRating !== undefined && book.userRating >= 1 && book.userRating <= 5) {
    rawPatch.kisisel_puan = book.userRating;
  }
  if (book.dateReadIso && book.dateReadIso.trim()) {
    rawPatch.okunma_tarihi = book.dateReadIso.trim();
  }
  if (meta.rating !== undefined && meta.rating > 0) {
    rawPatch.puan = meta.rating;
  }
  if (meta.isbn && meta.isbn.trim()) {
    rawPatch.isbn = meta.isbn.trim();
  }
  if (meta.pages !== undefined && meta.pages > 0) {
    rawPatch.sayfa = meta.pages;
  }
  if (meta.publisher && meta.publisher.trim()) {
    rawPatch.yayinevi = meta.publisher.trim();
  }
  if (meta.translator && meta.translator.trim()) {
    rawPatch.cevirmen = meta.translator.trim();
  }
  if (meta.publishDate && meta.publishDate.trim()) {
    rawPatch.yayin_tarihi = meta.publishDate.trim();
  }
  if (meta.format && meta.format.trim()) {
    rawPatch.format = meta.format.trim();
  }
  if (meta.genres && meta.genres.length > 0) {
    rawPatch.tur = meta.genres;
  }
  if (meta.coverUrl && meta.coverUrl.trim()) {
    rawPatch.kapak = meta.coverUrl.trim();
  }
  if (meta.price && meta.price.trim()) {
    rawPatch.fiyat = meta.price.trim();
  }
  if (meta.language && meta.language.trim()) {
    rawPatch.dil = meta.language.trim();
  }

  const mapper = new PropertyMapper(settings.propertyMappings);
  return mapper.convertObject(rawPatch);
}

/**
 * Orchestrates the Goodreads CSV import and existing-note update workflow.
 */
export class GoodreadsImporter {
  private readonly app: App;
  private readonly plugin: KitapPlugin;
  private readonly enrichmentService?: GoodreadsEnrichmentService;

  constructor(
    app: App,
    plugin: KitapPlugin,
    enrichmentService?: GoodreadsEnrichmentService
  ) {
    this.app = app;
    this.plugin = plugin;
    this.enrichmentService = enrichmentService;
  }

  /**
   * Resolves a collision-safe vault file path for a new book note.
   */
  private resolveNoteFilePath(
    book: ParsedGoodreadsBook,
    targetFolder: string,
    settings: KitapPluginSettings
  ): string {
    const template = settings.fileNameTemplate || '{{title}} - {{author}}';
    const fileBookMeta = {
      ...book.metadata,
      title: book.cleanTitle || book.metadata.title || 'İsimsiz Kitap',
    };
    const renderedName = renderBookTemplate(template, fileBookMeta, settings.propertyMappings);
    const safeBaseName =
      sanitizeFileName(renderedName) ||
      sanitizeFileName(book.cleanTitle || book.metadata.title) ||
      'Kitap Notu';

    const cleanFolder = normalizePath(targetFolder || '').replace(/^\/+|\/+$/g, '');
    const buildPath = (name: string): string =>
      cleanFolder && cleanFolder !== '.'
        ? normalizePath(`${cleanFolder}/${name}.md`)
        : `${name}.md`;

    let candidatePath = buildPath(safeBaseName);
    let suffix = 2;

    while (this.app.vault?.getAbstractFileByPath?.(candidatePath)) {
      candidatePath = buildPath(`${safeBaseName} (${suffix})`);
      suffix++;
    }

    return candidatePath;
  }

  /**
   * Executes the import and optional update workflow for a partitioned DuplicateScanResult.
   */
  async importBooks(
    scanResult: DuplicateScanResult,
    options: ImportOptions
  ): Promise<ImportResult> {
    const settings: KitapPluginSettings = {
      ...DEFAULT_SETTINGS,
      ...(this.plugin?.settings || {}),
    };

    const targetFolder = (
      options.targetFolder ??
      settings.targetFolder ??
      DEFAULT_SETTINGS.targetFolder
    ).trim();

    const newBooks = scanResult.newBooks || [];
    const existingMatches = scanResult.existingBooks || [];
    const shouldUpdateExisting = Boolean(options.updateExisting);
    const existingToUpdate = shouldUpdateExisting ? existingMatches : [];
    const skippedCount = shouldUpdateExisting ? 0 : existingMatches.length;

    const totalOperations = newBooks.length + existingToUpdate.length;
    let currentStep = 0;
    let importedCount = 0;
    let updatedCount = 0;
    const errors: ImportErrorItem[] = [];

    // Only instantiate or use enrichment service if enrichFromProviders is explicitly enabled
    const enricher = options.enrichFromProviders
      ? this.enrichmentService ??
        new GoodreadsEnrichmentService(this.plugin?.aggregator, settings)
      : undefined;

    if (newBooks.length > 0 && targetFolder && !options.abortSignal?.aborted) {
      await ensureFolderExists(this.app.vault, targetFolder);
    }

    // 1. Import New Books
    for (const rawBook of newBooks) {
      if (options.abortSignal?.aborted) {
        break;
      }

      currentStep++;
      const displayTitle =
        rawBook.cleanTitle || rawBook.metadata.title || 'İsimsiz Kitap';
      options.onProgress?.(
        currentStep,
        totalOperations,
        `İçe aktarılıyor: ${displayTitle}`
      );

      try {
        let book: ParsedGoodreadsBook = {
          ...rawBook,
          metadata: { ...rawBook.metadata },
        };

        if (options.enrichFromProviders && enricher) {
          book = await enricher.enrichBook(book, options.abortSignal);
          if (options.abortSignal?.aborted) {
            break;
          }
        }

        if (settings.downloadCovers && book.metadata.coverUrl) {
          await downloadBookCover(this.app, book.metadata, settings);
        }

        let noteContent = await buildBookNoteContent({
          book: book.metadata,
          settings,
          app: this.app,
        });

        if (settings.useDefaultFrontMatter !== false) {
          const fmPatch = buildNewNoteFrontmatterPatch(book, settings);
          const patched = updateFrontmatterNonDestructive(noteContent, fmPatch);
          noteContent = patched.updatedContent;
        }

        if (book.reviewMarkdown && book.reviewMarkdown.trim()) {
          const isSpoiler =
            typeof book.raw.spoiler === 'string' &&
            book.raw.spoiler.trim().toLowerCase() === 'true';
          const reviewBlock = formatReviewSection(book.reviewMarkdown, isSpoiler);
          if (reviewBlock && !noteContent.includes(book.reviewMarkdown.trim())) {
            noteContent = `${noteContent.trimEnd()}${reviewBlock}`;
          }
        }

        const filePath = this.resolveNoteFilePath(book, targetFolder, settings);
        await this.app.vault.create(filePath, noteContent);
        importedCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ title: displayTitle, error: message });
      }
    }

    // 2. Non-Destructively Update Existing Books (only if user opted in)
    for (const match of existingToUpdate) {
      if (options.abortSignal?.aborted) {
        break;
      }

      currentStep++;
      const displayTitle =
        match.csvBook.cleanTitle ||
        match.csvBook.metadata.title ||
        match.existingNote.title ||
        'İsimsiz Kitap';
      options.onProgress?.(
        currentStep,
        totalOperations,
        `Güncelleniyor: ${displayTitle}`
      );

      try {
        let book: ParsedGoodreadsBook = {
          ...match.csvBook,
          metadata: { ...match.csvBook.metadata },
        };

        if (options.enrichFromProviders && enricher) {
          book = await enricher.enrichBook(book, options.abortSignal);
          if (options.abortSignal?.aborted) {
            break;
          }
        }

        if (settings.downloadCovers && book.metadata.coverUrl) {
          await downloadBookCover(this.app, book.metadata, settings);
        }

        const existingContent = await this.app.vault.read(match.existingNote.file);
        const updatePatch = buildExistingNoteUpdatePatch(book, settings);
        const { updatedContent, changed } = updateFrontmatterNonDestructive(
          existingContent,
          updatePatch
        );

        if (changed) {
          await this.app.vault.modify(match.existingNote.file, updatedContent);
        }
        updatedCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ title: displayTitle, error: message });
      }
    }

    return {
      importedCount,
      updatedCount,
      skippedCount,
      errors,
    };
  }
}
