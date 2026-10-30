import { BookMetadata } from '../types';
import { sanitizeFileName } from '../utils/sanitizer';
import { PropertyMappingData, PropertyMappingOption } from '../settings/propertyMapping';
import { adaptTemplateToPropertyMappings } from './templateAdapter';

export { sanitizeFileName, adaptTemplateToPropertyMappings };

/**
 * Dataview inline JS (`$= ...`) satırlarında tırnak içine gömülen değerlerdeki
 * çakışan tırnak karakterlerini kaçırır. Örn: `'[[Kitaplar/Kapaklar/Ay'a Yolculuk.jpg]]'`
 * gibi bir değer Dataview tarafından `SyntaxError: Unexpected identifier 'a'` ile patlar;
 * bu yardımcı fonksiyon değeri `Ay\'a Yolculuk` biçimine dönüştürür.
 */
function escapeInlineJsQuotes(value: string, quote: "'" | '"'): string {
  return quote === "'" ? value.replace(/'/g, "\\'") : value.replace(/"/g, '\\"');
}

/**
 * Tek bir satırdaki `{{degisken}}` yer tutucularını, tırnak bağlamına duyarlı biçimde çözer.
 * Yer tutucu tek tırnak içindeyse (`'{{x}}'`) tek tırnaklar, çift tırnak içindeyse
 * (`"{{x}}"`) çift tırnaklar kaçırılır. Böylece Dataview inline JS sözdizimi bozulmaz.
 */
function interpolateInlineJsLine(
  line: string,
  replacements: Record<string, string>
): string {
  return line.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (fullMatch: string, key: string, offset: number, whole: string) => {
      if (!Object.prototype.hasOwnProperty.call(replacements, key)) return fullMatch;
      const value = replacements[key] ?? '';
      const prevChar = offset > 0 ? whole.charAt(offset - 1) : '';
      const nextChar = whole.charAt(offset + fullMatch.length);
      if (prevChar === "'" && nextChar === "'") return escapeInlineJsQuotes(value, "'");
      if (prevChar === '"' && nextChar === '"') return escapeInlineJsQuotes(value, '"');
      return value;
    }
  );
}

/**
 * Kitap şablonundaki tüm `{{degisken}}` yer tutucularını BookMetadata değerleriyle doldurur.
 * Eksik veya undefined olan opsiyonel alanlar "undefined" veya "null" yerine boş dize ("") olarak işlenir.
 * Eğer özellik eşlemeleri (mappings) sağlanırsa, şablon gövdesi bu eşlemelere göre otomatik uyarlanır.
 */
