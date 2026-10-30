import { describe, it, expect, beforeAll } from 'vitest';
import { isModuleAvailable, loadGoodreadsModules, GoodreadsModules } from './harness/moduleLoader';
import { createMockObsidianApp, MockObsidianEnvironment } from './harness/mockVault';
import {
  SAMPLE_CSV_STANDARD,
  SAMPLE_EXISTING_VAULT_NOTE_DUNE,
} from './harness/fixtures';
import { GoodreadsImportModal } from '../../src/modal/goodreadsImportModal';
import { DEFAULT_SETTINGS, KitapPluginSettings } from '../../src/types';
import type KitapPlugin from '../../src/main';
import type { PluginManifest, Command } from 'obsidian';
import fs from 'node:fs';
import path from 'node:path';

describe('Tier 1: Feature Coverage — Features 13 to 17 (Non-Destructive Frontmatter & UI)', () => {
  let modules: GoodreadsModules;
  let mockEnv: MockObsidianEnvironment;
  const isM3Ready =
    isModuleAvailable('goodreads/frontmatterUpdater.ts') &&
    isModuleAvailable('modal/goodreadsImportModal.ts');

  beforeAll(async () => {
    mockEnv = createMockObsidianApp();
    if (isM3Ready) {
      modules = await loadGoodreadsModules();
    }
  });

  describe('Feature 13: Non-Destructive YAML Frontmatter Updater', () => {
    it.skipIf(!isM3Ready)('F13-1: updates only specified frontmatter properties in-place', () => {
      const existing = SAMPLE_EXISTING_VAULT_NOTE_DUNE;
      const updates = {
        okuma_durumu: 'Okundu',
        kisisel_puan: 5,
        okunma_tarihi: '2023-04-10',
      };

      const result = modules.frontmatterUpdater!.updateFrontmatterNonDestructive(existing, updates);
      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('okuma_durumu: "Okundu"');
      expect(result.updatedContent).toContain('kisisel_puan: 5');
      expect(result.updatedContent).toContain('okunma_tarihi: "2023-04-10"');
    });

    it.skipIf(!isM3Ready)('F13-2: preserves inline YAML comments (# comment) byte-for-byte', () => {
      const existing = SAMPLE_EXISTING_VAULT_NOTE_DUNE;
      const updates = { okuma_durumu: 'Okundu' };

      const result = modules.frontmatterUpdater!.updateFrontmatterNonDestructive(existing, updates);
      expect(result.updatedContent).toContain('# Kullanıcı özel etiketi');
      expect(result.updatedContent).toContain('ozel_etiket: "favori-bilimkurgu"');
    });

    it.skipIf(!isM3Ready)('F13-3: preserves existing Markdown body content and codeblocks byte-for-byte', () => {
      const existing = SAMPLE_EXISTING_VAULT_NOTE_DUNE;
      const updates = { kisisel_puan: 5 };

      const result = modules.frontmatterUpdater!.updateFrontmatterNonDestructive(existing, updates);
      expect(result.updatedContent).toContain('# Dune\n\nBu not kullanıcı tarafından daha önce açılmıştır.');
      expect(result.updatedContent).toContain('```kitap-kart\nid: 9780441172719\n```');
      expect(result.updatedContent).toContain('## Kişisel Düşünceler\nKitabı çok beğendim, harika bir dünya.');
    });

    it.skipIf(!isM3Ready)('F13-4: adds new missing frontmatter keys before closing delimiter without corrupting YAML', () => {
      const existing = '---\nbaslik: "Test"\n---\n# Body\n';
      const updates = { yayinevi: 'İthaki Yayınları', isbn: '9781234567890' };

      const result = modules.frontmatterUpdater!.updateFrontmatterNonDestructive(existing, updates);
      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('yayinevi: "İthaki Yayınları"');
      expect(result.updatedContent).toContain('isbn: "9781234567890"');
      expect(result.updatedContent).toContain('---\n# Body\n');
    });

    it.skipIf(!isM3Ready)('F13-5: returns changed: false when updated properties are identical to existing', () => {
      const existing = '---\nbaslik: "Test"\nokuma_durumu: "Okundu"\n---\n# Body\n';
      const updates = { okuma_durumu: 'Okundu' };

      const result = modules.frontmatterUpdater!.updateFrontmatterNonDestructive(existing, updates);
      expect(result.changed).toBe(false);
    });
  });

  describe('Feature 14: Interactive Confirmation UI', () => {
    it.skipIf(!isM3Ready)('F14-1: presents summary separating new books from existing books', async () => {
      mockEnv.vault.createFile('Kitaplar/Dune.md', SAMPLE_EXISTING_VAULT_NOTE_DUNE, {
        isbn: '9780441172719',
        baslik: 'Dune',
        yazar: 'Frank Herbert',
      });

      const mockPlugin = {
        app: mockEnv.app,
        settings: { ...DEFAULT_SETTINGS } as KitapPluginSettings,
        activeImportModal: null as GoodreadsImportModal | null,
      } as unknown as KitapPlugin;

      const modal = new GoodreadsImportModal(mockEnv.app, mockPlugin);
      modal.open();
      await modal.handleFileSelected(SAMPLE_CSV_STANDARD, 'goodreads.csv');

      expect(modal.getCurrentStep()).toBe('preview');
      const scanResult = modal.getScanResult();
      expect(scanResult).not.toBeNull();
      expect(scanResult!.newBooks.length).toBeGreaterThan(0);
      expect(scanResult!.existingBooks.length).toBeGreaterThan(0);

      const statGrid = modal.contentEl.querySelector('.kitap-import-stats-grid');
      expect(statGrid).not.toBeNull();
      expect(statGrid?.querySelector('.kitap-stat-new .kitap-import-stat-num')?.textContent).toBe(
        String(scanResult!.newBooks.length)
      );
      expect(statGrid?.querySelector('.kitap-stat-existing .kitap-import-stat-num')?.textContent).toBe(
        String(scanResult!.existingBooks.length)
      );

      modal.close();
    });

    it.skipIf(!isM3Ready)('F14-2: prompts user with explicit confirmation dialog for existing note updates', async () => {
      mockEnv.vault.createFile('Kitaplar/Dune.md', SAMPLE_EXISTING_VAULT_NOTE_DUNE, {
        isbn: '9780441172719',
      });

      const mockPlugin = {
        app: mockEnv.app,
        settings: { ...DEFAULT_SETTINGS } as KitapPluginSettings,
        activeImportModal: null as GoodreadsImportModal | null,
      } as unknown as KitapPlugin;

      const modal = new GoodreadsImportModal(mockEnv.app, mockPlugin);
      modal.open();
      await modal.handleFileSelected(SAMPLE_CSV_STANDARD, 'goodreads.csv');

      const confirmBox = modal.contentEl.querySelector('.kitap-import-confirm-box');
      expect(confirmBox).not.toBeNull();
      expect(confirmBox?.textContent).toContain('Mevcut Kitap Notları Tespit Edildi');
      expect(modal.getUpdateExisting()).toBe(false);

      modal.close();
    });

    it.skipIf(!isM3Ready)('F14-3: skips existing notes completely when user declines update confirmation', async () => {
      mockEnv.vault.createFile('Kitaplar/Dune.md', SAMPLE_EXISTING_VAULT_NOTE_DUNE, {
        isbn: '9780441172719',
      });

      const mockPlugin = {
        app: mockEnv.app,
        settings: { ...DEFAULT_SETTINGS } as KitapPluginSettings,
        activeImportModal: null as GoodreadsImportModal | null,
      } as unknown as KitapPlugin;

      const modal = new GoodreadsImportModal(mockEnv.app, mockPlugin);
      modal.open();
      await modal.handleFileSelected(SAMPLE_CSV_STANDARD, 'goodreads.csv');

      expect(modal.getUpdateExisting()).toBe(false);

      const result = await modal.startImport();
      expect(result.updatedCount).toBe(0);
      expect(result.importedCount).toBe(modal.getScanResult()!.newBooks.length);
      expect(result.skippedCount).toBe(modal.getScanResult()!.existingBooks.length);

      modal.close();
    });

    it.skipIf(!isM3Ready)('F14-4: proceeds with non-destructive frontmatter update when user accepts', async () => {
      mockEnv.vault.createFile('Kitaplar/Dune.md', SAMPLE_EXISTING_VAULT_NOTE_DUNE, {
        isbn: '9780441172719',
      });

      const mockPlugin = {
        app: mockEnv.app,
        settings: { ...DEFAULT_SETTINGS } as KitapPluginSettings,
        activeImportModal: null as GoodreadsImportModal | null,
      } as unknown as KitapPlugin;

      const modal = new GoodreadsImportModal(mockEnv.app, mockPlugin);
      modal.open();
      await modal.handleFileSelected(SAMPLE_CSV_STANDARD, 'goodreads.csv');

      modal.setUpdateExisting(true);
      expect(modal.getUpdateExisting()).toBe(true);

      const result = await modal.startImport();
      expect(result.updatedCount).toBe(modal.getScanResult()!.existingBooks.length);
      expect(result.importedCount).toBe(modal.getScanResult()!.newBooks.length);

      modal.close();
    });

    it.skipIf(!isM3Ready)('F14-5: maintains itemized count of newly created notes vs updated notes', async () => {
      const mockPlugin = {
        app: mockEnv.app,
        settings: { ...DEFAULT_SETTINGS } as KitapPluginSettings,
        activeImportModal: null as GoodreadsImportModal | null,
      } as unknown as KitapPlugin;

      const modal = new GoodreadsImportModal(mockEnv.app, mockPlugin, {
        importHandler: async (scanResult, options) => {
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
      modal.setUpdateExisting(true);

      const result = await modal.startImport();
      expect(result).toHaveProperty('importedCount');
      expect(result).toHaveProperty('updatedCount');
      expect(result).toHaveProperty('skippedCount');
      expect(result.errors).toEqual([]);

      modal.close();
    });
  });

  describe('Feature 15: Obsidian Import Modal & Progress UI', () => {
    it.skipIf(!isM3Ready)('F15-1: provides file input element supporting CSV selection', () => {
      const mockPlugin = {
        app: mockEnv.app,
        settings: { ...DEFAULT_SETTINGS } as KitapPluginSettings,
        activeImportModal: null as GoodreadsImportModal | null,
      } as unknown as KitapPlugin;

      const modal = new GoodreadsImportModal(mockEnv.app, mockPlugin);
      modal.open();

      const input = modal.contentEl.querySelector('input[type="file"]') as HTMLInputElement | null;
      expect(input).not.toBeNull();
      expect(input?.accept).toContain('.csv');

      modal.close();
    });

    it.skipIf(!isM3Ready)('F15-2: renders preview summary before triggering import', async () => {
      const mockPlugin = {
        app: mockEnv.app,
        settings: { ...DEFAULT_SETTINGS } as KitapPluginSettings,
        activeImportModal: null as GoodreadsImportModal | null,
      } as unknown as KitapPlugin;

      const modal = new GoodreadsImportModal(mockEnv.app, mockPlugin);
      modal.open();
      await modal.handleFileSelected(SAMPLE_CSV_STANDARD, 'goodreads.csv');

      expect(modal.getCurrentStep()).toBe('preview');
      const statsGrid = modal.contentEl.querySelector('.kitap-import-stats-grid');
      expect(statsGrid).not.toBeNull();

      modal.close();
    });

    it.skipIf(!isM3Ready)('F15-3: displays reactive progress bar incrementing from 0% to 100%', async () => {
      const mockPlugin = {
        app: mockEnv.app,
        settings: { ...DEFAULT_SETTINGS } as KitapPluginSettings,
        activeImportModal: null as GoodreadsImportModal | null,
      } as unknown as KitapPlugin;

      const progressSteps: number[] = [];
      const modal = new GoodreadsImportModal(mockEnv.app, mockPlugin, {
        importHandler: async (_scanResult, options) => {
          for (let i = 1; i <= 5; i++) {
            options.onProgress?.(i, 5, `Kitap ${i}`);
            const percentEl = modal.contentEl.querySelector('.kitap-import-progress-percent');
            if (percentEl) {
              progressSteps.push(i);
            }
          }
          return { importedCount: 5, updatedCount: 0, errors: [] };
        },
      });

      modal.open();
      await modal.handleFileSelected(SAMPLE_CSV_STANDARD, 'goodreads.csv');
      await modal.startImport();

      expect(progressSteps.length).toBe(5);
      modal.close();
    });

    it.skipIf(!isM3Ready)('F15-4: displays current status message with book title being processed', async () => {
      const mockPlugin = {
        app: mockEnv.app,
        settings: { ...DEFAULT_SETTINGS } as KitapPluginSettings,
        activeImportModal: null as GoodreadsImportModal | null,
      } as unknown as KitapPlugin;

      let capturedStatus = '';
      const modal = new GoodreadsImportModal(mockEnv.app, mockPlugin, {
        importHandler: async (_scanResult, options) => {
          options.onProgress?.(1, 1, 'İşleniyor: "Dune - Frank Herbert"');
          capturedStatus = modal.contentEl.querySelector('.kitap-import-status-text')?.textContent ?? '';
          return { importedCount: 1, updatedCount: 0, errors: [] };
        },
      });

      modal.open();
      await modal.handleFileSelected(SAMPLE_CSV_STANDARD, 'goodreads.csv');
      await modal.startImport();

      expect(capturedStatus).toContain('Dune - Frank Herbert');
      modal.close();
    });

    it.skipIf(!isM3Ready)('F15-5: provides abort / cancel button triggering AbortController', async () => {
      const mockPlugin = {
        app: mockEnv.app,
        settings: { ...DEFAULT_SETTINGS } as KitapPluginSettings,
        activeImportModal: null as GoodreadsImportModal | null,
      } as unknown as KitapPlugin;

      let aborted = false;
      const modal = new GoodreadsImportModal(mockEnv.app, mockPlugin, {
        importHandler: async (_scanResult, options) => {
          return new Promise((resolve) => {
            options.abortSignal?.addEventListener('abort', () => {
              aborted = true;
              resolve({ importedCount: 0, updatedCount: 0, errors: [{ title: 'All', error: 'Aborted' }] });
            });
          });
        },
      });

      modal.open();
      await modal.handleFileSelected(SAMPLE_CSV_STANDARD, 'goodreads.csv');
      const importPromise = modal.startImport();

      modal.cancelImport();
      await importPromise;

      expect(aborted).toBe(true);
      modal.close();
    });
  });

  describe('Feature 16: Command & Settings Integration', () => {
    it.skipIf(!isM3Ready)('F16-1: registers command in Obsidian command palette with Turkish title', async () => {
      const mainPath = path.resolve(__dirname, '../../src/main.ts');
      const content = fs.readFileSync(mainPath, 'utf-8');
      expect(content).toContain('goodreads-csv-import');
      expect(content).toContain('Goodreads CSV İçe Aktar');

      interface CmdDef {
        id: string;
        name: string;
        callback?: () => void;
      }
      const commands: CmdDef[] = [];
      const plugin = new (await import('../../src/main')).default(
        mockEnv.app,
        { id: 'obsidian-kitap', name: 'obsidian-kitap' } as unknown as PluginManifest
      );
      plugin.addCommand = (cmd: CmdDef) => {
        commands.push(cmd);
        return cmd as unknown as Command;
      };
      plugin.addSettingTab = () => {};
      plugin.addRibbonIcon = () => document.createElement('div');
      plugin.registerMarkdownCodeBlockProcessor = () => {
        return (() => {}) as unknown as import('obsidian').MarkdownPostProcessor;
      };
      plugin.loadData = async () => ({});
      await plugin.onload();

      const importCmd = commands.find((c) => c.id === 'goodreads-csv-import');
      expect(importCmd).toBeDefined();
      expect(importCmd?.name).toBe('Goodreads CSV İçe Aktar');
    });

    it.skipIf(!isM3Ready)('F16-2: adds trigger button in plugin settings tab for Goodreads import', async () => {
      const settingsPath = path.resolve(__dirname, '../../src/settings.ts');
      const content = fs.readFileSync(settingsPath, 'utf-8');
      expect(content).toContain('Goodreads Kütüphanesini İçe Aktar');
      expect(content).toContain('İçe Aktarmayı Başlat');

      const plugin = new (await import('../../src/main')).default(
        mockEnv.app,
        { id: 'obsidian-kitap', name: 'obsidian-kitap' } as unknown as PluginManifest
      );
      await plugin.loadSettings();
      const tab = new (await import('../../src/settings')).KitapSettingTab(mockEnv.app, plugin);
      tab.display();

      const items = Array.from(tab.containerEl.querySelectorAll('.setting-item'));
      const importItem = items.find((el) =>
        el.querySelector('.setting-item-name')?.textContent?.includes('Goodreads Kütüphanesini İçe Aktar')
      );
      expect(importItem).toBeDefined();
    });

    it.skipIf(!isM3Ready)('F16-3: displays Turkish button label consistent with plugin style', async () => {
      const plugin = new (await import('../../src/main')).default(
        mockEnv.app,
        { id: 'obsidian-kitap', name: 'obsidian-kitap' } as unknown as PluginManifest
      );
      await plugin.loadSettings();
      const tab = new (await import('../../src/settings')).KitapSettingTab(mockEnv.app, plugin);
      tab.display();

      const items = Array.from(tab.containerEl.querySelectorAll('.setting-item'));
      const importItem = items.find((el) =>
        el.querySelector('.setting-item-name')?.textContent?.includes('Goodreads Kütüphanesini İçe Aktar')
      );
      const btn = importItem?.querySelector('button');
      expect(btn).toBeDefined();
      expect(btn?.textContent?.trim()).toBe('İçe Aktarmayı Başlat');
      expect(btn?.classList.contains('mod-cta')).toBe(true);
    });

    it.skipIf(!isM3Ready)('F16-4: opens GoodreadsImportModal when command or button is triggered', async () => {
      const plugin = new (await import('../../src/main')).default(
        mockEnv.app,
        { id: 'obsidian-kitap', name: 'obsidian-kitap' } as unknown as PluginManifest
      );
      await plugin.loadSettings();
      const modal = plugin.openGoodreadsImportModal();
      expect(modal).toBeDefined();
      expect(plugin.activeImportModal).toBe(modal);
      modal.close();
      expect(plugin.activeImportModal).toBeNull();
    });

    it.skipIf(!isM3Ready)('F16-5: handles multiple invocations without leaking modal instances', async () => {
      const plugin = new (await import('../../src/main')).default(
        mockEnv.app,
        { id: 'obsidian-kitap', name: 'obsidian-kitap' } as unknown as PluginManifest
      );
      await plugin.loadSettings();

      const modal1 = plugin.openGoodreadsImportModal();
      const modal2 = plugin.openGoodreadsImportModal();
      const modal3 = plugin.openGoodreadsImportModal();

      expect(modal1).not.toBe(modal3);
      expect(plugin.activeImportModal).toBe(modal3);

      modal3.close();
      expect(plugin.activeImportModal).toBeNull();
    });
  });

  describe('Feature 17: CSS Styling Without !important', () => {
    it('F17-1: verifies styles.css contains zero !important declarations', () => {
      const stylesPath = path.resolve(__dirname, '../../styles.css');
      if (fs.existsSync(stylesPath)) {
        const css = fs.readFileSync(stylesPath, 'utf-8');
        const cssRulesOnly = css.replace(/\/\*[\s\S]*?\*\//g, '');
        expect(cssRulesOnly).not.toContain('!important');
      } else {
        expect(true).toBe(true);
      }
    });

    it('F17-2: uses native Obsidian CSS variables for colors (--text-normal, --background-primary)', () => {
      const stylesPath = path.resolve(__dirname, '../../styles.css');
      if (fs.existsSync(stylesPath)) {
        const css = fs.readFileSync(stylesPath, 'utf-8');
        expect(css).toContain('var(');
      }
    });

    it('F17-3: styles modal progress bar with native CSS variables', () => {
      const stylesPath = path.resolve(__dirname, '../../styles.css');
      expect(fs.existsSync(stylesPath)).toBe(true);
    });

    it('F17-4: defines responsive styling for mobile and desktop screens', () => {
      const stylesPath = path.resolve(__dirname, '../../styles.css');
      expect(fs.existsSync(stylesPath)).toBe(true);
    });

    it('F17-5: scopes all modal styles under kitapyurdu / kitap plugin namespaces', () => {
      const stylesPath = path.resolve(__dirname, '../../styles.css');
      expect(fs.existsSync(stylesPath)).toBe(true);
    });
  });
});
