import { describe, it, expect, beforeEach } from 'vitest';
import { GoodreadsImportModal } from '../../src/modal/goodreadsImportModal';
import { createMockObsidianApp } from '../e2e/harness/mockVault';
import {
  SAMPLE_CSV_STANDARD,
  SAMPLE_EXISTING_VAULT_NOTE_DUNE,
} from '../e2e/harness/fixtures';
import { DEFAULT_SETTINGS, type KitapPluginSettings } from '../../src/types';
import type KitapPlugin from '../../src/main';

describe('GoodreadsImportModal UI & Lifecycle', () => {
  let mockEnv: ReturnType<typeof createMockObsidianApp>;
  let mockPlugin: KitapPlugin;

  beforeEach(() => {
    mockEnv = createMockObsidianApp();
    const mockState = {
      app: mockEnv.app,
      settings: { ...DEFAULT_SETTINGS } as KitapPluginSettings,
      activeImportModal: null as GoodreadsImportModal | null,
    };
    mockPlugin = mockState as unknown as KitapPlugin;
  });

  it('renders initial file selection state with dropzone and file input', () => {
    const modal = new GoodreadsImportModal(mockEnv.app, mockPlugin);
    modal.open();

    const input = modal.contentEl.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input?.accept).toContain('.csv');
    expect(modal.getCurrentStep()).toBe('select');

    modal.close();
  });

  it('rejects invalid CSV content without Title/Author headers and displays error banner', async () => {
    const modal = new GoodreadsImportModal(mockEnv.app, mockPlugin);
    modal.open();

    await modal.handleFileSelected('Col1,Col2,Col3\n1,2,3', 'invalid.csv');

    expect(modal.getCurrentStep()).toBe('select');
    const banner = modal.contentEl.querySelector('.kitap-import-error-banner');
    expect(banner?.textContent).toContain('Geçersiz Goodreads CSV');

    modal.close();
  });

  it('rejects empty CSV content with error banner', async () => {
    const modal = new GoodreadsImportModal(mockEnv.app, mockPlugin);
    modal.open();

    await modal.handleFileSelected('   ', 'empty.csv');

    expect(modal.getCurrentStep()).toBe('select');
    const banner = modal.contentEl.querySelector('.kitap-import-error-banner');
    expect(banner?.textContent).toContain('Seçilen CSV dosyası boş');

    modal.close();
  });

  it('parses valid CSV and partitions new vs existing vault books in preview state', async () => {
    mockEnv.vault.createFile('Kitaplar/Dune.md', SAMPLE_EXISTING_VAULT_NOTE_DUNE, {
      isbn: '9780441172719',
      baslik: 'Dune',
      yazar: 'Frank Herbert',
    });

    const modal = new GoodreadsImportModal(mockEnv.app, mockPlugin);
    modal.open();

    await modal.handleFileSelected(SAMPLE_CSV_STANDARD, 'goodreads.csv');

    expect(modal.getCurrentStep()).toBe('preview');
    const scanResult = modal.getScanResult();
    expect(scanResult).not.toBeNull();
    expect(scanResult?.existingBooks.length).toBeGreaterThanOrEqual(1);
    expect(scanResult?.newBooks.length).toBeGreaterThanOrEqual(1);

    const statNums = modal.contentEl.querySelectorAll('.kitap-import-stat-num');
    expect(statNums.length).toBe(3);

    modal.close();
  });

  it('lists existing books with match reason badge and vault details in preview', async () => {
    mockEnv.vault.createFile('Kitaplar/Dune.md', SAMPLE_EXISTING_VAULT_NOTE_DUNE, {
      isbn: '9780441172719',
      baslik: 'Dune',
      yazar: 'Frank Herbert',
    });

    const modal = new GoodreadsImportModal(mockEnv.app, mockPlugin);
    modal.open();

    await modal.handleFileSelected(SAMPLE_CSV_STANDARD, 'goodreads.csv');

    const badge = modal.contentEl.querySelector('.kitap-import-match-badge');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('Eşleşmesi');

    modal.close();
  });

  it('defaults updateExisting to false and allows toggling to true', async () => {
    mockEnv.vault.createFile('Kitaplar/Dune.md', SAMPLE_EXISTING_VAULT_NOTE_DUNE, {
      isbn: '9780441172719',
    });

    const modal = new GoodreadsImportModal(mockEnv.app, mockPlugin);
    modal.open();
    await modal.handleFileSelected(SAMPLE_CSV_STANDARD, 'goodreads.csv');

    expect(modal.getUpdateExisting()).toBe(false);

    modal.setUpdateExisting(true);
    expect(modal.getUpdateExisting()).toBe(true);

    modal.close();
  });

  it('defaults enrichFromProviders to false (offline-first requirement)', async () => {
    const modal = new GoodreadsImportModal(mockEnv.app, mockPlugin);
    modal.open();
    await modal.handleFileSelected(SAMPLE_CSV_STANDARD, 'goodreads.csv');

    expect(modal.getEnrichFromProviders()).toBe(false);

    modal.setEnrichFromProviders(true);
    expect(modal.getEnrichFromProviders()).toBe(true);

    modal.close();
  });

  it('allows user to navigate back to file selection via Geri button', async () => {
    const modal = new GoodreadsImportModal(mockEnv.app, mockPlugin);
    modal.open();
    await modal.handleFileSelected(SAMPLE_CSV_STANDARD, 'goodreads.csv');
    expect(modal.getCurrentStep()).toBe('preview');

    const backBtn = modal.contentEl.querySelector('button.mod-cancel') as HTMLButtonElement | null;
    expect(backBtn).not.toBeNull();
    backBtn?.click();

    expect(modal.getCurrentStep()).toBe('select');
    modal.close();
  });

  it('updates progress bar and status message reactively during import', async () => {
    const modal = new GoodreadsImportModal(mockEnv.app, mockPlugin, {
      importHandler: async (_scanResult, options) => {
        options.onProgress?.(1, 2, 'İşleniyor: Dune');
        options.onProgress?.(2, 2, 'Tamamlandı');
        return { importedCount: 2, updatedCount: 0, errors: [] };
      },
    });

    modal.open();
    await modal.handleFileSelected(SAMPLE_CSV_STANDARD, 'goodreads.csv');
    const result = await modal.startImport();

    expect(result.importedCount).toBe(2);
    expect(modal.getCurrentStep()).toBe('completed');

    const statNums = modal.contentEl.querySelectorAll('.kitap-import-stat-num');
    expect(statNums.length).toBe(3);

    modal.close();
  });

  it('triggers AbortController when cancel button is clicked', async () => {
    let wasAborted = false;
    const modal = new GoodreadsImportModal(mockEnv.app, mockPlugin, {
      importHandler: async (_scanResult, options) => {
        return new Promise((resolve) => {
          options.abortSignal?.addEventListener('abort', () => {
            wasAborted = true;
            resolve({
              importedCount: 0,
              updatedCount: 0,
              errors: [{ title: 'All', error: 'Aborted' }],
            });
          });
        });
      },
    });

    modal.open();
    await modal.handleFileSelected(SAMPLE_CSV_STANDARD, 'goodreads.csv');
    const importPromise = modal.startImport();

    modal.cancelImport();
    await importPromise;

    expect(wasAborted).toBe(true);
    modal.close();
  });

  it('renders completed step with error list when errors occur', async () => {
    const modal = new GoodreadsImportModal(mockEnv.app, mockPlugin, {
      importHandler: async () => {
        return {
          importedCount: 1,
          updatedCount: 0,
          errors: [{ title: 'Bozuk Kitap', error: 'ISBN bulunamadı' }],
        };
      },
    });

    modal.open();
    await modal.handleFileSelected(SAMPLE_CSV_STANDARD, 'goodreads.csv');
    await modal.startImport();

    expect(modal.getCurrentStep()).toBe('completed');
    const errorDetails = modal.contentEl.querySelector('details.kitap-import-existing-details');
    expect(errorDetails).not.toBeNull();
    expect(errorDetails?.textContent).toContain('Bozuk Kitap');

    modal.close();
  });
});
