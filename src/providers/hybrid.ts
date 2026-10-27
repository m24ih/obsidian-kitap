import { BookMetadata, KitapPluginSettings, ProviderSearchMetric, SearchResultItem } from '../types';
import { IBookProvider } from './types';
import { mergeBookMetadata, mergeSearchResults } from './matcher';

export interface SearchExecutionOptions {
  onProgress?: (metric: ProviderSearchMetric) => void;
}

export interface IHybridProviderDeps {
  getProvider(id: string): IBookProvider;
  getSettings?(): KitapPluginSettings | undefined;
  isProviderEnabled?(id: string): boolean;
}

export interface HybridProviderConfig {
  enableOpenLibrary?: boolean;
  enableHardcover?: boolean;
}

/**
 * Hibrit Kitap Metaveri Sağlayıcısı
 * Kitapyurdu, D&R ve aktif edilen global sağlayıcıları (OpenLibrary, Hardcover) paralel olarak sorgular,
 * sonuçları ISBN ve Başlık+Yazar benzerliğine göre birleştirir ve tekilleştirir.
 */
export class HybridProvider implements IBookProvider {
  readonly id: string = 'hybrid';
  readonly name: string = 'Hibrit Arama';
  private readonly deps: IHybridProviderDeps;
  private config?: HybridProviderConfig;
  private lastMetrics: ProviderSearchMetric[] = [];

  constructor(deps: IHybridProviderDeps, config?: HybridProviderConfig) {
    this.deps = deps;
    this.config = config;
  }

  /**
   * En son gerçekleştirilen aramanın sağlayıcı bazlı süre ve başarı metriklerini döndürür.
   */
  getLastMetrics(): ProviderSearchMetric[] {
    return [...this.lastMetrics];
  }

  /**
   * Hibrit sağlayıcı yapılandırmasını günceller.
   */
  setConfig(config: HybridProviderConfig): void {
    this.config = config;
  }

  /**
   * Belirtilen sağlayıcının hibrit aramada aktif olup olmadığını denetler.
   */
  private isProviderActive(providerId: string): boolean {
    if (this.deps.isProviderEnabled) {
      return this.deps.isProviderEnabled(providerId);
    }
    const settings = this.deps.getSettings?.();
    if (settings) {
      if (providerId === 'kitapyurdu') return settings.enableKitapyurdu !== false;
      if (providerId === 'dr') return settings.enableDr !== false;
      if (providerId === 'openlibrary') return Boolean(settings.enableOpenLibrary);
      if (providerId === 'hardcover') return Boolean(settings.enableHardcover);
    }
    if (providerId === 'openlibrary' && this.config?.enableOpenLibrary) return true;
    if (providerId === 'hardcover' && this.config?.enableHardcover) return true;
    if (providerId === 'kitapyurdu' || providerId === 'dr') {
      return true;
    }
    return false;
  }

  /**
   * Tek bir sağlayıcıyı süre ve durum ölçümüyle birlikte yürütür.
   */
  private async executeWithMetric(
    provider: IBookProvider | null,
    providerId: string,
    providerName: string,
    query: string,
    onProgress?: (metric: ProviderSearchMetric) => void
  ): Promise<SearchResultItem[]> {
    if (!provider) return [];

    onProgress?.({
      providerId,
      name: providerName,
      durationMs: 0,
      status: 'pending',
      resultCount: 0,
    });

    const start = performance.now();
    try {
      const results = await provider.search(query);
      const durationMs = Math.max(1, Math.round(performance.now() - start));
      const status = results.length > 0 ? 'success' : 'empty';
      const metric: ProviderSearchMetric = {
        providerId,
        name: providerName,
        durationMs,
        status,
        resultCount: results.length,
      };
      this.lastMetrics = this.lastMetrics.filter((m) => m.providerId !== providerId);
      this.lastMetrics.push(metric);
      onProgress?.(metric);
      return results;
    } catch (err: unknown) {
      const durationMs = Math.max(1, Math.round(performance.now() - start));
      const metric: ProviderSearchMetric = {
        providerId,
        name: providerName,
        durationMs,
        status: 'error',
        resultCount: 0,
        error: String((err as Error)?.message || err),
      };
      this.lastMetrics = this.lastMetrics.filter((m) => m.providerId !== providerId);
      this.lastMetrics.push(metric);
      onProgress?.(metric);
      throw err;
    }
  }

