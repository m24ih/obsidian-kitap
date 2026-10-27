import { describe, it, expect } from 'vitest';
import {
  adaptTemplateToPropertyMappings,
  getRemappedPropertyName,
  isPropertyRemoved,
} from '../src/templates/templateAdapter';
import { PropertyMappingData, PropertyMappingOption } from '../src/settings/propertyMapping';
import { buildBookNoteContent } from '../src/templates/noteBuilder';
import { BookMetadata, DEFAULT_SETTINGS, DEFAULT_REACTIVE_TEMPLATE } from '../src/types';

describe('Template Adapter & Property Mapping Synchronization', () => {
  const sampleBook: BookMetadata = {
    id: '12345',
    url: 'https://www.kitapyurdu.com/kitap/vakif/12345.html',
    title: 'Vakıf',
    author: 'Isaac Asimov',
    publisher: 'İthaki Yayınları',
    isbn: '9789752733947',
    pages: 240,
    coverUrl: '[[99-System/Files/BookCovers/Vakıf - Isaac Asimov.jpg]]',
    readingStatus: 'Okunuyor',
    rating: 5,
  };

  describe('adaptTemplateToPropertyMappings Unit Tests', () => {
    it('adapts Dataview dot-accessors and DataviewJS variables according to remap settings', () => {
      const mappings: PropertyMappingData[] = [
        { property: 'kapak', newProperty: 'cover', mapping: PropertyMappingOption.Map },
        { property: 'current_page', newProperty: 'okunan_sayfa', mapping: PropertyMappingOption.Map },
        { property: 'total_pages', newProperty: 'toplam_sayfa', mapping: PropertyMappingOption.Map },
        { property: 'okuma_durumu', newProperty: 'reading_status', mapping: PropertyMappingOption.Map },
        { property: 'baslik', newProperty: 'title', mapping: PropertyMappingOption.Map },
      ];

      const template = `
# \`$= dv.current()?.baslik\`
\`$= dv.current()?.kapak\`
\`\`\`dataviewjs
const p = dv.current();
const current = Number(p?.current_page) || 0;
const total = Number(p?.total_pages) || 1;
const status = p?.okuma_durumu || 'Okunacak';
\`\`\`
      `;

      const adapted = adaptTemplateToPropertyMappings(template, mappings);

      expect(adapted).toContain('dv.current()?.title');
      expect(adapted).toContain('dv.current()?.cover');
      expect(adapted).toContain('p?.okunan_sayfa');
      expect(adapted).toContain('p?.toplam_sayfa');
      expect(adapted).toContain('p?.reading_status');
      expect(adapted).not.toContain('p?.current_page');
    });

    it('adapts bracket notation and mustache tags', () => {
      const mappings: PropertyMappingData[] = [
        { property: 'kapak', newProperty: 'cover', mapping: PropertyMappingOption.Map },
        { property: 'sayfa', newProperty: 'page_count', mapping: PropertyMappingOption.Map },
      ];

      const template = `Kapak: \`$= dv.current()['kapak']\`, Sayfa: {{sayfa}}, <% sayfa %>`;
      const adapted = adaptTemplateToPropertyMappings(template, mappings);

      expect(adapted).toContain("dv.current()['cover']");
      expect(adapted).toContain('{{page_count}}');
      expect(adapted).toContain('<% page_count %>');
    });

    it('returns unmodified template if no mappings or empty', () => {
      const template = `dv.current().kapak`;
      expect(adaptTemplateToPropertyMappings(template, [])).toBe(template);
    });

    it('correctly reports remapped names and removed properties', () => {
      const mappings: PropertyMappingData[] = [
        { property: 'kapak', newProperty: 'cover', mapping: PropertyMappingOption.Map },
        { property: 'fiyat', newProperty: '', mapping: PropertyMappingOption.Remove },
      ];

      expect(getRemappedPropertyName('kapak', mappings)).toBe('cover');
      expect(getRemappedPropertyName('baslik', mappings)).toBe('baslik');
      expect(isPropertyRemoved('fiyat', mappings)).toBe(true);
      expect(isPropertyRemoved('kapak', mappings)).toBe(false);
    });
  });

  describe('End-to-End Note Generation with Custom YAML mappings', () => {
    it('produces synced YAML frontmatter and template body when user customizes property mappings', async () => {
      const customMappings: PropertyMappingData[] = [
        ...DEFAULT_SETTINGS.propertyMappings.filter(
          (m) => !['kapak', 'okunan_sayfa', 'sayfa', 'okuma_durumu', 'baslik'].includes(m.property)
        ),
        { property: 'baslik', newProperty: 'title', mapping: PropertyMappingOption.Map, locked: false, wikilink: false },
        { property: 'kapak', newProperty: 'cover', mapping: PropertyMappingOption.Map, locked: false, wikilink: false },
        { property: 'okunan_sayfa', newProperty: 'current_page', mapping: PropertyMappingOption.Map, locked: false, wikilink: false },
        { property: 'sayfa', newProperty: 'total_pages', mapping: PropertyMappingOption.Map, locked: false, wikilink: false },
        { property: 'okuma_durumu', newProperty: 'status', mapping: PropertyMappingOption.Map, locked: false, wikilink: false },
      ];

      const settings = {
        ...DEFAULT_SETTINGS,
        templateMode: 'reactive' as const,
        propertyMappings: customMappings,
        useDefaultFrontMatter: true,
      };

      const note = await buildBookNoteContent({
        book: sampleBook,
        settings,
      });

      // 1. YAML frontmatter remapped kontrolleri
      expect(note).toContain('title: "Vakıf"');
      expect(note).toContain('cover: "[[99-System/Files/BookCovers/Vakıf - Isaac Asimov.jpg]]"');
      expect(note).toContain('current_page: 0');
      expect(note).toContain('total_pages: 240');
      expect(note).toContain('status: "Okunuyor"');

      // 2. Şablon gövdesi remapped kontrolleri (Dataview etiketleri senkronize)
      expect(note).toContain('p?.current_page');
      expect(note).toContain('p?.total_pages');
      expect(note).toContain('p?.status');
      expect(note).toContain('dv.current()?.cover');
      expect(note).toContain('dv.current()?.title');
    });
  });
});
