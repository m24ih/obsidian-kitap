/**
 * obsidian-kitap - YAML Property Mapping Model & Logic
 * Allows remapping, removing, and formatting properties as wikilinks ([[value]])
 */

export enum PropertyMappingOption {
  Default = 'default',
  Map = 'remap',
  Remove = 'remove',
}

export const PROPERTY_MAPPING_OPTIONS: PropertyMappingOption[] = [
  PropertyMappingOption.Default,
  PropertyMappingOption.Map,
  PropertyMappingOption.Remove,
];

export interface PropertyMappingData {
  property: string;
  newProperty: string;
  mapping: PropertyMappingOption;
  locked?: boolean;
  wikilink?: boolean;
}

/**
 * Kitap için varsayılan YAML frontmatter alanları
 */
export const DEFAULT_BOOK_PROPERTY_MAPPINGS: PropertyMappingData[] = [
  { property: 'baslik', newProperty: '', mapping: PropertyMappingOption.Default, locked: false, wikilink: false },
  { property: 'yazar', newProperty: '', mapping: PropertyMappingOption.Default, locked: false, wikilink: false },
  { property: 'yayinevi', newProperty: '', mapping: PropertyMappingOption.Default, locked: false, wikilink: false },
  { property: 'cevirmen', newProperty: '', mapping: PropertyMappingOption.Default, locked: false, wikilink: false },
  { property: 'isbn', newProperty: '', mapping: PropertyMappingOption.Default, locked: false, wikilink: false },
  { property: 'sayfa', newProperty: '', mapping: PropertyMappingOption.Default, locked: false, wikilink: false },
  { property: 'yayin_tarihi', newProperty: '', mapping: PropertyMappingOption.Default, locked: false, wikilink: false },
  { property: 'puan_kitapyurdu', newProperty: '', mapping: PropertyMappingOption.Default, locked: false, wikilink: false },
  { property: 'kapak', newProperty: '', mapping: PropertyMappingOption.Default, locked: false, wikilink: false },
  { property: 'url', newProperty: '', mapping: PropertyMappingOption.Default, locked: false, wikilink: false },
  { property: 'durum', newProperty: '', mapping: PropertyMappingOption.Default, locked: false, wikilink: false },
  { property: 'okunma_tarihi', newProperty: '', mapping: PropertyMappingOption.Default, locked: false, wikilink: false },
  { property: 'kisisel_puan', newProperty: '', mapping: PropertyMappingOption.Default, locked: false, wikilink: false },
];

/**
 * Kullanıcı ayarlarında eksik olabilecek yeni alanları varsayılanlarla birleştirir.
 */
export function migratePropertyMappings(
  loadedMappings?: PropertyMappingData[]
): PropertyMappingData[] {
  if (!loadedMappings || !Array.isArray(loadedMappings) || loadedMappings.length === 0) {
    return structuredClone(DEFAULT_BOOK_PROPERTY_MAPPINGS);
  }

  const migrated: PropertyMappingData[] = [];
  const loadedMap = new Map(loadedMappings.map((m) => [m.property, m]));

  for (const def of DEFAULT_BOOK_PROPERTY_MAPPINGS) {
    const existing = loadedMap.get(def.property);
    if (!existing) {
      migrated.push({ ...def });
    } else {
      migrated.push({
        property: def.property,
        newProperty: typeof existing.newProperty === 'string' ? existing.newProperty : '',
        mapping: PROPERTY_MAPPING_OPTIONS.includes(existing.mapping)
          ? existing.mapping
          : PropertyMappingOption.Default,
        locked: def.locked ?? false,
        wikilink: Boolean(existing.wikilink),
      });
    }
  }

  return migrated;
}

/**
 * Özellik eşleme listesini kurallara göre doğrular.
 */
export function validatePropertyMappings(
  properties: PropertyMappingData[]
): { res: boolean; err?: string } {
  for (const prop of properties) {
    if (prop.mapping === PropertyMappingOption.Map) {
      const trimmedNew = (prop.newProperty || '').trim();
      if (!trimmedNew) {
        return {
          res: false,
          err: `"${prop.property}" için yeni alan adı boş bırakılamaz.`,
        };
      }
      if (!/^[a-zA-Z0-9_\-]+$/.test(trimmedNew)) {
        return {
          res: false,
          err: `"${trimmedNew}" adı geçersiz. Yalnızca harf, rakam, alt çizgi ve tire içerebilir.`,
        };
      }
    }
  }

  // Yeniden adlandırılan alanlar arasında isim çakışması kontrolü
  const mappedProps = properties.filter((p) => p.mapping === PropertyMappingOption.Map);
  const targetNames = mappedProps.map((p) => p.newProperty.trim());
  for (let i = 0; i < targetNames.length; i++) {
    for (let j = i + 1; j < targetNames.length; j++) {
      if (targetNames[i] === targetNames[j]) {
        return {
          res: false,
          err: `Birden fazla alan aynı yeni ada ("${targetNames[i]}") eşlenemez.`,
        };
      }
    }
  }

  // Yeniden adlandırılan alanın mevcut aktif bir orijinal alanla çakışması kontrolü
  for (const mapped of mappedProps) {
    const collision = properties.find(
      (p) =>
        p.property === mapped.newProperty.trim() &&
        p.property !== mapped.property &&
        p.mapping !== PropertyMappingOption.Remove
    );
    if (collision) {
      return {
        res: false,
        err: `"${mapped.newProperty}" adı zaten aktif olan "${collision.property}" alanı ile çakışıyor.`,
      };
    }
  }

  return { res: true };
}

/**
 * Metaveri nesnesine kullanıcı eşleme kurallarını uygular.
 */
export class PropertyMapper {
  private mappings: PropertyMappingData[];

  constructor(mappings?: PropertyMappingData[]) {
    this.mappings = mappings && mappings.length > 0
      ? mappings
      : DEFAULT_BOOK_PROPERTY_MAPPINGS;
  }

  convertObject(obj: Record<string, unknown>): Record<string, unknown> {
    const mappingByProp = new Map(this.mappings.map((m) => [m.property, m]));
    const result: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(obj)) {
      const mapping = mappingByProp.get(key);

      if (!mapping) {
        result[key] = val;
        continue;
      }

      if (mapping.mapping === PropertyMappingOption.Remove) {
        continue;
      }

      let finalValue = val;
      if (mapping.wikilink) {
        if (typeof val === 'string' && val.trim().length > 0) {
          if (!val.startsWith('[[') || !val.endsWith(']]')) {
            finalValue = `[[${val.trim()}]]`;
          }
        } else if (Array.isArray(val)) {
          finalValue = val.map((item) =>
            typeof item === 'string' && item.trim().length > 0 && (!item.startsWith('[[') || !item.endsWith(']]'))
              ? `[[${item.trim()}]]`
              : item
          );
        }
      }

      if (mapping.mapping === PropertyMappingOption.Map && mapping.newProperty.trim()) {
        result[mapping.newProperty.trim()] = finalValue;
      } else {
        result[key] = finalValue;
      }
    }

    return result;
  }
}
