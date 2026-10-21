import { PropertyMappingData, PropertyMappingOption } from '../settings/propertyMapping';

/**
 * Belirli bir orijinal özelliğin yeni eşleme adını döndürür.
 * Eşleme yapılmamışsa orijinal adı döndürür.
 */
export function getRemappedPropertyName(
  originalProp: string,
  mappings?: PropertyMappingData[]
): string {
  if (!mappings || mappings.length === 0) return originalProp;
  const found = mappings.find((m) => m.property === originalProp);
  if (found && found.mapping === PropertyMappingOption.Map && found.newProperty?.trim()) {
    return found.newProperty.trim();
  }
  return originalProp;
}

/**
 * Belirli bir özelliğin kullanıcı tarafından silinip silinmediğini (Remove) kontrol eder.
 */
export function isPropertyRemoved(
  originalProp: string,
  mappings?: PropertyMappingData[]
): boolean {
  if (!mappings || mappings.length === 0) return false;
  const found = mappings.find((m) => m.property === originalProp);
  return found?.mapping === PropertyMappingOption.Remove;
}

/**
 * Regex özel karakterlerini kaçış karakteriyle korur.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Kullanıcının YAML özellik eşleme (Property Mapping) ayarlarına göre
 * şablon gövdesindeki (DataviewJS, inline Dataview ve yer tutucu) etiketleri günceller.
 * 
 * Böylece kullanıcı YAML'de 'kapak' -> 'cover' veya 'current_page' -> 'okunan_sayfa'
 * yaptığında şablon içerisindeki Dataview ve ilerleme çubuğu kodları otomatik olarak senkronize kalır.
 */
export function adaptTemplateToPropertyMappings(
  templateContent: string,
  mappings?: PropertyMappingData[]
): string {
  if (!templateContent || !mappings || mappings.length === 0) {
    return templateContent;
  }

  let adapted = templateContent;

  for (const m of mappings) {
    const orig = m.property;

    if (m.mapping === PropertyMappingOption.Map && m.newProperty?.trim()) {
      const target = m.newProperty.trim();
      if (orig === target) continue;

      const escapedOrig = escapeRegex(orig);

      // 1. Dataview nesne erişimleri: dv.current().etiket veya dv.current()?.etiket
      adapted = adapted.replace(
        new RegExp(`(dv\\.current\\(\\)\\??\\.)(${escapedOrig})\\b`, 'g'),
        `$1${target}`
      );

      // 2. Kısaltılmış değişken erişimleri: p?.etiket veya p.etiket (DataviewJS blokları için)
      adapted = adapted.replace(
        new RegExp(`(\\bp\\??\\.)(${escapedOrig})\\b`, 'g'),
        `$1${target}`
      );

      // 3. Köşeli ayraç erişimleri: dv.current()['etiket'] veya p?.['etiket']
      adapted = adapted.replace(
        new RegExp(`(dv\\.current\\(\\)|\\bp)(\\??\\[['"])${escapedOrig}(['"\\]])`, 'g'),
        `$1$2${target}$3`
      );

      // 4. Standart {{etiket}} şablon yer tutucuları
      adapted = adapted.replace(
        new RegExp(`(\\{\\{\\s*)${escapedOrig}(\\s*\\}\\})`, 'g'),
        `$1${target}$2`
      );

      // 5. Basit <% etiket %> yer tutucuları
      adapted = adapted.replace(
        new RegExp(`(<%\\s*)${escapedOrig}(\\s*%>)`, 'g'),
        `$1${target}$2`
      );
    }
  }

  return adapted;
}
