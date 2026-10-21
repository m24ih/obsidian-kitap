import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BookMetadata, DEFAULT_SETTINGS, DEFAULT_NOTE_TEMPLATE } from '../src/types';
import { renderBookTemplate } from '../src/templates/engine';
import { buildBookNoteContent } from '../src/templates/noteBuilder';
import {
  migratePropertyMappings,
  PropertyMapper,
  PropertyMappingOption,
} from '../src/settings/propertyMapping';
import { KitapSettingTab } from '../src/settings';
import KitapPlugin from '../src/main';

describe('Reading Status Customization & Migration Suite', () => {
  const sampleBook: BookMetadata = {
    id: '12345',
    url: 'https://www.kitapyurdu.com/kitap/dune/12345.html',
    title: 'Dune',
    author: 'Frank Herbert',
    publisher: 'İthaki Yayınları',
    isbn: '9786053754794',
    coverUrl: 'https://img.kitapyurdu.com/cover.jpg',
  };

  describe('Template Engine Status Placeholders', () => {
    it('resolves {{readingStatus}}, {{okumaDurumu}}, {{status}}, and legacy {{durum}} to book status', () => {
      const bookWithStatus: BookMetadata = {
        ...sampleBook,
        readingStatus: 'TBR',
      };

      const template = `Reading: {{readingStatus}}\nOkuma: {{okumaDurumu}}\nStatus: {{status}}\nDurum: {{durum}}`;
      const rendered = renderBookTemplate(template, bookWithStatus);

      expect(rendered).toContain('Reading: TBR');
      expect(rendered).toContain('Okuma: TBR');
      expect(rendered).toContain('Status: TBR');
      expect(rendered).toContain('Durum: TBR');
    });

    it('falls back to "Okunacak" when readingStatus is undefined', () => {
      const template = `Status: {{readingStatus}}`;
      const rendered = renderBookTemplate(template, sampleBook);

      expect(rendered).toBe('Status: Okunacak');
    });
  });

  describe('Note Builder & YAML Frontmatter Generation', () => {
    it('generates okuma_durumu property with default value in frontmatter', async () => {
      const content = await buildBookNoteContent({
        book: sampleBook,
        settings: {
          ...DEFAULT_SETTINGS,
          defaultReadingStatus: 'Okunacak',
        },
      });

      expect(content).toContain('okuma_durumu: "Okunacak"');
    });

    it('uses custom defaultReadingStatus (e.g. TBR) when configured in settings', async () => {
      const content = await buildBookNoteContent({
        book: { ...sampleBook, readingStatus: 'TBR' },
        settings: {
          ...DEFAULT_SETTINGS,
          defaultReadingStatus: 'TBR',
        },
      });

      expect(content).toContain('okuma_durumu: "TBR"');
    });

    it('applies property remapping on okuma_durumu (e.g. okuma_durumu -> reading_state)', async () => {
      const mappings = migratePropertyMappings().map((m) => {
        if (m.property === 'okuma_durumu') {
          return {
            ...m,
            newProperty: 'reading_state',
            mapping: PropertyMappingOption.Map,
          };
        }
        return m;
      });

      const content = await buildBookNoteContent({
        book: sampleBook,
        settings: {
          ...DEFAULT_SETTINGS,
          propertyMappings: mappings,
          defaultReadingStatus: 'Okunuyor',
        },
      });

      expect(content).toContain('reading_state: "Okunuyor"');
      expect(content).not.toContain('okuma_durumu:');
    });
  });

  describe('Property Mapping Migration from Legacy "durum"', () => {
    it('migrates legacy durum mapping to okuma_durumu while preserving custom remapping', () => {
      const legacyMappings = [
        {
          property: 'durum',
          newProperty: 'my_shelf',
          mapping: PropertyMappingOption.Map,
          locked: false,
          wikilink: false,
        },
      ];

      const migrated = migratePropertyMappings(legacyMappings);
      const okumaDurumuMapping = migrated.find((m) => m.property === 'okuma_durumu');

      expect(okumaDurumuMapping).toBeDefined();
      expect(okumaDurumuMapping?.newProperty).toBe('my_shelf');
      expect(okumaDurumuMapping?.mapping).toBe(PropertyMappingOption.Map);
    });

    it('migrates legacy durum with wikilink: true to okuma_durumu with wikilink: true', () => {
      const legacyMappings = [
        {
          property: 'durum',
          newProperty: '',
          mapping: PropertyMappingOption.Default,
          locked: false,
          wikilink: true,
        },
      ];

      const migrated = migratePropertyMappings(legacyMappings);
      const okumaDurumuMapping = migrated.find((m) => m.property === 'okuma_durumu');

      expect(okumaDurumuMapping).toBeDefined();
      expect(okumaDurumuMapping?.wikilink).toBe(true);
    });
  });

  describe('Settings UI for Reading Status Options & Default Selection', () => {
    let plugin: KitapPlugin;
    let mockApp: any;
    let mockData: any;
    let settingTab: KitapSettingTab;

    beforeEach(async () => {
      mockData = {};
      mockApp = { workspace: { getActiveFile: vi.fn() } };
      plugin = new KitapPlugin(mockApp, {} as any);
      plugin.loadData = vi.fn().mockImplementation(async () => mockData);
      plugin.saveData = vi.fn().mockImplementation(async (d) => {
        mockData = d;
      });
      await plugin.loadSettings();
      settingTab = new KitapSettingTab(mockApp, plugin);
    });

    it('renders reading status options input and dropdown in display()', () => {
      settingTab.display();

      const text = settingTab.containerEl.textContent || '';
      expect(text.toLowerCase()).toContain('okuma durumu ayarları');
      expect(text).toContain('Okuma Durumu Seçenekleri');
      expect(text).toContain('Varsayılan Okuma Durumu');

      const settingItems = settingTab.containerEl.querySelectorAll('.setting-item');
      let optionsInput: HTMLInputElement | undefined;
      let defaultSelect: HTMLSelectElement | undefined;

      for (const item of Array.from(settingItems)) {
        const nameEl = item.querySelector('.setting-item-name');
        if (nameEl?.textContent?.includes('Okuma Durumu Seçenekleri')) {
          optionsInput = item.querySelector('input') as HTMLInputElement;
        }
        if (nameEl?.textContent?.includes('Varsayılan Okuma Durumu')) {
          defaultSelect = item.querySelector('select') as HTMLSelectElement;
        }
      }

      expect(optionsInput).toBeDefined();
      expect(optionsInput?.value).toBe('Okunacak, Okunuyor, Okundu');
      expect(defaultSelect).toBeDefined();
      expect(defaultSelect?.value).toBe('Okunacak');
    });

    it('updates options and dynamically adjusts defaultReadingStatus when options change', async () => {
      settingTab.display();

      const settingItems = settingTab.containerEl.querySelectorAll('.setting-item');
      let optionsInput: HTMLInputElement | undefined;

      for (const item of Array.from(settingItems)) {
        const nameEl = item.querySelector('.setting-item-name');
        if (nameEl?.textContent?.includes('Okuma Durumu Seçenekleri')) {
          optionsInput = item.querySelector('input') as HTMLInputElement;
        }
      }

      // Kullanıcı İngilizce TBR, Reading, Read seçeneklerini tercih ediyor
      const component = (optionsInput as any).component;
      await component.simulateChange('TBR, Currently Reading, Finished, DNF');

      expect(plugin.settings.readingStatusOptions).toEqual([
        'TBR',
        'Currently Reading',
        'Finished',
        'DNF',
      ]);
      // Eski varsayılan 'Okunacak' listede olmadığından ilk seçenek 'TBR' seçilmeli
      expect(plugin.settings.defaultReadingStatus).toBe('TBR');
      expect(mockData.defaultReadingStatus).toBe('TBR');
    });

    it('updates defaultReadingStatus when dropdown selection changes', async () => {
      plugin.settings.readingStatusOptions = ['Okunacak', 'Okunuyor', 'Okundu'];
      settingTab.display();

      const settingItems = settingTab.containerEl.querySelectorAll('.setting-item');
      let defaultSelect: HTMLSelectElement | undefined;

      for (const item of Array.from(settingItems)) {
        const nameEl = item.querySelector('.setting-item-name');
        if (nameEl?.textContent?.includes('Varsayılan Okuma Durumu')) {
          defaultSelect = item.querySelector('select') as HTMLSelectElement;
        }
      }

      const component = (defaultSelect as any).component;
      await component.simulateChange('Okunuyor');

      expect(plugin.settings.defaultReadingStatus).toBe('Okunuyor');
      expect(mockData.defaultReadingStatus).toBe('Okunuyor');
    });

    it('preserves input element in DOM without losing focus when typing in options', async () => {
      settingTab.display();

      const settingItems = settingTab.containerEl.querySelectorAll('.setting-item');
      let optionsInput: HTMLInputElement | undefined;

      for (const item of Array.from(settingItems)) {
        const nameEl = item.querySelector('.setting-item-name');
        if (nameEl?.textContent?.includes('Okuma Durumu Seçenekleri')) {
          optionsInput = item.querySelector('input') as HTMLInputElement;
        }
      }

      expect(optionsInput).toBeDefined();
      const initialInput = optionsInput!;

      // Harf harf yazma simülasyonu
      for (const val of ['T', 'TB', 'TBR', 'TBR, Reading']) {
        const component = (initialInput as any).component;
        await component.simulateChange(val);

        // Input elemanının DOM'dan silinmediğini (re-render edilmediğini) doğrula
        const currentItems = settingTab.containerEl.querySelectorAll('.setting-item');
        let currentInput: HTMLInputElement | undefined;
        for (const item of Array.from(currentItems)) {
          const nameEl = item.querySelector('.setting-item-name');
          if (nameEl?.textContent?.includes('Okuma Durumu Seçenekleri')) {
            currentInput = item.querySelector('input') as HTMLInputElement;
          }
        }

        expect(currentInput).toBe(initialInput);
      }
    });

    it('defensively sanitizes empty options and invalid defaults in loadSettings()', async () => {
      mockData = {
        readingStatusOptions: '   ',
        defaultReadingStatus: '',
      };
      await plugin.loadSettings();

      expect(plugin.settings.readingStatusOptions).toEqual(['Okunacak', 'Okunuyor', 'Okundu']);
      expect(plugin.settings.defaultReadingStatus).toBe('Okunacak');
    });

    it('loads comma-separated string format for readingStatusOptions properly', async () => {
      mockData = {
        readingStatusOptions: 'TBR, Reading, Done',
        defaultReadingStatus: 'TBR',
      };
      await plugin.loadSettings();

      expect(plugin.settings.readingStatusOptions).toEqual(['TBR', 'Reading', 'Done']);
      expect(plugin.settings.defaultReadingStatus).toBe('TBR');
    });
  });
});