export function renderBookTemplate(
  template: string,
  data: BookMetadata,
  mappings?: PropertyMappingData[]
): string {
  if (!template) return '';

  // Şablon gövdesini kullanıcının eşlemelerine göre adapte et
  let processedTemplate = mappings && mappings.length > 0
    ? adaptTemplateToPropertyMappings(template, mappings)
    : template;

  const strValue = (val: unknown): string => {
    if (val === undefined || val === null) return '';
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    return '';
  };

  const rawCover = strValue(data.coverUrl);
  const isWikilink = rawCover.startsWith('[[') && rawCover.endsWith(']]');
  const innerCoverPath = isWikilink ? rawCover.slice(2, -2).trim() : rawCover;

  if (isWikilink && innerCoverPath) {
    // 1. ![[ {{coverUrl}} ]] veya ![[ {{coverUrl}} | 200 ]] wikilink embed kalıpları
    processedTemplate = processedTemplate.replace(
      /!\[\[\s*\{\{\s*coverUrl\s*\}\}\s*(?:\|([^\]]+))?\]\]/g,
      (_match: string, extra?: string) => (extra ? `![[${innerCoverPath}|${extra.trim()}]]` : `![[${innerCoverPath}]]`)
    );

    // 2. ![Kapak|200]({{coverUrl}}) veya ![alt]({{coverUrl}}) standart markdown imaj kalıpları
    // Yerel wikilink durumunda Obsidian'ın doğal ![[resim.jpg|200]] formatına dönüştürülür
    processedTemplate = processedTemplate.replace(
      /!\[(.*?)\]\(\{\{\s*coverUrl\s*\}\}\)/g,
      (_match: string, alt: string) => {
        const trimmedAlt = typeof alt === 'string' ? alt.trim() : '';
        const sizeMatch = trimmedAlt.match(/(?:^|\|)(\d+(?:x\d+)?)$/);
        if (sizeMatch && sizeMatch[1]) {
          return `![[${innerCoverPath}|${sizeMatch[1]}]]`;
        }
        return `![[${innerCoverPath}]]`;
      }
    );
  }

  // Eski şablonlarda puan_kitapyurdu: yazılmışsa bunu sağlayıcı bağımsız puan: alanına çevir
  processedTemplate = processedTemplate.replace(/\bpuan_kitapyurdu\s*:/g, 'puan:');

  const replacements: Record<string, string> = {
    // Türkçe temel alanlar
    tip: 'kitap',
    baslik: strValue(data.title),
    yazar: strValue(data.author),
    yayinevi: strValue(data.publisher),
    cevirmen: strValue(data.translator),
    isbn: strValue(data.isbn),
    sayfa: data.pages !== undefined && data.pages !== null ? String(data.pages) : '',
    okunan_sayfa: '0',
    toplam_sayfa: data.pages !== undefined && data.pages !== null ? String(data.pages) : '',
    yayin_tarihi: strValue(data.publishDate),
    yayinTarihi: strValue(data.publishDate),
    kapak: rawCover,
    puan: data.rating !== undefined && data.rating !== null ? String(data.rating) : '',
    puan_kitapyurdu: data.rating !== undefined && data.rating !== null ? String(data.rating) : '',
    puan_dr: data.rating !== undefined && data.rating !== null ? String(data.rating) : '',

    // İngilizce uyumluluk takma adları
    title: strValue(data.title),
    author: strValue(data.author),
    publisher: strValue(data.publisher),
    translator: strValue(data.translator),
    pages: data.pages !== undefined && data.pages !== null ? String(data.pages) : '',
    current_page: '0',
    total_pages: data.pages !== undefined && data.pages !== null ? String(data.pages) : '',
    publishDate: strValue(data.publishDate),
    coverUrl: rawCover,
    coverPath: innerCoverPath,
    rating: data.rating !== undefined && data.rating !== null ? String(data.rating) : '',
    ratingCount:
      data.ratingCount !== undefined && data.ratingCount !== null
        ? String(data.ratingCount)
        : '',
    description: strValue(data.description),
    aciklama: strValue(data.description),
    url: strValue(data.url),
    readingStatus: strValue(data.readingStatus || 'Okunacak'),
    status: strValue(data.readingStatus || 'Okunacak'),
    okumaDurumu: strValue(data.readingStatus || 'Okunacak'),
    okuma_durumu: strValue(data.readingStatus || 'Okunacak'),
    durum: strValue(data.readingStatus || 'Okunacak'),

    // Yeni bibliyografik alanlar
    price: strValue(data.price),
    fiyat: strValue(data.price),
    format: strValue(data.format),
    ciltTipi: strValue(data.format),
    binding: strValue(data.format),
    genres: Array.isArray(data.genres) ? data.genres.join(', ') : strValue(data.genres),
    tur: Array.isArray(data.genres) ? data.genres.join(', ') : strValue(data.genres),
    category: Array.isArray(data.genres) ? data.genres.join(', ') : strValue(data.genres),
    genresList:
      Array.isArray(data.genres) && data.genres.length > 0
        ? data.genres.map((g) => `  - ${JSON.stringify(g)}`).join('\n')
        : '  - ""',
    originalTitle: strValue(data.originalTitle),
    orijinalAdi: strValue(data.originalTitle),
    orijinalBaslik: strValue(data.originalTitle),
    language: strValue(data.language),
    dil: strValue(data.language),

    // Sağlayıcı bilgisi
    provider: strValue(data.provider),
    saglayici: strValue(data.provider),

    // media-db ve şablon uyumluluk takma adları
    image: rawCover,

    // Eski şablonlarla geriye dönük uyumluluk için güvenli boş değerler
    binkitapRating: '',
    binkitapReadCount: '',
    binkitapUrl: '',
    quotes: '',
  };

  // Kullanıcı tarafından yeniden adlandırılan (remap) alanları da yer tutucu sözlüğüne ekle
  if (mappings && mappings.length > 0) {
    for (const m of mappings) {
      if (m.mapping === PropertyMappingOption.Map && m.newProperty?.trim()) {
        const target = m.newProperty.trim();
        const origVal = replacements[m.property];
        if (origVal !== undefined && !Object.prototype.hasOwnProperty.call(replacements, target)) {
          replacements[target] = origVal;
        }
      }
    }
  }

  // 1. Dataview inline JS (`$= ...`) satırları: tırnak bağlamına duyarlı kaçış
  //    (örn. `'{{coverUrl}}'` içindeki "Ay'a Yolculuk" değeri `Ay\'a Yolculuk` olur)
  let rendered = processedTemplate
    .split('\n')
    .map((line) => (line.includes('`$=') ? interpolateInlineJsLine(line, replacements) : line))
    .join('\n');

  // 2. Standart {{değişken}} yer tutucularını çöz
  rendered = rendered.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (fullMatch, key: string) => {
    if (Object.prototype.hasOwnProperty.call(replacements, key)) {
      return replacements[key];
    }
    return fullMatch;
  });

  // 3. Basit <% degisken %> kalıpları (tp.* veya kod blokları hariç saf kitap değişkenleri için tolerans)
  rendered = rendered.replace(/<%\s*([a-zA-Z0-9_]+)\s*%>/g, (fullMatch, key: string) => {
    if (Object.prototype.hasOwnProperty.call(replacements, key)) {
      return replacements[key];
    }
    return fullMatch;
  });

  return rendered;
}