  /**
   * Tüm aktif sağlayıcılar üzerinde paralel arama yapar ve sonuçları tekilleştirerek birleştirir.
   */
  async search(query: string, options?: SearchExecutionOptions): Promise<SearchResultItem[]> {
    const trimmed = (query || '').trim();
    if (!trimmed) {
      this.lastMetrics = [];
      return [];
    }

    this.lastMetrics = [];

    let kyProvider: IBookProvider | null = null;
    let drProvider: IBookProvider | null = null;
    let olProvider: IBookProvider | null = null;
    let hcProvider: IBookProvider | null = null;

    if (this.isProviderActive('kitapyurdu')) {
      try {
        kyProvider = this.deps.getProvider('kitapyurdu');
      } catch (err) {
        console.warn('Kitapyurdu sağlayıcısı bulunamadı:', err);
      }
    }

    if (this.isProviderActive('dr')) {
      try {
        drProvider = this.deps.getProvider('dr');
      } catch (err) {
        console.warn('D&R sağlayıcısı bulunamadı:', err);
      }
    }

    if (this.isProviderActive('openlibrary')) {
      try {
        olProvider = this.deps.getProvider('openlibrary');
      } catch (err) {
        console.warn('OpenLibrary sağlayıcısı bulunamadı:', err);
      }
    }

    if (this.isProviderActive('hardcover')) {
      try {
        hcProvider = this.deps.getProvider('hardcover');
      } catch (err) {
        console.warn('Hardcover sağlayıcısı bulunamadı:', err);
      }
    }

    const kyPromise = kyProvider
      ? this.executeWithMetric(kyProvider, 'kitapyurdu', 'Kitapyurdu', trimmed, options?.onProgress)
      : Promise.resolve([]);

    const drPromise = drProvider
      ? this.executeWithMetric(drProvider, 'dr', 'D&R', trimmed, options?.onProgress)
      : Promise.resolve([]);

    const olPromise = olProvider
      ? this.executeWithMetric(olProvider, 'openlibrary', 'OpenLibrary', trimmed, options?.onProgress)
      : Promise.resolve([]);

    const hcPromise = hcProvider
      ? this.executeWithMetric(hcProvider, 'hardcover', 'Hardcover', trimmed, options?.onProgress)
      : Promise.resolve([]);

    const [kySettled, drSettled, olSettled, hcSettled] = await Promise.allSettled([
      kyPromise,
      drPromise,
      olPromise,
      hcPromise,
    ]);

    const kyResults: SearchResultItem[] = kySettled.status === 'fulfilled' ? kySettled.value : [];
    const drResults: SearchResultItem[] = drSettled.status === 'fulfilled' ? drSettled.value : [];
    const olResults: SearchResultItem[] = olSettled.status === 'fulfilled' ? olSettled.value : [];
    const hcResults: SearchResultItem[] = hcSettled.status === 'fulfilled' ? hcSettled.value : [];

    if (kySettled.status === 'rejected') {
      console.warn('Kitapyurdu arama hatası (hibrit mod):', kySettled.reason);
    }
    if (drSettled.status === 'rejected') {
      console.warn('D&R arama hatası (hibrit mod):', drSettled.reason);
    }
    if (olSettled.status === 'rejected') {
      console.warn('OpenLibrary arama hatası (hibrit mod):', olSettled.reason);
    }
    if (hcSettled.status === 'rejected') {
      console.warn('Hardcover arama hatası (hibrit mod):', hcSettled.reason);
    }

    const extraLists: SearchResultItem[][] = [];
    if (olResults.length > 0) extraLists.push(olResults);
    if (hcResults.length > 0) extraLists.push(hcResults);

    return mergeSearchResults(kyResults, drResults, ...extraLists);
  }

  /**
   * Kitap detaylarını ilgili sağlayıcılardan çeker.
   */
  async getBookDetails(urlOrId: string): Promise<BookMetadata> {
    const trimmed = (urlOrId || '').trim();
    if (!trimmed) {
      throw new Error('Geçersiz kitap bağlantısı veya ID.');
    }

    // OpenLibrary bağlantısı veya ID'si
    if (
      trimmed.includes('openlibrary.org') ||
      trimmed.startsWith('/works/') ||
      trimmed.startsWith('/books/') ||
      /^OL\d+[WM]$/i.test(trimmed)
    ) {
      try {
        const olProvider = this.deps.getProvider('openlibrary');
        return await olProvider.getBookDetails(trimmed);
      } catch {
        // Fallback
      }
    }

    // Hardcover bağlantısı veya ID'si
    if (trimmed.includes('hardcover.app') || trimmed.startsWith('hardcover:')) {
      try {
        const hcProvider = this.deps.getProvider('hardcover');
        return await hcProvider.getBookDetails(trimmed);
      } catch {
        // Fallback
      }
    }

    // D&R bağlantısı veya StockCode
    if (trimmed.includes('dr.com.tr') || /^[0-9]{13}$/.test(trimmed)) {
      try {
        const drProvider = this.deps.getProvider('dr');
        return await drProvider.getBookDetails(trimmed);
      } catch {
        // Fallback below
      }
    }

    // Varsayılan: Kitapyurdu
    const kyProvider = this.deps.getProvider('kitapyurdu');
    return await kyProvider.getBookDetails(trimmed);
  }

  /**
   * Birleştirilmiş arama sonucu öğesi için ilgili sağlayıcılardan detayları çekip otomatik birleştirir.
   */
  async getFullBookData(item: SearchResultItem): Promise<BookMetadata> {
    const sources = item.sources;
    if (!sources || Object.keys(sources).length === 0) {
      return this.getBookDetails(item.url || item.id);
    }

    const sourceEntries = Object.entries(sources);
    if (sourceEntries.length === 1) {
      const [pId, srcItem] = sourceEntries[0];
      try {
        return await this.deps.getProvider(pId).getBookDetails(srcItem.url || srcItem.id);
      } catch {
        return this.getBookDetails(item.url || item.id);
      }
    }

    // Birden fazla sağlayıcıdan detayları paralel çek
    const promises = sourceEntries.map(async ([pId, srcItem]) => {
      const provider = this.deps.getProvider(pId);
      return provider.getBookDetails(srcItem.url || srcItem.id);
    });

    const settled = await Promise.allSettled(promises);
    const fulfilled: BookMetadata[] = [];
    const errors: string[] = [];

    for (const s of settled) {
      if (s.status === 'fulfilled') {
        fulfilled.push(s.value);
      } else {
        errors.push(String(s.reason));
      }
    }

    if (fulfilled.length === 0) {
      throw new Error(`Kitap detayları alınamadı: ${errors.join(', ')}`);
    }

    if (fulfilled.length === 1) {
      return fulfilled[0];
    }

    // Tüm başarılı metaverileri tekil bir nesnede birleştir
    const providerItems = fulfilled.map((data, idx) => ({
      id: data.provider || (sourceEntries[idx] ? sourceEntries[idx][0] : `provider_${idx}`),
      data,
    }));
    return mergeBookMetadata(fulfilled[0], fulfilled[1], undefined, providerItems);
  }
}
