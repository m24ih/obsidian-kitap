import { describe, it, expect, beforeEach, vi } from 'vitest';
import KitapPlugin from '../src/main';
import { KitapSettingTab } from '../src/settings';
import { DEFAULT_SETTINGS, DEFAULT_NOTE_TEMPLATE } from '../src/types';
import { lastNotices, MockSetting } from './setup';

describe('Milestone 1: Plugin Settings & Lifecycle', () => {
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
        maxQuotes: 12,
      };
      await plugin.loadSettings();
      expect(plugin.settings.targetFolder).toBe('Okuma Listesi');
      expect(plugin.settings.maxQuotes).toBe(12);
      expect(plugin.settings.fileNameTemplate).toBe(DEFAULT_SETTINGS.fileNameTemplate);
      expect(plugin.settings.includeQuotes).toBe(DEFAULT_SETTINGS.includeQuotes);
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
          name: 'Kitap Ara ve Ekle',
        })
      );

      expect(plugin.addCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'insert-book-into-active-note',
          name: 'Aktif Nota Kitap Bilgilerini Ekle',
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

    it('validates active file requirement in insert-book-into-active-note checkCallback', async () => {
      let registeredCallback: any;
      plugin.addCommand = vi.fn().mockImplementation((cmd: any) => {
        if (cmd.id === 'insert-book-into-active-note') {
          registeredCallback = cmd.checkCallback;
        }
      });

      await plugin.onload();
      expect(registeredCallback).toBeDefined();

      // When active file exists and checking is true
      mockWorkspace.getActiveFile.mockReturnValue({ path: 'note.md' });
      expect(registeredCallback(true)).toBe(true);

      // When active file exists and checking is false
      expect(registeredCallback(false)).toBe(true);
      expect(lastNotices).toContain('Aktif nota kitap bilgisi ekleme aracı açılıyor...');

      // When no active file is open
      mockWorkspace.getActiveFile.mockReturnValue(null);
      expect(registeredCallback(true)).toBe(false);
      expect(registeredCallback(false)).toBe(false);
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

      const text = settingTab.containerEl.textContent || '';
      expect(text).toContain('Kitap Eklentisi Ayarları');
      expect(text).toContain('Genel Dosya Ayarları');
      expect(text).toContain('1000Kitap Entegrasyonu');
      expect(text).toContain('Not Şablonu ve Biçimlendirme');
      expect(text).toContain('Kullanılabilir Şablon Değişkenleri');
      expect(text).toContain('{{title}}');
      expect(text).toContain('{{author}}');
      expect(text).toContain('{{publisher}}');
      expect(text).toContain('{{quotes}}');
    });

    it('renders targetFolder and updates settings when input changes', async () => {
      settingTab.display();

      // Locate the input for Hedef Klasör
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

      // Trigger change with a new folder name
      targetFolderInput!.value = 'Yeni Okumalar';
      targetFolderInput!.dispatchEvent(new Event('input'));
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(plugin.settings.targetFolder).toBe('Yeni Okumalar');
      expect(plugin.saveData).toHaveBeenCalledWith(
        expect.objectContaining({ targetFolder: 'Yeni Okumalar' })
      );
      expect(mockData?.targetFolder).toBe('Yeni Okumalar');
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
      expect(fileNameInput?.value).toBe('{{title}} - {{author}}');

      fileNameInput!.value = '{{author}} - {{title}}';
      fileNameInput!.dispatchEvent(new Event('input'));
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(plugin.settings.fileNameTemplate).toBe('{{author}} - {{title}}');
      expect(mockData?.fileNameTemplate).toBe('{{author}} - {{title}}');
    });

    it('conditionally shows and hides maxQuotes slider when includeQuotes toggle is clicked', async () => {
      plugin.settings.includeQuotes = true;
      settingTab.display();
      expect(settingTab.containerEl.textContent).toContain('Maksimum Alıntı Sayısı');

      const toggleInput = settingTab.containerEl.querySelector('input[type="checkbox"]') as HTMLInputElement;
      expect(toggleInput).toBeDefined();
      expect(toggleInput.checked).toBe(true);

      // Click toggle to disable
      toggleInput.click();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(plugin.settings.includeQuotes).toBe(false);
      expect(mockData?.includeQuotes).toBe(false);
      expect(settingTab.containerEl.textContent).not.toContain('Maksimum Alıntı Sayısı');

      // Click toggle again to re-enable
      const reloadedToggle = settingTab.containerEl.querySelector('input[type="checkbox"]') as HTMLInputElement;
      expect(reloadedToggle).toBeDefined();
      reloadedToggle.click();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(plugin.settings.includeQuotes).toBe(true);
      expect(mockData?.includeQuotes).toBe(true);
      expect(settingTab.containerEl.textContent).toContain('Maksimum Alıntı Sayısı');
    });

    it('verifies maxQuotes slider limits [1, 20, 1], default value 5, and updates settings on change', async () => {
      plugin.settings.includeQuotes = true;
      plugin.settings.maxQuotes = 5;
      settingTab.display();

      const sliderInput = settingTab.containerEl.querySelector('input[type="range"]') as HTMLInputElement;
      expect(sliderInput).toBeDefined();

      // Verify slider limits [1, 20, 1] and default value 5
      expect(sliderInput.min).toBe('1');
      expect(sliderInput.max).toBe('20');
      expect(sliderInput.step).toBe('1');
      expect(sliderInput.value).toBe('5');

      // Trigger slider change to new value (e.g. 15)
      sliderInput.value = '15';
      sliderInput.dispatchEvent(new Event('change'));
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(plugin.settings.maxQuotes).toBe(15);
      expect(plugin.saveData).toHaveBeenCalledWith(
        expect.objectContaining({ maxQuotes: 15 })
      );
      expect(mockData?.maxQuotes).toBe(15);
    });

    it('resets noteTemplate to DEFAULT_NOTE_TEMPLATE when reset button is clicked', async () => {
      plugin.settings.noteTemplate = 'Custom template with # My Book';
      settingTab.display();

      const buttons = settingTab.containerEl.querySelectorAll('button');
      let resetButton: HTMLButtonElement | undefined;
      for (const btn of Array.from(buttons)) {
        if (btn.textContent?.includes('Varsayılana Sıfırla')) {
          resetButton = btn as HTMLButtonElement;
        }
      }

      expect(resetButton).toBeDefined();

      // Genuinely click the reset button via DOM method
      resetButton!.click();
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Assert settings updated, saveData called, and Notice issued
      expect(plugin.settings.noteTemplate).toBe(DEFAULT_NOTE_TEMPLATE);
      expect(plugin.saveData).toHaveBeenCalledWith(
        expect.objectContaining({ noteTemplate: DEFAULT_NOTE_TEMPLATE })
      );
      expect(mockData?.noteTemplate).toBe(DEFAULT_NOTE_TEMPLATE);
      expect(lastNotices).toContain('Kitap not şablonu varsayılan ayarlara sıfırlandı.');
    });

    it('renders noteTemplate textarea and updates on input change', async () => {
      settingTab.display();

      const textArea = settingTab.containerEl.querySelector('textarea') as HTMLTextAreaElement;
      expect(textArea).toBeDefined();
      expect(textArea.value).toBe(DEFAULT_NOTE_TEMPLATE);

      textArea.value = '## Yeni Şablon {{title}}';
      textArea.dispatchEvent(new Event('input'));
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(plugin.settings.noteTemplate).toBe('## Yeni Şablon {{title}}');
      expect(mockData?.noteTemplate).toBe('## Yeni Şablon {{title}}');
    });
  });

  describe('Adversarial & Edge Cases (Challenger Verification)', () => {
    it('handles undefined disk data by applying all defaults', async () => {
      mockData = undefined;
      await plugin.loadSettings();
      expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
    });

    it('handles empty object disk data by applying all defaults', async () => {
      mockData = {};
      await plugin.loadSettings();
      expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
    });

    it('preserves valid defaults when partial settings are supplied', async () => {
      mockData = { targetFolder: 'SadeceKlasor' };
      await plugin.loadSettings();
      expect(plugin.settings.targetFolder).toBe('SadeceKlasor');
      expect(plugin.settings.fileNameTemplate).toBe(DEFAULT_SETTINGS.fileNameTemplate);
      expect(plugin.settings.noteTemplate).toBe(DEFAULT_SETTINGS.noteTemplate);
      expect(plugin.settings.includeQuotes).toBe(DEFAULT_SETTINGS.includeQuotes);
      expect(plugin.settings.maxQuotes).toBe(DEFAULT_SETTINGS.maxQuotes);
    });

    it('tolerates unknown extra fields on disk without crashing', async () => {
      mockData = {
        targetFolder: 'Kitaplar',
        extraLegacyKey: 'deprecated_value',
        numericExtra: 42,
      };
      await plugin.loadSettings();
      expect(plugin.settings.targetFolder).toBe('Kitaplar');
      expect((plugin.settings as any).extraLegacyKey).toBe('deprecated_value');
    });

    it('retains settings keys when disk payload is a primitive string', async () => {
      mockData = 'corrupted_string_from_disk';
      await plugin.loadSettings();
      expect(plugin.settings.targetFolder).toBe(DEFAULT_SETTINGS.targetFolder);
      expect(plugin.settings.fileNameTemplate).toBe(DEFAULT_SETTINGS.fileNameTemplate);
      expect(plugin.settings.includeQuotes).toBe(DEFAULT_SETTINGS.includeQuotes);
      expect(plugin.settings.maxQuotes).toBe(DEFAULT_SETTINGS.maxQuotes);
      expect(plugin.settings.noteTemplate).toBe(DEFAULT_SETTINGS.noteTemplate);
    });

    it('retains settings keys when disk payload is primitive number, boolean, or array', async () => {
      mockData = 12345;
      await plugin.loadSettings();
      expect(plugin.settings).toEqual(DEFAULT_SETTINGS);

      mockData = true;
      await plugin.loadSettings();
      expect(plugin.settings).toEqual(DEFAULT_SETTINGS);

      mockData = ['corrupted', 'array'];
      await plugin.loadSettings();
      expect(plugin.settings.targetFolder).toBe(DEFAULT_SETTINGS.targetFolder);
      expect(plugin.settings.maxQuotes).toBe(DEFAULT_SETTINGS.maxQuotes);
    });

    it('prevents prototype pollution from malicious disk JSON', async () => {
      const maliciousPayload = JSON.parse('{"__proto__": {"polluted": true}}');
      mockData = maliciousPayload;
      await plugin.loadSettings();
      expect(({} as any).polluted).toBeUndefined();
    });

    it('sanitizes explicit null field values on disk to defaults without throwing', async () => {
      mockData = {
        targetFolder: null,
        maxQuotes: null,
      };
      await plugin.loadSettings();
      expect(plugin.settings.fileNameTemplate).toBe(DEFAULT_SETTINGS.fileNameTemplate);
      expect(plugin.settings.targetFolder).toBe(DEFAULT_SETTINGS.targetFolder);
      expect(plugin.settings.maxQuotes).toBe(DEFAULT_SETTINGS.maxQuotes);
    });

    it('clamps negative, zero, and out-of-range maxQuotes on disk', async () => {
      mockData = { maxQuotes: -10 };
      await plugin.loadSettings();
      expect(plugin.settings.maxQuotes).toBe(1);

      mockData = { maxQuotes: 0 };
      await plugin.loadSettings();
      expect(plugin.settings.maxQuotes).toBe(5);

      mockData = { maxQuotes: 100 };
      await plugin.loadSettings();
      expect(plugin.settings.maxQuotes).toBe(20);
    });

    it('sanitizes empty fileNameTemplate to default while handling empty noteTemplate without crashing', async () => {
      mockData = { noteTemplate: '', fileNameTemplate: '' };
      await plugin.loadSettings();
      expect(plugin.settings.noteTemplate).toBe('');
      expect(plugin.settings.fileNameTemplate).toBe(DEFAULT_SETTINGS.fileNameTemplate);
    });

    it('sanitizes whitespace-only targetFolder and fileNameTemplate to defaults', async () => {
      mockData = { targetFolder: '   ', fileNameTemplate: '   ' };
      await plugin.loadSettings();
      expect(plugin.settings.targetFolder).toBe(DEFAULT_SETTINGS.targetFolder);
      expect(plugin.settings.fileNameTemplate).toBe(DEFAULT_SETTINGS.fileNameTemplate);
    });

    it('trims leading and trailing whitespace from targetFolder and fileNameTemplate', async () => {
      mockData = { targetFolder: '  Okuma/Listem  ', fileNameTemplate: '  {{title}}  ' };
      await plugin.loadSettings();
      expect(plugin.settings.targetFolder).toBe('Okuma/Listem');
      expect(plugin.settings.fileNameTemplate).toBe('{{title}}');
    });

    it('sanitizes non-numeric or NaN maxQuotes to default 5', async () => {
      mockData = { maxQuotes: 'gecersiz_sayi' };
      await plugin.loadSettings();
      expect(plugin.settings.maxQuotes).toBe(5);
    });

    it('renders settings tab cleanly even with edge-case field values', async () => {
      await plugin.loadSettings();
      plugin.settings.targetFolder = '';
      plugin.settings.fileNameTemplate = '';
      plugin.settings.maxQuotes = -5;
      const settingTab = new KitapSettingTab(mockApp as any, plugin);
      expect(() => settingTab.display()).not.toThrow();
    });

    it('validates checkCallback resilience when workspace or getActiveFile is missing', async () => {
      let registeredCallback: any;
      plugin.addCommand = vi.fn().mockImplementation((cmd: any) => {
        if (cmd.id === 'insert-book-into-active-note') {
          registeredCallback = cmd.checkCallback;
        }
      });

      await plugin.onload();

      // Case: App workspace is undefined
      (plugin.app as any).workspace = undefined;
      expect(registeredCallback(true)).toBe(false);
      expect(registeredCallback(false)).toBe(false);

      // Case: getActiveFile returns undefined
      (plugin.app as any).workspace = { getActiveFile: () => undefined };
      expect(registeredCallback(true)).toBe(false);
      expect(registeredCallback(false)).toBe(false);
    });

    describe('Challenger 1 Stress Harness: Clamping & Mock Events', () => {
      it('stress-tests maxQuotes clamping across extreme values and verifies [1, 20] boundary', async () => {
        const extremeValues: Array<{ label: string; val: any; expected: number }> = [
          { label: 'NaN', val: NaN, expected: 5 },
          { label: '-999', val: -999, expected: 1 },
          { label: '1000', val: 1000, expected: 20 },
          { label: '"invalid"', val: 'invalid', expected: 5 },
          { label: 'null', val: null, expected: 5 },
          { label: 'undefined', val: undefined, expected: 5 },
          { label: 'Infinity', val: Infinity, expected: 20 },
          { label: '-Infinity', val: -Infinity, expected: 1 },
          { label: '0', val: 0, expected: 5 },
          { label: '-0', val: -0, expected: 5 },
          { label: '1', val: 1, expected: 1 },
          { label: '20', val: 20, expected: 20 },
          { label: '0.1', val: 0.1, expected: 1 },
          { label: '20.9', val: 20.9, expected: 20 },
          { label: '"15"', val: '15', expected: 15 },
          { label: '" -500 "', val: ' -500 ', expected: 1 },
          { label: '" 9999 "', val: ' 9999 ', expected: 20 },
          { label: '""', val: '', expected: 5 },
          { label: '"   "', val: '   ', expected: 5 },
          { label: '{}', val: {}, expected: 5 },
          { label: '[]', val: [], expected: 5 },
          { label: '[12]', val: [12], expected: 12 },
          { label: '[1, 2]', val: [1, 2], expected: 5 },
          { label: 'true', val: true, expected: 1 },
          { label: 'false', val: false, expected: 5 },
        ];

        for (const item of extremeValues) {
          mockData = { maxQuotes: item.val };
          await plugin.loadSettings();
          expect(plugin.settings.maxQuotes).toBe(item.expected);
          expect(plugin.settings.maxQuotes).toBeGreaterThanOrEqual(1);
          expect(plugin.settings.maxQuotes).toBeLessThanOrEqual(20);
        }
      });

      it('generates 100 pseudo-random fuzz inputs and verifies maxQuotes always stays in [1, 20]', async () => {
        let seed = 12345;
        const nextRnd = () => {
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          return seed / 0x7fffffff;
        };

        for (let i = 0; i < 100; i++) {
          const type = Math.floor(nextRnd() * 6);
          let testVal: any;
          if (type === 0) testVal = (nextRnd() - 0.5) * 5000;
          else if (type === 1) testVal = String(Math.floor((nextRnd() - 0.5) * 500));
          else if (type === 2) testVal = [null, undefined, NaN, Infinity, -Infinity][Math.floor(nextRnd() * 5)];
          else if (type === 3) testVal = 'str_' + Math.floor(nextRnd() * 1000);
          else if (type === 4) testVal = { anyObj: nextRnd() };
          else testVal = [nextRnd() * 10];

          mockData = { maxQuotes: testVal };
          await plugin.loadSettings();
          expect(plugin.settings.maxQuotes).toBeGreaterThanOrEqual(1);
          expect(plugin.settings.maxQuotes).toBeLessThanOrEqual(20);
          expect(Number.isNaN(plugin.settings.maxQuotes)).toBe(false);
        }
      });

      it('stress-tests mock event dispatching across text, textarea, slider, button, toggle controls', async () => {
        await plugin.loadSettings();
        const tab = new KitapSettingTab(mockApp as any, plugin);
        tab.display();

        // 1. Text input: test 'input' and 'change'
        const folderInput = tab.containerEl.querySelector('input[type="text"]') as HTMLInputElement;
        expect(folderInput).toBeDefined();
        folderInput.value = 'Stress/Klasor';
        folderInput.dispatchEvent(new Event('input'));
        await new Promise((r) => setTimeout(r, 5));
        expect(plugin.settings.targetFolder).toBe('Stress/Klasor');
        expect(mockData?.targetFolder).toBe('Stress/Klasor');

        folderInput.value = 'Change/Klasor';
        folderInput.dispatchEvent(new Event('change'));
        await new Promise((r) => setTimeout(r, 5));
        expect(plugin.settings.targetFolder).toBe('Change/Klasor');

        // 2. Textarea: test 'input' and 'change'
        const textarea = tab.containerEl.querySelector('textarea') as HTMLTextAreaElement;
        expect(textarea).toBeDefined();
        textarea.value = 'Custom Template {{title}}';
        textarea.dispatchEvent(new Event('input'));
        await new Promise((r) => setTimeout(r, 5));
        expect(plugin.settings.noteTemplate).toBe('Custom Template {{title}}');

        // 3. Slider: test 'input' and 'change'
        const slider = tab.containerEl.querySelector('input[type="range"]') as HTMLInputElement;
        expect(slider).toBeDefined();
        slider.value = '17';
        slider.dispatchEvent(new Event('input'));
        await new Promise((r) => setTimeout(r, 5));
        expect(plugin.settings.maxQuotes).toBe(17);

        slider.value = '2';
        slider.dispatchEvent(new Event('change'));
        await new Promise((r) => setTimeout(r, 5));
        expect(plugin.settings.maxQuotes).toBe(2);

        // 4. Toggle: test click on/off
        const toggle = tab.containerEl.querySelector('input[type="checkbox"]') as HTMLInputElement;
        expect(toggle).toBeDefined();
        expect(toggle.checked).toBe(true);

        toggle.click();
        await new Promise((r) => setTimeout(r, 5));
        expect(plugin.settings.includeQuotes).toBe(false);
        expect(tab.containerEl.querySelector('input[type="range"]')).toBeNull();

        // Re-enable toggle
        const toggleReloaded = tab.containerEl.querySelector('input[type="checkbox"]') as HTMLInputElement;
        toggleReloaded.click();
        await new Promise((r) => setTimeout(r, 5));
        expect(plugin.settings.includeQuotes).toBe(true);
        expect(tab.containerEl.querySelector('input[type="range"]')).toBeDefined();

        // 5. Button: test click and Notice
        const buttons = tab.containerEl.querySelectorAll('button');
        const resetBtn = Array.from(buttons).find((b) => b.textContent?.includes('Varsayılana Sıfırla'));
        expect(resetBtn).toBeDefined();

        plugin.settings.noteTemplate = 'Temporary template to reset';
        resetBtn!.click();
        await new Promise((r) => setTimeout(r, 5));
        expect(plugin.settings.noteTemplate).toBe(DEFAULT_NOTE_TEMPLATE);
        expect(lastNotices).toContain('Kitap not şablonu varsayılan ayarlara sıfırlandı.');
      });
    });
  });
});

