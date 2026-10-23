import { App, parseYaml, stringifyYaml, TFile } from 'obsidian';
import {
  BookMetadata,
  KitapPluginSettings,
  DEFAULT_STATIC_TEMPLATE,
  DEFAULT_REACTIVE_TEMPLATE,
} from '../types';
import { PropertyMapper } from '../settings/propertyMapping';
import { renderBookTemplate } from './engine';

export interface NoteBuilderOptions {
  book: BookMetadata;
  settings: KitapPluginSettings;
  app?: App;
}

/**
 * Vault'ta belirtilen şablon dosyasını okur.
 */
export async function getTemplateContentFromVault(
  templatePath: string,
  app?: App
): Promise<string | null> {
  if (!templatePath || !app?.vault) return null;

  const vault = app.vault;
  let file = vault.getAbstractFileByPath?.(templatePath);

  // Doğrudan tam yol ile bulunamazsa dosya adına göre ara (fallback)
  if (!file && typeof vault.getFiles === 'function') {
    const allFiles = vault.getFiles();
    file = allFiles.find((f) => f.path === templatePath || f.name === templatePath) ?? null;
  }

  if (file instanceof TFile && typeof vault.read === 'function') {
    try {
      const content = await vault.read(file);
      return content;
    } catch (err) {
      console.warn('Şablon dosyası okunamadı:', templatePath, err);
      return null;
    }
  }

  return null;
}

/**
 * Verilen şablon metnini YAML frontmatter ve Markdown gövdesi olarak ayırır.
 */
export function extractFrontmatterAndBody(templateContent: string): {
  frontmatterRaw: string;
  body: string;
  hasFrontmatter: boolean;
} {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
  const match = templateContent.match(frontmatterRegex);

  if (match) {
    return {
      frontmatterRaw: match[1],
      body: match[2] || '',
      hasFrontmatter: true,
    };
  }

  return {
    frontmatterRaw: '',
    body: templateContent,
    hasFrontmatter: false,
  };
}

/**
 * Kitap metaverisini ve şablonunu birleştirerek eksiksiz kitap notu içeriği üretir.
 */
