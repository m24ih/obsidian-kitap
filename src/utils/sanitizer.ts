/**
 * Windows ve çapraz platform dosya sistemlerinde rezerve edilmiş dosya adları
 */
const RESERVED_FILENAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * Obsidian ve işletim sistemlerinde yasaklı olan karakterleri (/\:*?"<>|) temizler,
 * kontrol karakterlerini kaldırır ve güvenli bir dosya adı üretir.
 *
 * Eğer temizleme sonucunda metin tamamen boş kalırsa veya rezerve bir isimse
 * varsayılan olarak "Kitap Notu" döndürür.
 */
export function sanitizeFileName(name: string): string {
  if (!name || typeof name !== 'string') {
    return 'Kitap Notu';
  }

  // 1. Kontrol karakterlerini (\x00-\x1f, \x7f) boşluğa dönüştür ve uç boşlukları kırp
  let cleaned = name.replace(new RegExp('[\\x00-\\x1f\\x7f]+', 'g'), ' ').trim();

  // 2. Başta ve sonda bulunan yasaklı karakterleri ve boşlukları tamamen kaldır
  cleaned = cleaned.replace(/^[\s\\/:*?"<>|]+|[\s\\/:*?"<>|]+$/g, '');

  // 3. Metin ortasında yer alan yasaklı karakter dizilerini " - " ayırıcısına dönüştür
  cleaned = cleaned.replace(/[\s]*[\\/:*?"<>|]+[\s\\/:*?"<>|]*/g, ' - ');

  // 4. Ardışık oluşan " - - " tekrarlarını tekil " - " haline getir ve fazla boşlukları sadeleştir
  cleaned = cleaned
    .replace(/(?:\s*-\s*){2,}/g, ' - ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s-]+|[.\s-]+$/g, '')
    .trim();

  // 5. Boş kalma veya Windows rezerve dosya adı kontrolü
  if (!cleaned || RESERVED_FILENAMES.test(cleaned)) {
    return 'Kitap Notu';
  }

  return cleaned;
}
