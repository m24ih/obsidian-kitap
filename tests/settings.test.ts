import { describe, it, expect, beforeEach, vi } from 'vitest';
import KitapPlugin from '../src/main';
import { KitapSettingTab } from '../src/settings';
import {
  DEFAULT_SETTINGS,
  DEFAULT_NOTE_TEMPLATE,
  DEFAULT_STATIC_TEMPLATE,
  DEFAULT_REACTIVE_TEMPLATE,
} from '../src/types';
import { lastNotices, MockSetting, TFile, TFolder } from './setup';

describe('Plugin Settings & Lifecycle', () => {
  let plugin: KitapPlugin;
  let mockData: any = null;
  let mockWorkspace: { getActiveFile: ReturnType<typeof vi.fn> };
  let mockApp: any;

  beforeEach(() => {
    mockData = null;
    lastNotices.length = 0;

    mockWorkspace = {
      getActiveFile: vi.fn().mockReturnValue({ path: 'test.md' }),
    };

    mockApp = {
      workspace: mockWorkspace,
    };

    plugin = new KitapPlugin(mockApp as any, {} as any);
    plugin.loadData = vi.fn().mockImplementation(async () => mockData);
    plugin.saveData = vi.fn().mockImplementation(async (data: unknown) => {
      mockData = data as Record<string, unknown>;
    });
    plugin.addSettingTab = vi.fn();
    plugin.addRibbonIcon = vi.fn().mockReturnValue({ addClass: vi.fn() });
    plugin.addCommand = vi.fn();
  });

  describe('Plugin Lifecycle & Settings Storage', () => {
    it('loads default settings when disk storage is empty', async () => {
      mockData = null;
      await plugin.loadSettings();
      expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
    });

    it('merges saved user settings with default settings', async () => {
      mockData = {
        targetFolder: 'Okuma Listesi',
      };
      await plugin.loadSettings();
      expect(plugin.settings.targetFolder).toBe('Okuma Listesi');
      expect(plugin.settings.fileNameTemplate).toBe(DEFAULT_SETTINGS.fileNameTemplate);
      expect(plugin.settings.noteTemplate).toBe(DEFAULT_SETTINGS.noteTemplate);
    });

    it('persists modified settings via saveSettings()', async () => {
      await plugin.loadSettings();
      plugin.settings.targetFolder = 'Yeni/Klasor';
      await plugin.saveSettings();

      expect(plugin.saveData).toHaveBeenCalledWith(plugin.settings);
      expect(mockData).toEqual(plugin.settings);
    });

    it('registers ribbon icon, commands, and settings tab in onload()', async () => {
      await plugin.onload();

      expect(plugin.addSettingTab).toHaveBeenCalledTimes(1);
      expect(plugin.addRibbonIcon).toHaveBeenCalledWith(
        'book-open',
        'Kitap Ara ve Ekle',
        expect.any(Function)
      );

      expect(plugin.addCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'search-and-add-book',
          name: 'Ara ve yeni not oluştur',
        })
      );

      expect(plugin.addCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'insert-book-into-active-note',
          name: 'Aktif nota bilgileri ekle',
        })
      );
    });

    it('unloads cleanly with onunload()', () => {
      expect(() => plugin.onunload()).not.toThrow();
    });

    it('handles search modal notices correctly', () => {
      plugin.openSearchModal();
      expect(lastNotices).toContain('Kitap arama penceresi açılıyor...');

      plugin.openSearchModal({ insertIntoActive: true });
      expect(lastNotices).toContain('Aktif nota kitap bilgisi ekleme aracı açılıyor...');
    });
  });

  describe('KitapSettingTab UI Rendering & Interactions', () => {
    let settingTab: KitapSettingTab;

    beforeEach(async () => {
      await plugin.loadSettings();
      settingTab = new KitapSettingTab(mockApp as any, plugin);
    });

    it('renders Turkish headers and descriptions in display()', () => {
      settingTab.display();

      const text = (settingTab.containerEl.textContent || '').toLowerCase();
      expect(text).toContain('genel dosya ayarları');
      expect(text).toContain('not şablonu ve biçimlendirme');
      expect(text).toContain('kullanılabilir şablon değişkenleri');
      expect(text).toContain('{{title}}');
      expect(text).toContain('{{author}}');
      expect(text).toContain('{{publisher}}');
    });

    it('renders targetFolder and updates settings when input changes', async () => {
      settingTab.display();

      const settingItems = settingTab.containerEl.querySelectorAll('.setting-item');
      let targetFolderInput: HTMLInputElement | undefined;
      for (const item of Array.from(settingItems)) {
        const nameEl = item.querySelector('.setting-item-name');
        if (nameEl?.textContent?.includes('Hedef Klasör')) {
          targetFolderInput = item.querySelector('input') as HTMLInputElement;
        }
      }

      expect(targetFolderInput).toBeDefined();
      expect(targetFolderInput?.value).toBe('Kitaplar');

      if (targetFolderInput) {
        targetFolderInput.value = 'Okunanlar/2026';
        const component = (targetFolderInput as any).component;
        if (component) {
          await component.simulateChange('Okunanlar/2026');
        }
      }

      expect(plugin.settings.targetFolder).toBe('Okunanlar/2026');
      expect(mockData?.targetFolder).toBe('Okunanlar/2026');
    });

    it('renders fileNameTemplate and updates settings when input changes', async () => {
      settingTab.display();

      const settingItems = settingTab.containerEl.querySelectorAll('.setting-item');
      let fileNameInput: HTMLInputElement | undefined;
      for (const item of Array.from(settingItems)) {
        const nameEl = item.querySelector('.setting-item-name');
        if (nameEl?.textContent?.includes('Dosya Adı Şablonu')) {
          fileNameInput = item.querySelector('input') as HTMLInputElement;
        }
      }

      expect(fileNameInput).toBeDefined();
      expect(fileNameInput?.value).toBe('{{baslik}} - {{yazar}}');

      if (fileNameInput) {
        const component = (fileNameInput as any).component;
        if (component) {
          await component.simulateChange('{{isbn}} - {{title}}');
        }
      }

      expect(plugin.settings.fileNameTemplate).toBe('{{isbn}} - {{title}}');
      expect(mockData?.fileNameTemplate).toBe('{{isbn}} - {{title}}');
    });

    it('renders defaultProvider dropdown and updates settings when changed', async () => {
      settingTab.display();

      const settingItems = settingTab.containerEl.querySelectorAll('.setting-item');
      let providerDropdown: HTMLSelectElement | undefined;
      for (const item of Array.from(settingItems)) {
        const nameEl = item.querySelector('.setting-item-name');
        if (nameEl?.textContent?.includes('Varsayılan Metaveri Sağlayıcı')) {
          providerDropdown = item.querySelector('select') as HTMLSelectElement;
        }
      }

      expect(providerDropdown).toBeDefined();
      expect(providerDropdown?.value).toBe('hybrid');

      const component = (providerDropdown as any).component;
      if (component) {
        await component.simulateChange('kitapyurdu');
      }

      expect(plugin.settings.defaultProvider).toBe('kitapyurdu');
    });

    it('safely falls back to available provider in dropdown when settings contain unknown provider', () => {
      plugin.settings.defaultProvider = 'deleted_provider';
      settingTab.display();

      const settingItems = settingTab.containerEl.querySelectorAll('.setting-item');
      let providerDropdown: HTMLSelectElement | undefined;
      for (const item of Array.from(settingItems)) {
        const el = item as HTMLElement;
        const nameEl = el.querySelector('.setting-item-name');
        if (nameEl?.textContent?.includes('Varsayılan Metaveri Sağlayıcı')) {
          providerDropdown = el.querySelector('select') as HTMLSelectElement;
        }
      }

      expect(providerDropdown).toBeDefined();
      expect(providerDropdown?.value).toBe('hybrid');
    });

    it('renders templateMode dropdown and updates settings when changed', async () => {
      settingTab.display();

      const settingItems = settingTab.containerEl.querySelectorAll('.setting-item');
      let templateModeDropdown: HTMLSelectElement | undefined;
      for (const item of Array.from(settingItems)) {
        const nameEl = item.querySelector('.setting-item-name');
        if (nameEl?.textContent?.includes('Şablon Modu')) {
          templateModeDropdown = item.querySelector('select') as HTMLSelectElement;
        }
      }

      expect(templateModeDropdown).toBeDefined();
      expect(templateModeDropdown?.value).toBe('static');

      const component = (templateModeDropdown as any).component;
      if (component) {
        await component.simulateChange('reactive');
      }

      expect(plugin.settings.templateMode).toBe('reactive');
      expect(mockData?.templateMode).toBe('reactive');
    });

    it('renders noteTemplate textarea and resets to default when reset button is clicked', async () => {
      plugin.settings.templateMode = 'custom';
      plugin.settings.noteTemplate = 'Custom template content';
      settingTab.display();

      const settingItems = settingTab.containerEl.querySelectorAll('.setting-item');
      let resetButton: HTMLButtonElement | undefined;
      for (const item of Array.from(settingItems)) {
        const nameEl = item.querySelector('.setting-item-name');
        if (nameEl?.textContent?.includes('Statik Şablona Dönüştür') || nameEl?.textContent?.includes('Şablonu Sıfırla')) {
          resetButton = item.querySelector('button') as HTMLButtonElement;
        }
      }

      expect(resetButton).toBeDefined();

      if (resetButton) {
        const component = (resetButton as any).component;
        if (component) {
          await component.simulateClick();
        }
      }

      expect(plugin.settings.noteTemplate).toBe(DEFAULT_STATIC_TEMPLATE);
      expect(lastNotices).toContain('Not şablonu orijinal Statik şablona dönüştürüldü.');
    });

    it('renders downloadCovers toggle and coverFolder input and updates settings when changed', async () => {
      plugin.settings.downloadCovers = true;
      plugin.settings.coverFolder = 'Kitaplar/Kapaklar';
      settingTab.display();

      const settingItems = settingTab.containerEl.querySelectorAll('.setting-item');
      let downloadToggleInput: HTMLInputElement | undefined;
      let coverFolderInput: HTMLInputElement | undefined;

      for (const item of Array.from(settingItems)) {
        const nameEl = item.querySelector('.setting-item-name');
        if (nameEl?.textContent?.includes('Kapak Görsellerini İndir')) {
          downloadToggleInput = item.querySelector('input[type="checkbox"]') as HTMLInputElement;
        }
        if (nameEl?.textContent?.includes('Kapak Klasörü')) {
          coverFolderInput = item.querySelector('input') as HTMLInputElement;
        }
      }

      expect(downloadToggleInput).toBeDefined();
      expect(coverFolderInput).toBeDefined();
      expect(coverFolderInput?.value).toBe('Kitaplar/Kapaklar');

      if (downloadToggleInput) {
        const component = (downloadToggleInput as any).component;
        if (component) {
          await component.simulateToggle(false);
        }
      }
      expect(plugin.settings.downloadCovers).toBe(false);

      if (coverFolderInput) {
        const component = (coverFolderInput as any).component;
        if (component) {
          await component.simulateChange('Medya/Kapaklar');
        }
      }
      expect(plugin.settings.coverFolder).toBe('Medya/Kapaklar');
    });

    it('saves templateFile when selected from FileSuggest and retains value on reopen', async () => {
      plugin.settings.templateMode = 'custom';
      settingTab.display();

      const settingItems = settingTab.containerEl.querySelectorAll('.setting-item');
      let templateFileInput: HTMLInputElement | undefined;
      for (const item of Array.from(settingItems)) {
        const nameEl = item.querySelector('.setting-item-name');
        if (nameEl?.textContent?.includes('Şablon Dosyası')) {
          templateFileInput = item.querySelector('input') as HTMLInputElement;
        }
      }

      expect(templateFileInput).toBeDefined();
      expect(templateFileInput?.value).toBe('');

      // Simüle et: suggester üzerinden dosya seçildi
      const mockFile = Object.assign(new TFile(), { path: 'Books Template.md', name: 'Books Template.md' });
      const suggester = (templateFileInput as any).suggester;
      expect(suggester).toBeDefined();

      await suggester.selectSuggestion(mockFile);

      expect(plugin.settings.templateFile).toBe('Books Template.md');
      expect(mockData?.templateFile).toBe('Books Template.md');
      expect(templateFileInput?.value).toBe('Books Template.md');

      // Ayarlar kapatılıp tekrar açıldığında (display yeniden çağrıldığında)
      settingTab.display();
      const reloadedItems = settingTab.containerEl.querySelectorAll('.setting-item');
      let reloadedInput: HTMLInputElement | undefined;
      for (const item of Array.from(reloadedItems)) {
        const nameEl = item.querySelector('.setting-item-name');
        if (nameEl?.textContent?.includes('Şablon Dosyası')) {
          reloadedInput = item.querySelector('input') as HTMLInputElement;
        }
      }
      expect(reloadedInput?.value).toBe('Books Template.md');
    });

    it('saves targetFolder when selected from FolderSuggest', async () => {
      settingTab.display();

      const settingItems = settingTab.containerEl.querySelectorAll('.setting-item');
      let targetFolderInput: HTMLInputElement | undefined;
      for (const item of Array.from(settingItems)) {
        const nameEl = item.querySelector('.setting-item-name');
        if (nameEl?.textContent?.includes('Hedef Klasör')) {
          targetFolderInput = item.querySelector('input') as HTMLInputElement;
        }
      }

      expect(targetFolderInput).toBeDefined();
      const mockFolder = Object.assign(new TFolder(), { path: 'Kitaplarim/2026' });
      const suggester = (targetFolderInput as any).suggester;
      expect(suggester).toBeDefined();

      await suggester.selectSuggestion(mockFolder);

      expect(plugin.settings.targetFolder).toBe('Kitaplarim/2026');
      expect(mockData?.targetFolder).toBe('Kitaplarim/2026');
    });

    it('saves coverFolder when selected from FolderSuggest', async () => {
      plugin.settings.downloadCovers = true;
      settingTab.display();

      const settingItems = settingTab.containerEl.querySelectorAll('.setting-item');
      let coverFolderInput: HTMLInputElement | undefined;
      for (const item of Array.from(settingItems)) {
        const nameEl = item.querySelector('.setting-item-name');
        if (nameEl?.textContent?.includes('Kapak Klasörü')) {
          coverFolderInput = item.querySelector('input') as HTMLInputElement;
        }
      }

      expect(coverFolderInput).toBeDefined();
      const mockFolder = Object.assign(new TFolder(), { path: 'Kapaklar/Gorseller' });
      const suggester = (coverFolderInput as any).suggester;
      expect(suggester).toBeDefined();

      await suggester.selectSuggestion(mockFolder);

      expect(plugin.settings.coverFolder).toBe('Kapaklar/Gorseller');
      expect(mockData?.coverFolder).toBe('Kapaklar/Gorseller');
    });
  });

  describe('Adversarial & Defensive Tests', () => {
    it('sanitizes whitespace in targetFolder', async () => {
      mockData = { targetFolder: '   ' };
      await plugin.loadSettings();
      expect(plugin.settings.targetFolder).toBe('Kitaplar');
    });

    it('sanitizes whitespace in fileNameTemplate', async () => {
      mockData = { fileNameTemplate: '   ' };
      await plugin.loadSettings();
      expect(plugin.settings.fileNameTemplate).toBe('{{baslik}} - {{yazar}}');
    });

    it('falls back to default noteTemplate when non-string is provided', async () => {
      mockData = { noteTemplate: 12345 };
      await plugin.loadSettings();
      expect(plugin.settings.noteTemplate).toBe(DEFAULT_NOTE_TEMPLATE);
    });

    it('sanitizes and migrates downloadCovers and coverFolder with media-db compatibility', async () => {
      // media-db pluginindeki imageDownload ve imageFolder alanları için geriye dönük fallback testi
      mockData = {
        imageDownload: true,
        imageFolder: 'Media DB/covers  ',
      };
      await plugin.loadSettings();
      expect(plugin.settings.downloadCovers).toBe(true);
      expect(plugin.settings.coverFolder).toBe('Media DB/covers');
    });

    it('sanitizes empty whitespace in coverFolder to default', async () => {
      mockData = { coverFolder: '   ' };
      await plugin.loadSettings();
      expect(plugin.settings.coverFolder).toBe('Kitaplar/Kapaklar');
    });

    it('sanitizes empty whitespace in defaultProvider to default', async () => {
      mockData = { defaultProvider: '   ' };
      await plugin.loadSettings();
      expect(plugin.settings.defaultProvider).toBe('hybrid');
    });

    it('falls back to defaultProvider when non-string is provided', async () => {
      mockData = { defaultProvider: 12345 };
      await plugin.loadSettings();
      expect(plugin.settings.defaultProvider).toBe('hybrid');
    });

    it('sanitizes and defaults global provider settings', async () => {
      mockData = {
        enableOpenLibrary: 'not_a_boolean',
        enableHardcover: 123,
        hardcoverApiKey: '   secret_token_123   ',
      };
      await plugin.loadSettings();
      expect(plugin.settings.enableOpenLibrary).toBe(false);
      expect(plugin.settings.enableHardcover).toBe(false);
      expect(plugin.settings.hardcoverApiKey).toBe('secret_token_123');
    });

    it('handles global provider UI toggles and input correctly', async () => {
      const settingTab = new KitapSettingTab(mockApp as any, plugin);
      await plugin.loadSettings();
      settingTab.display();

      const items = Array.from(settingTab.containerEl.querySelectorAll('.setting-item'));

      // Find OpenLibrary toggle
      const olItem = items.find((el) =>
        el.querySelector('.setting-item-name')?.textContent?.includes('OpenLibrary')
      );
      expect(olItem).toBeDefined();
      const olToggle = (olItem?.querySelector('input[type="checkbox"]') as any)?.component;
      expect(olToggle).toBeDefined();

      await olToggle.simulateToggle(true);
      expect(plugin.settings.enableOpenLibrary).toBe(true);

      // Find Hardcover toggle
      const hcItem = items.find((el) =>
        el.querySelector('.setting-item-name')?.textContent?.includes('Hardcover')
      );
      expect(hcItem).toBeDefined();
      const hcToggle = (hcItem?.querySelector('input[type="checkbox"]') as any)?.component;
      expect(hcToggle).toBeDefined();

      await hcToggle.simulateToggle(true);
      expect(plugin.settings.enableHardcover).toBe(true);
    });

    it('prevents disabling the last remaining active book provider', async () => {
      const settingTab = new KitapSettingTab(mockApp as any, plugin);
      await plugin.loadSettings();
      plugin.settings.enableKitapyurdu = true;
      plugin.settings.enableDr = false;
      plugin.settings.enableOpenLibrary = false;
      plugin.settings.enableHardcover = false;

      settingTab.display();
      const items = Array.from(settingTab.containerEl.querySelectorAll('.setting-item')) as HTMLElement[];
      const kyItem = items.find((el) =>
        el.querySelector('.setting-item-name')?.textContent?.includes('Kitapyurdu')
      );
      expect(kyItem).toBeDefined();
      const kyToggle = (kyItem?.querySelector('input[type="checkbox"]') as any)?.component;
      expect(kyToggle).toBeDefined();

      // Trying to toggle off the last active provider should be rejected
      await kyToggle.simulateToggle(false);
      expect(plugin.settings.enableKitapyurdu).toBe(true);
    });

    it('manages Hardcover API key with Secret Storage and falls back safely', async () => {
      const settingTab = new KitapSettingTab(mockApp as any, plugin);
      await plugin.loadSettings();
      plugin.settings.enableHardcover = true;
      plugin.settings.hardcoverApiKeyId = 'test-secret-id';
      settingTab.display();

      const items = Array.from(settingTab.containerEl.querySelectorAll('.setting-item')) as HTMLElement[];
      const apiKeyItem = items.find((el) =>
        el.querySelector('.setting-item-name')?.textContent?.includes('Hardcover API Anahtarı')
      );
      expect(apiKeyItem).toBeDefined();
    });

    it('resets defaultProvider to hybrid if selected global provider is disabled', async () => {
      mockData = {
        defaultProvider: 'openlibrary',
        enableOpenLibrary: false,
      };
      await plugin.loadSettings();
      expect(plugin.settings.defaultProvider).toBe('hybrid');
      expect(plugin.aggregator.getDefaultProviderId()).toBe('hybrid');

      mockData = {
        defaultProvider: 'hardcover',
        enableHardcover: false,
      };
      await plugin.loadSettings();
      expect(plugin.settings.defaultProvider).toBe('hybrid');
      expect(plugin.aggregator.getDefaultProviderId()).toBe('hybrid');
    });
  });
});

