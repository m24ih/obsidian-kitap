import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { GoodreadsImportModal } from '../../src/modal/goodreadsImportModal';
import KitapPlugin from '../../src/main';
import { KitapSettingTab } from '../../src/settings';
import { createMockObsidianApp } from '../e2e/harness/mockVault';
import {
  SAMPLE_CSV_STANDARD,
  SAMPLE_EXISTING_VAULT_NOTE_DUNE,
} from '../e2e/harness/fixtures';
import { DEFAULT_SETTINGS, type KitapPluginSettings } from '../../src/types';
import type { ImportOptions, ImportResult } from '../../src/goodreads/types';

describe('Milestone 3 Empirical Challenge Suite: Modal UI, Singleton, Integration & CSS', () => {
  let mockEnv: ReturnType<typeof createMockObsidianApp>;
  let plugin: KitapPlugin;

  beforeEach(() => {
    mockEnv = createMockObsidianApp();
    const mockState = {
      app: mockEnv.app,
      settings: { ...DEFAULT_SETTINGS } as KitapPluginSettings,
      activeImportModal: null as GoodreadsImportModal | null,
    };
    plugin = mockState as unknown as KitapPlugin;
    plugin.openGoodreadsImportModal = KitapPlugin.prototype.openGoodreadsImportModal.bind(plugin);
  });

  // =========================================================================
  // 1. Singleton Tracking & Rapid Open/Close Concurrency
  // =========================================================================
  describe('1. Singleton Tracking & Rapid Open/Close Concurrency', () => {
    it('maintains exactly one active modal when openGoodreadsImportModal() is called repeatedly', () => {
      const modals: GoodreadsImportModal[] = [];
      const closeSpies: Array<ReturnType<typeof vi.spyOn>> = [];

      for (let i = 0; i < 50; i++) {
        const modal = plugin.openGoodreadsImportModal();
        modals.push(modal);
        closeSpies.push(vi.spyOn(modal, 'close'));
      }

      // Exactly 50 modals created
      expect(modals.length).toBe(50);
      // The active modal on the plugin must be the 50th modal
      expect(plugin.activeImportModal).toBe(modals[49]);

      // All previous 49 modals must have been closed
      for (let i = 0; i < 49; i++) {
        expect(closeSpies[i]).toHaveBeenCalledTimes(1);
      }
      // The last modal was NOT closed by the loop
      expect(closeSpies[49]).not.toHaveBeenCalled();

      // Finally close the last modal
      plugin.activeImportModal?.close();
      expect(plugin.activeImportModal).toBeNull();
    });

    it('handles out-of-order close without invalidating newer active modal', () => {
      const modal1 = plugin.openGoodreadsImportModal();
      expect(plugin.activeImportModal).toBe(modal1);

      const modal2 = plugin.openGoodreadsImportModal();
      expect(plugin.activeImportModal).toBe(modal2);

      // Suppose an event listener or timeout belatedly calls close on modal1
      modal1.close();

      // modal2 MUST remain the activeImportModal because modal1 !== plugin.activeImportModal
      expect(plugin.activeImportModal).toBe(modal2);

      modal2.close();
      expect(plugin.activeImportModal).toBeNull();
    });

    it('is idempotent when close() is invoked multiple times on the same instance', () => {
      const modal = plugin.openGoodreadsImportModal();
      expect(plugin.activeImportModal).toBe(modal);

      expect(() => {
        modal.close();
        modal.close();
        modal.close();
      }).not.toThrow();

      expect(plugin.activeImportModal).toBeNull();
    });

    it('aborts active background import if a new modal is opened over a running one', async () => {
      let aborted = false;
      const runningModal = new GoodreadsImportModal(mockEnv.app, plugin, {
        importHandler: async (_scan, opts) => {
          return new Promise<ImportResult>((resolve) => {
            opts.abortSignal?.addEventListener('abort', () => {
              aborted = true;
              resolve({
                importedCount: 0,
                updatedCount: 0,
                skippedCount: 0,
                errors: [{ title: 'Interrupted', error: 'Aborted by new modal' }],
              });
            });
          });
        },
      });

      plugin.activeImportModal = runningModal;
      runningModal.open();
      await runningModal.handleFileSelected(SAMPLE_CSV_STANDARD, 'goodreads.csv');

      // Start import without awaiting completion
      const importPromise = runningModal.startImport();

      // Now user or command triggers openGoodreadsImportModal()
      const newModal = plugin.openGoodreadsImportModal();

      await importPromise;

      expect(aborted).toBe(true);
      expect(plugin.activeImportModal).toBe(newModal);
      expect(plugin.activeImportModal).not.toBe(runningModal);

      newModal.close();
    });

    it('integrates with command palette callback to invoke openGoodreadsImportModal', () => {
      let registeredCommand: { id: string; name: string; callback?: () => void } | null = null;
      plugin.addCommand = vi.fn().mockImplementation((cmd) => {
        if (cmd.id === 'goodreads-csv-import') {
          registeredCommand = cmd;
        }
      });

      // Call registerCommands via main prototype
      const registerCommands = (KitapPlugin.prototype as unknown as { registerCommands: () => void })
        .registerCommands;
      registerCommands.call(plugin);

      expect(registeredCommand).not.toBeNull();
      const cmd = registeredCommand as { id: string; name: string; callback?: () => void } | null;
      expect(cmd?.id).toBe('goodreads-csv-import');
      expect(cmd?.name).toBe('Goodreads CSV İçe Aktar');

      // Execute callback
      const openSpy = vi.spyOn(plugin, 'openGoodreadsImportModal');
      cmd?.callback?.();
      expect(openSpy).toHaveBeenCalledTimes(1);

      plugin.activeImportModal?.close();
    });

    it('integrates with Settings tab button to trigger openGoodreadsImportModal', () => {
      const openSpy = vi.spyOn(plugin, 'openGoodreadsImportModal');

      const settingTab = new KitapSettingTab(mockEnv.app, plugin);
      settingTab.display();

      // Find the button in the rendered settings container
      const buttons = settingTab.containerEl.querySelectorAll('button');
      let importBtn: HTMLButtonElement | null = null;
      for (const btn of Array.from(buttons)) {
        if (btn.textContent?.includes('İçe Aktarmayı Başlat')) {
          importBtn = btn;
          break;
        }
      }

      expect(importBtn).not.toBeNull();
      importBtn?.click();

      expect(openSpy).toHaveBeenCalledTimes(1);
      expect(plugin.activeImportModal).not.toBeNull();

      plugin.activeImportModal?.close();
    });
  });

  // =========================================================================
  // 2. Adversarial & Invalid File Ingestion
  // =========================================================================
  describe('2. Adversarial & Invalid File Ingestion', () => {
    it('rejects empty string with Turkish error message and stays on select step', async () => {
      const modal = new GoodreadsImportModal(mockEnv.app, plugin);
      modal.open();

      await modal.handleFileSelected('', 'empty.csv');

      expect(modal.getCurrentStep()).toBe('select');
      const banner = modal.contentEl.querySelector('.kitap-import-error-banner');
      expect(banner?.textContent).toContain('Seçilen CSV dosyası boş');
      expect(banner?.classList.contains('is-hidden')).toBe(false);

      modal.close();
    });

    it('rejects whitespace-only file input (spaces, tabs, newlines)', async () => {
      const modal = new GoodreadsImportModal(mockEnv.app, plugin);
      modal.open();

      await modal.handleFileSelected('   \t\r\n   \n\r\n', 'whitespace.csv');

      expect(modal.getCurrentStep()).toBe('select');
      const banner = modal.contentEl.querySelector('.kitap-import-error-banner');
      expect(banner?.textContent).toContain('Seçilen CSV dosyası boş');

      modal.close();
    });

    it('rejects UTF-8 BOM only input', async () => {
      const modal = new GoodreadsImportModal(mockEnv.app, plugin);
      modal.open();

      await modal.handleFileSelected('\uFEFF', 'bom_only.csv');
      expect(modal.getCurrentStep()).toBe('select');
      const banner1 = modal.contentEl.querySelector('.kitap-import-error-banner');
      expect(banner1?.textContent).toContain('Seçilen CSV dosyası boş');

      await modal.handleFileSelected('\uFEFF   \r\n', 'bom_whitespace.csv');
      expect(modal.getCurrentStep()).toBe('select');
      const banner2 = modal.contentEl.querySelector('.kitap-import-error-banner');
      expect(banner2?.textContent).toContain('Seçilen CSV dosyası boş');

      modal.close();
    });

    it('rejects plain text file lacking Goodreads header columns', async () => {
      const modal = new GoodreadsImportModal(mockEnv.app, plugin);
      modal.open();

      await modal.handleFileSelected(
        'Bu bir düz metin dosyasıdır.\nİkinci satır notlar içerir.\nÜçüncü satır.',
        'notes.txt'
      );

      expect(modal.getCurrentStep()).toBe('select');
      const banner = modal.contentEl.querySelector('.kitap-import-error-banner');
      expect(banner?.textContent).toContain("Geçersiz Goodreads CSV formatı");
      expect(banner?.textContent).toContain("Title");

      modal.close();
    });

    it('rejects arbitrary non-Goodreads CSV headers (e.g. contacts export)', async () => {
      const modal = new GoodreadsImportModal(mockEnv.app, plugin);
      modal.open();

      await modal.handleFileSelected(
        'First Name,Last Name,Email,Phone,Country\nAhmet,Yılmaz,ahmet@example.com,5551234567,TR',
        'contacts.csv'
      );

      expect(modal.getCurrentStep()).toBe('select');
      const banner = modal.contentEl.querySelector('.kitap-import-error-banner');
      expect(banner?.textContent).toContain("Geçersiz Goodreads CSV formatı");

      modal.close();
    });

    it('rejects CSV with valid headers but 0 book records', async () => {
      const modal = new GoodreadsImportModal(mockEnv.app, plugin);
      modal.open();

      await modal.handleFileSelected(
        'Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Recommended For,Recommended By,Owned Copies,Original Purchase Date,Original Purchase Location,Condition,Condition Description,Notes\n',
        'header_only.csv'
      );

      expect(modal.getCurrentStep()).toBe('select');
      const banner = modal.contentEl.querySelector('.kitap-import-error-banner');
      expect(banner?.textContent).toContain('CSV dosyasında okunabilecek kitap kaydı bulunamadı');

      modal.close();
    });

    it('handles unexpected parser exception via processFile gracefully without crashing', async () => {
      const modal = new GoodreadsImportModal(mockEnv.app, plugin, {
        parserFn: () => {
          throw new Error('Fatal corrupted byte sequence in parser');
        },
      });
      modal.open();

      const file = new File(['Book Id,Title,Author\n1,Dune,Frank Herbert'], 'corrupt.csv', {
        type: 'text/csv',
      });
      await (modal as unknown as { processFile: (f: File) => Promise<void> }).processFile(file);

      expect(modal.getCurrentStep()).toBe('select');
      const banner = modal.contentEl.querySelector('.kitap-import-error-banner');
      expect(banner?.textContent).toContain('Fatal corrupted byte sequence in parser');

      modal.close();
    });

    it('handles unexpected vault scanner exception gracefully without crashing', async () => {
      const modal = new GoodreadsImportModal(mockEnv.app, plugin, {
        scannerFn: async () => {
          throw new Error('Vault indexer timeout');
        },
      });
      modal.open();

      await modal.handleFileSelected(SAMPLE_CSV_STANDARD, 'goodreads.csv');

      expect(modal.getCurrentStep()).toBe('select');
      const banner = modal.contentEl.querySelector('.kitap-import-error-banner');
      expect(banner?.textContent).toContain('Tarama sırasında hata oluştu');
      expect(banner?.textContent).toContain('Vault indexer timeout');

      modal.close();
    });

    it('clears previous error banner when a valid file is subsequently supplied', async () => {
      const modal = new GoodreadsImportModal(mockEnv.app, plugin);
      modal.open();

      // First pass: invalid file
      await modal.handleFileSelected('invalid text', 'invalid.csv');
      expect(modal.getCurrentStep()).toBe('select');
      let banner = modal.contentEl.querySelector('.kitap-import-error-banner');
      expect(banner?.textContent).toContain('Geçersiz Goodreads CSV formatı');

      // Second pass: valid file
      await modal.handleFileSelected(SAMPLE_CSV_STANDARD, 'goodreads.csv');
      expect(modal.getCurrentStep()).toBe('preview');

      // Navigate back to select step and ensure banner error is cleared
      const backBtn = modal.contentEl.querySelector('button.mod-cancel') as HTMLButtonElement;
      backBtn.click();
      expect(modal.getCurrentStep()).toBe('select');

      banner = modal.contentEl.querySelector('.kitap-import-error-banner');
      expect(banner?.classList.contains('is-hidden')).toBe(true);
      expect(banner?.textContent).toBe('');

      modal.close();
    });
  });

  // =========================================================================
  // 3. Interactive Confirmation & updateExisting (Declined vs Confirmed)
  // =========================================================================
  describe('3. Interactive Confirmation & updateExisting (Declined vs Confirmed)', () => {
    beforeEach(() => {
      // Seed vault with Dune
      mockEnv.vault.createFile('Kitaplar/Dune.md', SAMPLE_EXISTING_VAULT_NOTE_DUNE, {
        isbn: '9780441172719',
        baslik: 'Dune',
        yazar: 'Frank Herbert',
      });
    });

    it('defaults updateExisting to false, shows correct submit button text, and skips existing books when declined', async () => {
      let receivedOptions: ImportOptions | null = null;
      const modal = new GoodreadsImportModal(mockEnv.app, plugin, {
        importHandler: async (scanResult, options) => {
          receivedOptions = options;
          return {
            importedCount: scanResult.newBooks.length,
            updatedCount: options.updateExisting ? scanResult.existingBooks.length : 0,
            skippedCount: options.updateExisting ? 0 : scanResult.existingBooks.length,
            errors: [],
          };
        },
      });

      modal.open();
      await modal.handleFileSelected(SAMPLE_CSV_STANDARD, 'goodreads.csv');

      expect(modal.getCurrentStep()).toBe('preview');
      expect(modal.getUpdateExisting()).toBe(false);

      const scanResult = modal.getScanResult();
      expect(scanResult?.existingBooks.length).toBeGreaterThanOrEqual(1);
      const newCount = scanResult?.newBooks.length ?? 0;

      // Submit button text should reflect new books only
      const submitBtn = modal.contentEl.querySelector('button.mod-cta') as HTMLButtonElement;
      expect(submitBtn.textContent).toBe(`Yalnızca Yeni Kitapları Aktar (${newCount} Kitap)`);

      // Run import with updateExisting = false
      const result = await modal.startImport();

      expect((receivedOptions as ImportOptions | null)?.updateExisting).toBe(false);
      expect(result.updatedCount).toBe(0);
      expect(result.skippedCount).toBe(scanResult?.existingBooks.length);
      expect(result.importedCount).toBe(newCount);

      // Verify Completed Screen Stats
      expect(modal.getCurrentStep()).toBe('completed');
      const statNums = modal.contentEl.querySelectorAll('.kitap-import-stat-num');
      expect(statNums[0].textContent).toBe(String(newCount));
      expect(statNums[1].textContent).toBe('0'); // Güncellenen
      expect(statNums[2].textContent).toBe(String(scanResult?.existingBooks.length)); // Atlanan

      modal.close();
    });

    it('updates submit button text dynamically when updateExisting is confirmed, and updates existing books', async () => {
      let receivedOptions: ImportOptions | null = null;
      const modal = new GoodreadsImportModal(mockEnv.app, plugin, {
        importHandler: async (scanResult, options) => {
          receivedOptions = options;
          return {
            importedCount: scanResult.newBooks.length,
            updatedCount: options.updateExisting ? scanResult.existingBooks.length : 0,
            skippedCount: options.updateExisting ? 0 : scanResult.existingBooks.length,
            errors: [],
          };
        },
      });

      modal.open();
      await modal.handleFileSelected(SAMPLE_CSV_STANDARD, 'goodreads.csv');

      const scanResult = modal.getScanResult()!;
      const newCount = scanResult.newBooks.length;
      const existingCount = scanResult.existingBooks.length;

      // User confirms updating existing books
      modal.setUpdateExisting(true);
      expect(modal.getUpdateExisting()).toBe(true);

      const submitBtn = modal.contentEl.querySelector('button.mod-cta') as HTMLButtonElement;
      expect(submitBtn.textContent).toBe(
        `İçe Aktar ve Güncelle (${newCount} Yeni, ${existingCount} Güncelleme)`
      );

      // Run import with updateExisting = true
      const result = await modal.startImport();

      expect((receivedOptions as ImportOptions | null)?.updateExisting).toBe(true);
      expect(result.updatedCount).toBe(existingCount);
      expect(result.skippedCount).toBe(0);
      expect(result.importedCount).toBe(newCount);

      // Verify Completed Screen Stats
      expect(modal.getCurrentStep()).toBe('completed');
      const statNums = modal.contentEl.querySelectorAll('.kitap-import-stat-num');
      expect(statNums[0].textContent).toBe(String(newCount));
      expect(statNums[1].textContent).toBe(String(existingCount)); // Güncellenen
      expect(statNums[2].textContent).toBe('0'); // Atlanan

      modal.close();
    });

    it('does not render confirmation box when zero duplicates exist in vault', async () => {
      // Empty vault
      const emptyEnv = createMockObsidianApp();
      const modal = new GoodreadsImportModal(emptyEnv.app, plugin);
      modal.open();

      await modal.handleFileSelected(SAMPLE_CSV_STANDARD, 'goodreads.csv');

      expect(modal.getCurrentStep()).toBe('preview');
      const confirmBox = modal.contentEl.querySelector('.kitap-import-confirm-box');
      expect(confirmBox).toBeNull();

      const scanResult = modal.getScanResult()!;
      expect(scanResult.existingBooks.length).toBe(0);
      const submitBtn = modal.contentEl.querySelector('button.mod-cta') as HTMLButtonElement;
      expect(submitBtn.textContent).toBe(
        `Yalnızca Yeni Kitapları Aktar (${scanResult.newBooks.length} Kitap)`
      );

      modal.close();
    });
  });

  // =========================================================================
  // 4. Provider Enrichment Checkbox Toggle & Offline-First Guarantees
  // =========================================================================
  describe('4. Provider Enrichment Checkbox Toggle & Offline-First Guarantees', () => {
    it('is strictly false by default complying with offline-first requirement R4', async () => {
      const modal = new GoodreadsImportModal(mockEnv.app, plugin);
      modal.open();
      await modal.handleFileSelected(SAMPLE_CSV_STANDARD, 'goodreads.csv');

      expect(modal.getEnrichFromProviders()).toBe(false);

      modal.close();
    });

    it('toggles enrichFromProviders state and passes it to ImportOptions', async () => {
      let passedOptions: ImportOptions | null = null;
      const modal = new GoodreadsImportModal(mockEnv.app, plugin, {
        importHandler: async (_scan, opts) => {
          passedOptions = opts;
          return { importedCount: 1, updatedCount: 0, skippedCount: 0, errors: [] };
        },
      });

      modal.open();
      await modal.handleFileSelected(SAMPLE_CSV_STANDARD, 'goodreads.csv');

      // Check default
      expect(modal.getEnrichFromProviders()).toBe(false);

      // Toggle to true
      modal.setEnrichFromProviders(true);
      expect(modal.getEnrichFromProviders()).toBe(true);

      await modal.startImport();
      expect((passedOptions as ImportOptions | null)?.enrichFromProviders).toBe(true);

      modal.close();
    });

    it('retains false when toggled to true then toggled back to false', async () => {
      let passedOptions: ImportOptions | null = null;
      const modal = new GoodreadsImportModal(mockEnv.app, plugin, {
        importHandler: async (_scan, opts) => {
          passedOptions = opts;
          return { importedCount: 1, updatedCount: 0, skippedCount: 0, errors: [] };
        },
      });

      modal.open();
      await modal.handleFileSelected(SAMPLE_CSV_STANDARD, 'goodreads.csv');

      modal.setEnrichFromProviders(true);
      expect(modal.getEnrichFromProviders()).toBe(true);

      modal.setEnrichFromProviders(false);
      expect(modal.getEnrichFromProviders()).toBe(false);

      await modal.startImport();
      expect((passedOptions as ImportOptions | null)?.enrichFromProviders).toBe(false);

      modal.close();
    });
  });

  // =========================================================================
  // 5. Progress Bar Updates & Cancel Button Behavior
  // =========================================================================
  describe('5. Progress Bar Updates & Cancel Button Behavior', () => {
    it('correctly updates progress UI elements and styles on granular progress events', async () => {
      let progressCallback: ImportOptions['onProgress'];

      const modal = new GoodreadsImportModal(mockEnv.app, plugin, {
        importHandler: async (_scan, opts) => {
          progressCallback = opts.onProgress;
          return new Promise<ImportResult>((resolve) => {
            // Keep unresolved until manually triggered
            (modal as unknown as { resolveImport: (res: ImportResult) => void }).resolveImport = resolve;
          });
        },
      });

      modal.open();
      await modal.handleFileSelected(SAMPLE_CSV_STANDARD, 'goodreads.csv');

      const importPromise = modal.startImport();
      expect(modal.getCurrentStep()).toBe('importing');

      // Test Boundary: 0 / 100
      progressCallback?.(0, 100, 'Başlıyor...');
      let fillEl = modal.contentEl.querySelector('.kitap-import-progress-fill') as HTMLElement;
      let percentEl = modal.contentEl.querySelector('.kitap-import-progress-percent') as HTMLElement;
      let statusEl = modal.contentEl.querySelector('.kitap-import-status-text') as HTMLElement;

      expect(fillEl.style.width).toBe('0%');
      expect(percentEl.textContent).toBe('%0 (0 / 100)');
      expect(statusEl.textContent).toBe('Başlıyor...');

      // Test Midpoint: 45 / 100
      progressCallback?.(45, 100, '45. kitap işleniyor');
      expect(fillEl.style.width).toBe('45%');
      expect(percentEl.textContent).toBe('%45 (45 / 100)');
      expect(statusEl.textContent).toBe('45. kitap işleniyor');

      // Test Completion: 100 / 100
      progressCallback?.(100, 100, 'Tamamlandı');
      expect(fillEl.style.width).toBe('100%');
      expect(percentEl.textContent).toBe('%100 (100 / 100)');
      expect(statusEl.textContent).toBe('Tamamlandı');

      // Test zero division edge case: total = 0
      modal.updateProgressUI(0, 0, 'Sıfır kayıt');
      expect(fillEl.style.width).toBe('0%');
      expect(percentEl.textContent).toBe('%0 (0 / 0)');

      // Resolve import
      (modal as unknown as { resolveImport: (res: ImportResult) => void }).resolveImport({
        importedCount: 10,
        updatedCount: 0,
        skippedCount: 0,
        errors: [],
      });
      await importPromise;

      expect(modal.getCurrentStep()).toBe('completed');
      modal.close();
    });

    it('aborts operation, updates UI status, and sets abort state when cancel button is clicked', async () => {
      let abortNotified = false;

      const modal = new GoodreadsImportModal(mockEnv.app, plugin, {
        importHandler: async (_scan, opts) => {
          return new Promise<ImportResult>((resolve) => {
            opts.abortSignal?.addEventListener('abort', () => {
              abortNotified = true;
              resolve({
                importedCount: 3,
                updatedCount: 0,
                skippedCount: 0,
                errors: [{ title: 'Durduruldu', error: 'Kullanıcı işlemi iptal etti' }],
              });
            });
          });
        },
      });

      modal.open();
      await modal.handleFileSelected(SAMPLE_CSV_STANDARD, 'goodreads.csv');

      const importPromise = modal.startImport();
      expect(modal.getCurrentStep()).toBe('importing');

      // Click cancel button
      const cancelBtn = modal.contentEl.querySelector('button.mod-warning') as HTMLButtonElement;
      expect(cancelBtn).not.toBeNull();
      cancelBtn.click();

      const result = await importPromise;

      expect(abortNotified).toBe(true);
      expect(modal.getCurrentStep()).toBe('completed');

      // Heading must indicate aborted status
      const heading = modal.contentEl.querySelector('h3');
      expect(heading?.textContent).toContain('İçe Aktarma Durduruldu');

      // Stats
      expect(result.importedCount).toBe(3);

      modal.close();
    });

    it('safely handles cancelImport() when no import has started', () => {
      const modal = new GoodreadsImportModal(mockEnv.app, plugin);
      modal.open();

      expect(() => modal.cancelImport()).not.toThrow();

      modal.close();
    });

    it('triggers abort signal if modal is closed via onClose() during active import', async () => {
      let abortNotified = false;

      const modal = new GoodreadsImportModal(mockEnv.app, plugin, {
        importHandler: async (_scan, opts) => {
          return new Promise<ImportResult>((resolve) => {
            opts.abortSignal?.addEventListener('abort', () => {
              abortNotified = true;
              resolve({
                importedCount: 1,
                updatedCount: 0,
                skippedCount: 0,
                errors: [],
              });
            });
          });
        },
      });

      modal.open();
      await modal.handleFileSelected(SAMPLE_CSV_STANDARD, 'goodreads.csv');

      const importPromise = modal.startImport();
      expect(modal.getCurrentStep()).toBe('importing');

      // User presses ESC or closes modal
      modal.close();

      await importPromise;
      expect(abortNotified).toBe(true);
    });
  });

  // =========================================================================
  // 6. CSS Rule Rigorous Audit (Zero !important & Class Match)
  // =========================================================================
  describe('6. CSS Rule Rigorous Audit (Zero !important & Class Match)', () => {
    const cssPath = path.resolve(__dirname, '../../styles.css');
    let rawCss: string;
    let cssWithoutComments: string;

    beforeEach(() => {
      rawCss = fs.readFileSync(cssPath, 'utf8');
      cssWithoutComments = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');
    });

    it('guarantees zero occurrences of !important declarations across styles.css', () => {
      const importantMatches = cssWithoutComments.match(/!important/gi);
      expect(importantMatches).toBeNull();
    });

    it('defines all modal CSS classes used in goodreadsImportModal.ts', () => {
      const expectedClasses = [
        '.modal.kitap-goodreads-modal',
        '.kitap-import-container',
        '.kitap-import-desc',
        '.kitap-import-error-banner',
        '.kitap-import-dropzone',
        '.kitap-import-dropzone-icon',
        '.kitap-import-dropzone-text',
        '.kitap-import-dropzone-subtext',
        '.kitap-import-file-input',
        '.kitap-import-file-info',
        '.kitap-import-file-name',
        '.kitap-import-stats-grid',
        '.kitap-import-stat-card',
        '.kitap-import-stat-num',
        '.kitap-import-stat-label',
        '.kitap-stat-new',
        '.kitap-stat-existing',
        '.kitap-stat-total',
        '.kitap-import-confirm-box',
        '.kitap-import-confirm-header',
        '.kitap-import-confirm-desc',
        '.kitap-import-existing-details',
        '.kitap-import-existing-summary',
        '.kitap-import-existing-list',
        '.kitap-import-existing-item',
        '.kitap-import-match-badge',
        '.kitap-import-options-section',
        '.kitap-import-progress-container',
        '.kitap-import-progress-bar-wrap',
        '.kitap-import-progress-fill',
        '.kitap-import-progress-meta',
        '.kitap-import-progress-percent',
        '.kitap-import-status-text',
        '.kitap-import-footer',
      ];

      for (const cls of expectedClasses) {
        expect(cssWithoutComments, `Class ${cls} must be defined in styles.css`).toContain(cls);
      }
    });

    it('contains responsive layout rules for small screens (< 640px)', () => {
      expect(cssWithoutComments).toContain('@media (max-width: 640px)');
      expect(cssWithoutComments).toContain('.kitap-import-stats-grid');
      expect(cssWithoutComments).toContain('.kitap-import-footer');
    });
  });

  // =========================================================================
  // 7. Static Constraints & Code Quality Verification
  // =========================================================================
  describe('7. Static Constraints & Code Quality Verification', () => {
    it('contains zero : any or as any casts in src/modal/goodreadsImportModal.ts', () => {
      const modalCodePath = path.resolve(__dirname, '../../src/modal/goodreadsImportModal.ts');
      const modalCode = fs.readFileSync(modalCodePath, 'utf8');
      const codeWithoutComments = modalCode
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');

      const anyCastMatch = codeWithoutComments.match(/(:\s*any\b|as\s+any\b)/g);
      expect(anyCastMatch).toBeNull();
    });

    it('contains zero runtime dependencies in package.json', () => {
      const pkgPath = path.resolve(__dirname, '../../package.json');
      const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

      expect(pkgJson.dependencies === undefined || Object.keys(pkgJson.dependencies).length === 0).toBe(true);
    });
  });
});