export async function buildBookNoteContent(
  options: NoteBuilderOptions
): Promise<string> {
  const { book, settings, app } = options;

  // 1. Şablon içeriğini belirle (Şablon dosyası veya şablon modu)
  let rawTemplate: string | null = null;
  if (settings.templateFile && app) {
    rawTemplate = await getTemplateContentFromVault(settings.templateFile, app);
  }

  if (!rawTemplate) {
    const mode = settings.templateMode || 'static';
    if (mode === 'reactive') {
      rawTemplate = DEFAULT_REACTIVE_TEMPLATE;
    } else if (mode === 'custom') {
      rawTemplate = settings.noteTemplate || DEFAULT_STATIC_TEMPLATE;
    } else {
      // Statik şablon (Varsayılan)
      rawTemplate = settings.noteTemplate || DEFAULT_STATIC_TEMPLATE;
    }
  }

  // 2. Şablonu frontmatter ve gövdeye ayır
  const { frontmatterRaw, body, hasFrontmatter } = extractFrontmatterAndBody(rawTemplate);

  let finalFrontmatterBlock = '';

  if (settings.useDefaultFrontMatter) {
    const isDr = book.provider === 'dr';
    const ratingVal = book.rating !== undefined && book.rating !== null ? book.rating : '';

    // Varsayılan kitap alanlarını oluştur
    const baseBookMetadata: Record<string, unknown> = {
      tip: 'kitap',
      baslik: book.title,
      yazar: book.author,
      yayinevi: book.publisher,
      cevirmen: book.translator || '',
      isbn: book.isbn,
      sayfa: book.pages !== undefined && book.pages !== null ? book.pages : '',
      okunan_sayfa: 0,
      toplam_sayfa: book.pages !== undefined && book.pages !== null ? book.pages : '',
      yayin_tarihi: book.publishDate || '',
      fiyat: book.price || '',
      format: book.format || '',
      tur: book.genres && book.genres.length > 0 ? book.genres : '',
      orijinal_baslik: book.originalTitle || '',
      dil: book.language || '',
      ...(isDr ? { puan: ratingVal } : { puan_kitapyurdu: ratingVal }),
      kapak: book.coverUrl || '',
      url: book.url || '',
      okuma_durumu: book.readingStatus || settings.defaultReadingStatus || 'Okunacak',
      okunma_tarihi: '',
      kisisel_puan: '',
    };

    // Kullanıcı eşleme kurallarını uygula (remap, remove, wikilink)
    const propertyMapper = new PropertyMapper(settings.propertyMappings);
    const mappedMetadata = propertyMapper.convertObject(baseBookMetadata);

    // Eğer şablonda özel frontmatter alanları varsa (örn. tags, kategori) bunları koru
    let templateFrontmatterObj: Record<string, unknown> = {};
    if (hasFrontmatter && frontmatterRaw.trim()) {
      try {
        const parsed: unknown = parseYaml(frontmatterRaw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          templateFrontmatterObj = parsed as Record<string, unknown>;
        }
      } catch (err) {
        console.warn('Şablon frontmatter ayrıştırma hatası:', err);
      }
    }

    // Şablondaki ek alanlar ile kitap metaverilerini birleştir
    // Varsayılan kitap anahtarları şablonda olsa bile kullanıcının remap/remove ayarlarına öncelik verilir.
    const defaultPropKeys = new Set([
      'tip',
      'baslik',
      'yazar',
      'yayinevi',
      'cevirmen',
      'isbn',
      'sayfa',
      'okunan_sayfa',
      'toplam_sayfa',
      'yayin_tarihi',
      'fiyat',
      'format',
      'tur',
      'orijinal_baslik',
      'dil',
      'puan',
      'puan_kitapyurdu',
      'puan_dr',
      'kapak',
      'url',
      'okuma_durumu',
      'durum',
      'okunma_tarihi',
      'kisisel_puan',
      'type',
      'current_page',
      'total_pages',
      'title',
      'author',
      'publisher',
      'translator',
      'pages',
      'publishDate',
      'price',
      'cilt_tipi',
      'binding',
      'genres',
      'category',
      'originalTitle',
      'language',
      'rating',
      'coverUrl',
      'readingStatus',
      'status',
      'total_pages',
      'image',
    ]);

    const customTemplateMetadata: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(templateFrontmatterObj)) {
      if (!defaultPropKeys.has(k)) {
        customTemplateMetadata[k] = v;
      }
    }

    const mergedMetadata = { ...customTemplateMetadata, ...mappedMetadata };
    let yamlString = stringifyYaml(mergedMetadata).trimEnd();

    if (settings.enableTemplaterIntegration) {
      const templaterHeader = `<%* const book = ${JSON.stringify(book)}; %>\n`;
      finalFrontmatterBlock = `---\n${templaterHeader}${yamlString}\n---`;
    } else {
      finalFrontmatterBlock = `---\n${yamlString}\n---`;
    }
  } else {
    // Varsayılan frontmatter istenmediyse şablondaki orijinal frontmatter'ı koru
    if (hasFrontmatter) {
      if (settings.enableTemplaterIntegration) {
        const templaterHeader = `<%* const book = ${JSON.stringify(book)}; %>\n`;
        finalFrontmatterBlock = `---\n${templaterHeader}${frontmatterRaw}\n---`;
      } else {
        finalFrontmatterBlock = `---\n${frontmatterRaw}\n---`;
      }
    } else if (settings.enableTemplaterIntegration) {
      finalFrontmatterBlock = `---\n<%* const book = ${JSON.stringify(book)}; %>\n---`;
    }
  }

  // 3. Frontmatter ile gövdeyi birleştir
  const combined = finalFrontmatterBlock
    ? `${finalFrontmatterBlock}\n\n${body}`
    : body;

  // 4. Standart {{değişken}} yer tutucularını çöz ve gövdeyi kullanıcı eşlemelerine göre uyarla
  return renderBookTemplate(combined, book, settings.propertyMappings);
}
