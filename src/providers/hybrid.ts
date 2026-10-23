import { BookMetadata, SearchResultItem } from '../types';
import { IBookProvider } from './types';
import { mergeBookMetadata, mergeSearchResults } from './matcher';

export interface IHybridProviderDeps {
  getProvider(id: string): IBookProvider;
}

/**
 * Hibrit Kitap Metaveri Sağlayıcısı
 * Kitapyurdu ve D&R sağlayıcılarını paralel olarak sorgular,
 * sonuçları ISBN ve Başlık+Yazar benzerliğine göre birleştirir ve tekilleştirir.
 */
export class HybridProvider implements IBookProvider {
  readonly id: string = 'hybrid';
  readonly name: string = 'Hibrit (Kitapyurdu + D&R)';
  private readonly deps: IHybridProviderDeps;

  constructor(deps: IHybridProviderDeps) {
    this.deps = deps;
  }

  /**
   * Hem Kitapyurdu hem D&R üzerinde paralel arama yapar ve sonuçları tekilleştirerek birleştirir.
   */
  async search(query: string): Promise<SearchResultItem[]> {
    const trimmed = (query || '').trim();
    if (!trimmed) return [];

    let kyProvider: IBookProvider | null = null;
    let drProvider: IBookProvider | null = null;

    try {
      kyProvider = this.deps.getProvider('kitapyurdu');
    } catch (err) {
      console.warn('Kitapyurdu sağlayıcısı bulunamadı:', err);
    }

    try {
      drProvider = this.deps.getProvider('dr');
    } catch (err) {
      console.warn('D&R sağlayıcısı bulunamadı:', err);
    }

    const kyPromise = kyProvider ? kyProvider.search(trimmed) : Promise.resolve([]);
    const drPromise = drProvider ? drProvider.search(trimmed) : Promise.resolve([]);

    const [kySettled, drSettled] = await Promise.allSettled([kyPromise, drPromise]);

    const kyResults: SearchResultItem[] = kySettled.status === 'fulfilled' ? kySettled.value : [];
    const drResults: SearchResultItem[] = drSettled.status === 'fulfilled' ? drSettled.value : [];

    if (kySettled.status === 'rejected') {
      console.warn('Kitapyurdu arama hatası (hibrit mod):', kySettled.reason);
    }
    if (drSettled.status === 'rejected') {
      console.warn('D&R arama hatası (hibrit mod):', drSettled.reason);
    }

    return mergeSearchResults(kyResults, drResults);
  }

  /**
   * Kitap detaylarını ilgili sağlayıcılardan çeker.
   */
  async getBookDetails(urlOrId: string): Promise<BookMetadata> {
    const trimmed = (urlOrId || '').trim();
    if (!trimmed) {
      throw new Error('Geçersiz kitap bağlantısı veya ID.');
    }

    // If it's a D&R URL or StockCode
    if (trimmed.includes('dr.com.tr') || /^[0-9]{13}$/.test(trimmed)) {
      try {
        const drProvider = this.deps.getProvider('dr');
        return await drProvider.getBookDetails(trimmed);
      } catch {
        // Fallback below
      }
    }

    // Default to Kitapyurdu
    const kyProvider = this.deps.getProvider('kitapyurdu');
    return await kyProvider.getBookDetails(trimmed);
  }

  /**
   * Birleştirilmiş arama sonucu öğesi için her iki sağlayıcıdan detayları çekip otomatik birleştirir.
   */
  async getFullBookData(item: SearchResultItem): Promise<BookMetadata> {
    const sources = item.sources;
    if (!sources || Object.keys(sources).length === 0) {
      return this.getBookDetails(item.url || item.id);
    }

    const kyItem = sources.kitapyurdu;
    const drItem = sources.dr;

    if (!kyItem || !drItem) {
      if (kyItem) {
        return this.deps.getProvider('kitapyurdu').getBookDetails(kyItem.url || kyItem.id);
      }
      if (drItem) {
        return this.deps.getProvider('dr').getBookDetails(drItem.url || drItem.id);
      }
      return this.getBookDetails(item.url || item.id);
    }

    // Both providers available
    const kyPromise = this.deps.getProvider('kitapyurdu').getBookDetails(kyItem.url || kyItem.id);
    const drPromise = this.deps.getProvider('dr').getBookDetails(drItem.url || drItem.id);

    const [kySettled, drSettled] = await Promise.allSettled([kyPromise, drPromise]);

    if (kySettled.status === 'fulfilled' && drSettled.status === 'fulfilled') {
      return mergeBookMetadata(kySettled.value, drSettled.value);
    }

    if (kySettled.status === 'fulfilled') {
      return kySettled.value;
    }

    if (drSettled.status === 'fulfilled') {
      return drSettled.value;
    }

    const kyReason = kySettled.status === 'rejected' ? String(kySettled.reason) : '';
    const drReason = drSettled.status === 'rejected' ? String(drSettled.reason) : '';
    throw new Error(
      `Kitap detayları alınamadı: ${kyReason || drReason}`
    );
  }
}
