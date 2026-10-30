import { describe, it, expect } from 'vitest';
import {
  PropertyMappingOption,
  PropertyMapper,
  DEFAULT_BOOK_PROPERTY_MAPPINGS,
  migratePropertyMappings,
  validatePropertyMappings,
  PropertyMappingData,
} from '../src/settings/propertyMapping';
import { buildBookNoteContent } from '../src/templates/noteBuilder';
import { BookMetadata, DEFAULT_SETTINGS } from '../src/types';
import { hasTemplaterPlugin, useTemplaterPluginInFile } from '../src/utils/templater';
import { TFile } from 'obsidian';

describe('YAML Property Mapping & Templater Integration', () => {
  const sampleBook: BookMetadata = {
    id: '375312',
    url: 'https://www.kitapyurdu.com/kitap/dune/375312.html',
    title: 'Dune',
    author: 'Frank Herbert',
    publisher: 'İthaki Yayınları',
    translator: 'Dost Körpe',
    isbn: '9786053754794',
    pages: 712,
    publishDate: '2021-09-08',
    coverUrl: 'https://img.kitapyurdu.com/dune.jpg',
    description: 'Bilimkurgu klasiği.',
    rating: 5,
    ratingCount: 819,
  };

  describe('PropertyMapper Unit Tests', () => {
    it('applies default mapping without changing property names', () => {
      const mapper = new PropertyMapper(DEFAULT_BOOK_PROPERTY_MAPPINGS);
      const input = {
        baslik: 'Dune',
        yazar: 'Frank Herbert',
      };
      const mapped = mapper.convertObject(input);
      expect(mapped).toEqual({
        baslik: 'Dune',
        yazar: 'Frank Herbert',
      });
    });

    it('remaps property names correctly', () => {
      const customMappings: PropertyMappingData[] = [
        { property: 'baslik', newProperty: 'title', mapping: PropertyMappingOption.Map },
        { property: 'yazar', newProperty: 'author', mapping: PropertyMappingOption.Map },
      ];
      const mapper = new PropertyMapper(customMappings);
      const input = {
        baslik: 'Dune',
        yazar: 'Frank Herbert',
      };
      const mapped = mapper.convertObject(input);
      expect(mapped).toEqual({
        title: 'Dune',
        author: 'Frank Herbert',
      });
    });

    it('removes properties marked with PropertyMappingOption.Remove', () => {
      const customMappings: PropertyMappingData[] = [
        { property: 'baslik', newProperty: '', mapping: PropertyMappingOption.Default },
        { property: 'cevirmen', newProperty: '', mapping: PropertyMappingOption.Remove },
      ];
      const mapper = new PropertyMapper(customMappings);
      const input = {
        baslik: 'Dune',
        cevirmen: 'Dost Körpe',
      };
      const mapped = mapper.convertObject(input);
      expect(mapped).toHaveProperty('baslik', 'Dune');
      expect(mapped).not.toHaveProperty('cevirmen');
    });

    it('converts property values to wikilinks when wikilink is true', () => {
      const customMappings: PropertyMappingData[] = [
        { property: 'yazar', newProperty: 'author', mapping: PropertyMappingOption.Map, wikilink: true },
        { property: 'yayinevi', newProperty: '', mapping: PropertyMappingOption.Default, wikilink: true },
        { property: 'cevirmen', newProperty: '', mapping: PropertyMappingOption.Default, wikilink: true },
      ];
      const mapper = new PropertyMapper(customMappings);
      const input = {
        yazar: 'Frank Herbert',
        yayinevi: 'İthaki Yayınları',
        cevirmen: '', // Boş dize wikilink [[]] olmamalı
      };
      const mapped = mapper.convertObject(input);
      expect(mapped.author).toBe('[[Frank Herbert]]');
      expect(mapped.yayinevi).toBe('[[İthaki Yayınları]]');
      expect(mapped.cevirmen).toBe('');
    });

    it('does not double-wrap values that are already wikilinks', () => {
      const customMappings: PropertyMappingData[] = [
        { property: 'yazar', newProperty: '', mapping: PropertyMappingOption.Default, wikilink: true },
      ];
      const mapper = new PropertyMapper(customMappings);
      const input = { yazar: '[[Frank Herbert]]' };
      const mapped = mapper.convertObject(input);
      expect(mapped.yazar).toBe('[[Frank Herbert]]');
    });
  });

  describe('Validation & Migration Tests', () => {
    it('validates correct property mappings successfully', () => {
      const valid: PropertyMappingData[] = [
        { property: 'baslik', newProperty: 'title', mapping: PropertyMappingOption.Map },
        { property: 'yazar', newProperty: 'author', mapping: PropertyMappingOption.Map },
      ];
      expect(validatePropertyMappings(valid).res).toBe(true);
    });

    it('rejects empty newProperty when mapping is remap', () => {
      const invalid: PropertyMappingData[] = [
        { property: 'baslik', newProperty: '  ', mapping: PropertyMappingOption.Map },
      ];
      const res = validatePropertyMappings(invalid);
      expect(res.res).toBe(false);
      expect(res.err).toContain('boş bırakılamaz');
    });

    it('rejects invalid characters in newProperty', () => {
      const invalid: PropertyMappingData[] = [
        { property: 'baslik', newProperty: 'my title!', mapping: PropertyMappingOption.Map },
      ];
      const res = validatePropertyMappings(invalid);
      expect(res.res).toBe(false);
      expect(res.err).toContain('geçersiz');
    });

    it('rejects duplicate newProperty mappings', () => {
      const invalid: PropertyMappingData[] = [
        { property: 'baslik', newProperty: 'book_name', mapping: PropertyMappingOption.Map },
        { property: 'yazar', newProperty: 'book_name', mapping: PropertyMappingOption.Map },
      ];
      const res = validatePropertyMappings(invalid);
      expect(res.res).toBe(false);
      expect(res.err).toContain('Birden fazla alan aynı yeni ada');
    });

    it('rejects newProperty colliding with existing active property', () => {
      const invalid: PropertyMappingData[] = [
        { property: 'baslik', newProperty: 'yazar', mapping: PropertyMappingOption.Map },
        { property: 'yazar', newProperty: '', mapping: PropertyMappingOption.Default },
      ];
      const res = validatePropertyMappings(invalid);
      expect(res.res).toBe(false);
      expect(res.err).toContain('çakışıyor');
    });

    it('migrates older user mappings by adding new default keys while preserving existing customizations', () => {
      const partialUserMappings: PropertyMappingData[] = [
        { property: 'yazar', newProperty: 'author', mapping: PropertyMappingOption.Map, wikilink: true },
      ];
      const migrated = migratePropertyMappings(partialUserMappings);

      expect(migrated.length).toBe(DEFAULT_BOOK_PROPERTY_MAPPINGS.length);
      const migratedAuthor = migrated.find((m) => m.property === 'yazar');
      expect(migratedAuthor?.newProperty).toBe('author');
      expect(migratedAuthor?.mapping).toBe(PropertyMappingOption.Map);
      expect(migratedAuthor?.wikilink).toBe(true);

      const migratedBaslik = migrated.find((m) => m.property === 'baslik');
      expect(migratedBaslik?.mapping).toBe(PropertyMappingOption.Default);
    });
  });

  describe('buildBookNoteContent Integration Tests', () => {
    it('generates note with remapped YAML properties and wikilinks', async () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        propertyMappings: [
          { property: 'baslik', newProperty: 'title', mapping: PropertyMappingOption.Map, locked: false, wikilink: false },
          { property: 'yazar', newProperty: 'author', mapping: PropertyMappingOption.Map, locked: false, wikilink: true },
          { property: 'yayinevi', newProperty: '', mapping: PropertyMappingOption.Default, locked: false, wikilink: false },
          { property: 'cevirmen', newProperty: '', mapping: PropertyMappingOption.Remove, locked: false, wikilink: false },
        ],
      };

      const result = await buildBookNoteContent({
        book: sampleBook,
        settings,
      });

      expect(result).toContain('title: "Dune"');
      expect(result).toContain('author: "[[Frank Herbert]]"');
      expect(result).not.toContain('cevirmen:');
      expect(result).toContain('# Dune');
      expect(result).toContain('okunan_sayfa: 0');
      expect(result).toContain('sayfa: 712');
      expect(result).not.toContain('toplam_sayfa:');
    });

    it('injects Templater variable declaration when enableTemplaterIntegration is true', async () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        enableTemplaterIntegration: true,
        templateMode: 'custom' as const,
        noteTemplate: '---\ntip: kitap\n---\n# <% book.title %>',
      };

      const result = await buildBookNoteContent({
        book: sampleBook,
        settings,
      });

      expect(result).toContain('<%* const book = {"id":"375312"');
    });

    it('does not inject Templater variable declaration into YAML frontmatter when template has no <% tags', async () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        enableTemplaterIntegration: true,
        templateMode: 'reactive' as const,
      };

      const result = await buildBookNoteContent({
        book: sampleBook,
        settings,
      });

      expect(result).not.toContain('<%* const book =');
      const frontmatterBlock = result.split('\n---')[0];
      expect(frontmatterBlock.startsWith('---\n')).toBe(true);
      expect(frontmatterBlock).not.toContain('<%');
    });

    it('reads template file from mock vault when templateFile is set', async () => {
      const mockVault = {
        getAbstractFileByPath: (path: string) => {
          if (path === 'Templates/CustomBook.md') {
            return Object.assign(new TFile(), { path: 'Templates/CustomBook.md' });
          }
          return null;
        },
        read: async () => `---
custom_tag: test_tag
---
# {{title}} - Ozel Sablon
Yazar: {{author}}`,
      };

      const mockApp: any = {
        vault: mockVault,
      };

      const settings = {
        ...DEFAULT_SETTINGS,
        templateFile: 'Templates/CustomBook.md',
      };

      const result = await buildBookNoteContent({
        book: sampleBook,
        settings,
        app: mockApp,
      });

      expect(result).toContain('custom_tag: "test_tag"');
      expect(result).toContain('# Dune - Ozel Sablon');
      expect(result).toContain('Yazar: Frank Herbert');
    });
  });

  describe('Templater Utility Tests', () => {
    it('detects Templater plugin presence correctly', () => {
      const appWithTemplater: any = {
        plugins: {
          plugins: {
            'templater-obsidian': { templater: {} },
          },
        },
      };
      const appWithoutTemplater: any = {
        plugins: {
          plugins: {},
        },
      };

      expect(hasTemplaterPlugin(appWithTemplater)).toBe(true);
      expect(hasTemplaterPlugin(appWithoutTemplater)).toBe(false);
    });

    it('executes overwrite_file_commands when trigger_on_file_creation is not true', async () => {
      let executed = false;
      const app: any = {
        plugins: {
          plugins: {
            'templater-obsidian': {
              settings: { trigger_on_file_creation: false },
              templater: {
                overwrite_file_commands: async (_file: TFile) => {
                  executed = true;
                },
              },
            },
          },
        },
      };

      const dummyFile = new TFile();
      await useTemplaterPluginInFile(app, dummyFile);
      expect(executed).toBe(true);
    });

    it('does not execute overwrite_file_commands if trigger_on_file_creation is true to avoid double execution', async () => {
      let executed = false;
      const app: any = {
        plugins: {
          plugins: {
            'templater-obsidian': {
              settings: { trigger_on_file_creation: true },
              templater: {
                overwrite_file_commands: async (_file: TFile) => {
                  executed = true;
                },
              },
            },
          },
        },
      };

      const dummyFile = new TFile();
      await useTemplaterPluginInFile(app, dummyFile);
      expect(executed).toBe(false);
    });
  });

  describe('PropertyMappingComponent Focus & UI Stability Tests', () => {
    it('does not re-render the DOM or recreate inputEl when typing', async () => {
      const { PropertyMappingComponent } = await import('../src/settings/propertyMappingComponent');

      const container = document.createElement('div');
      const initialMappings: PropertyMappingData[] = [
        { property: 'kapak', newProperty: '', mapping: PropertyMappingOption.Map, locked: false, wikilink: false },
      ];

      let savedData: PropertyMappingData[] = [];
      const comp = new PropertyMappingComponent(container, {
        mappings: initialMappings,
        save: async (data) => {
          savedData = data;
        },
      });

      comp.onload();

      const inputEl = container.querySelector('.kitap-property-mapping-input') as HTMLInputElement;
      expect(inputEl).not.toBeNull();

      // Simulate typing "cover" letter by letter
      for (const char of ['c', 'co', 'cov', 'cove', 'cover']) {
        inputEl.value = char;
        inputEl.dispatchEvent(new Event('input'));

        // Verify the inputEl is still the exact same element in the DOM tree
        const currentInput = container.querySelector('.kitap-property-mapping-input') as HTMLInputElement;
        expect(currentInput).toBe(inputEl);
      }

      // Save and verify state
      const saveBtn = container.querySelector('.kitap-property-mappings-save-button') as HTMLButtonElement;
      saveBtn.click();

      expect(savedData.length).toBe(1);
      expect(savedData[0].newProperty).toBe('cover');
    });
  });
});
