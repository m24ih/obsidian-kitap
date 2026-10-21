import { App, normalizePath, requestUrl } from 'obsidian';
import { BookMetadata, KitapPluginSettings } from '../types';
import { renderBookTemplate } from '../templates/engine';
import { sanitizeFileName } from './sanitizer';
import { ensureFolderExists } from './fileUtils';

export interface CoverDownloadResult {
  success: boolean;
  coverPath?: string;
  wikilink?: string;
  error?: unknown;
}

/**
 * URL veya Content-Type başlığına göre görsel dosya uzantısını belirler.
 */
export function getCoverExtension(imageUrl: string, contentType?: string): string {
  if (contentType) {
    const lowerType = contentType.toLowerCase();
    if (lowerType.includes('image/jpeg') || lowerType.includes('image/jpg')) return 'jpg';
    if (lowerType.includes('image/png')) return 'png';
    if (lowerType.includes('image/webp')) return 'webp';
    if (lowerType.includes('image/gif')) return 'gif';
    if (lowerType.includes('image/svg+xml')) return 'svg';
  }

  const cleanUrl = imageUrl.split('?')[0].split('#')[0];
  const extMatch = cleanUrl.match(/\.(jpe?g|png|webp|gif|svg)$/i);
  if (extMatch) {
    const ext = extMatch[1].toLowerCase();
    return ext === 'jpeg' ? 'jpg' : ext;
  }

  return 'jpg';
}

/**
 * Kitap metaverisine ve şablon ayarlarına göre yerel kapak dosya adını belirler.
 */
export function getCoverFileName(
  book: BookMetadata,
  extension: string,
  fileNameTemplate: string = '{{title}} - {{author}}'
): string {
  const rendered = renderBookTemplate(fileNameTemplate, book);
  const safeName = sanitizeFileName(rendered) || sanitizeFileName(book.title) || `kitap_${book.id || Date.now()}`;
  return `${safeName}.${extension}`;
}

/**
 * Kitap kapak görselini indirir veya zaten indirilmişse önbellekten kullanır.
 * Böylece aynı kitap için tekrar tekrar harici istek atılması engellenir.
 */
export async function downloadBookCover(
  app: App,
  book: BookMetadata,
  settings: KitapPluginSettings
): Promise<CoverDownloadResult> {
  if (!book.coverUrl || typeof book.coverUrl !== 'string') {
    return { success: false };
  }

  const imageUrl = book.coverUrl.trim();
  if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
    // Zaten yerel dosya (örn. [[...]]) veya geçersiz URL ise işlem yapma
    return { success: false };
  }

  const vault = (app as any)?.vault;
  if (!vault) {
    return { success: false, error: new Error('Vault erişimi bulunamadı') };
  }

  const coverFolder = (settings.coverFolder || 'Kitaplar/Kapaklar').trim();
  await ensureFolderExists(vault, coverFolder);

  // Dosya adını ve ilk olası uzantıyı belirle
  const provisionalExt = getCoverExtension(imageUrl);
  const fileName = getCoverFileName(book, provisionalExt, settings.fileNameTemplate);
  const normalizedFolder = normalizePath(coverFolder).replace(/^\/+|\/+$/g, '');
  const imagePath = normalizedFolder ? normalizePath(`${normalizedFolder}/${fileName}`) : fileName;

  // 1. Önbellek kontrolü: Dosya zaten vault'ta mevcutsa tekrar istek atma!
  const existingFile = vault.getAbstractFileByPath?.(imagePath);
  if (existingFile) {
    const wikilink = `[[${imagePath}]]`;
    book.coverUrl = wikilink;
    return {
      success: true,
      coverPath: imagePath,
      wikilink,
    };
  }

  // 2. Mevcut değilse indir
  try {
    const response = await requestUrl({
      url: imageUrl,
      method: 'GET',
    });

    if (response.status && response.status >= 400) {
      throw new Error(`Kapak indirilemedi, HTTP durum kodu: ${response.status}`);
    }

    const contentType = response.headers?.['content-type'] || response.headers?.['Content-Type'];
    const actualExt = getCoverExtension(imageUrl, contentType);

    // Eğer Content-Type farklı bir uzantı gerektiriyorsa ve provisional ile uyuşmuyorsa yolu güncelle
    let finalPath = imagePath;
    if (actualExt !== provisionalExt) {
      const finalFileName = getCoverFileName(book, actualExt, settings.fileNameTemplate);
      finalPath = normalizedFolder ? normalizePath(`${normalizedFolder}/${finalFileName}`) : finalFileName;
    }

    if (!vault.getAbstractFileByPath?.(finalPath)) {
      if (typeof vault.createBinary === 'function') {
        await vault.createBinary(finalPath, response.arrayBuffer);
      }
    }

    const wikilink = `[[${finalPath}]]`;
    book.coverUrl = wikilink;

    return {
      success: true,
      coverPath: finalPath,
      wikilink,
    };
  } catch (error) {
    console.warn(`[obsidian-kitap] Kapak görseli indirilemedi (${imageUrl}):`, error);
    return {
      success: false,
      error,
    };
  }
}
