import { App, Notice, SuggestModal, TFile, normalizePath } from 'obsidian';
import type KitapPlugin from '../main';
import { BookAggregator, IBookAggregator } from '../providers/aggregator';
import { renderBookTemplate, sanitizeFileName } from '../templates/engine';
import { BookMetadata, SearchResultItem } from '../types';

export interface SearchModalOptions {
  insertIntoActive?: boolean;
  debounceMs?: number;
  aggregator?: IBookAggregator;
}

/**
 * Türkçe Kitap Arama ve Seçim Modalı
 * Gecikmeli (debounced) arama, eski yanıt koruması (stale-response guard),
 * güvenli iç içe klasör oluşturma ve aktif nota ekleme özelliklerini içerir.
 */
export class BookSearchModal extends SuggestModal<SearchResultItem> {
  private readonly plugin: KitapPlugin;
  private readonly aggregator: IBookAggregator;
  private readonly insertIntoActive: boolean;
  private readonly debounceMs: number;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private requestSeq = 0;

  constructor(app: App, plugin: KitapPlugin, options?: SearchModalOptions) {
    super(app);
    this.plugin = plugin;
    this.aggregator = options?.aggregator ?? new BookAggregator();
    this.insertIntoActive = options?.insertIntoActive ?? false;
    this.debounceMs = options?.debounceMs ?? 300;

    this.emptyStateText = 'Aramanızla eşleşen kitap bulunamadı.';

    this.setPlaceholder?.(
      'Kitap adı, yazar veya ISBN girin (örn. Kürk Mantolu Madonna, 9786053754794)...'
    );
    this.setInstructions?.([
      { command: '↑↓', purpose: 'Gezin' },
      { command: '↵', purpose: this.insertIntoActive ? 'Aktif Nota Ekle' : 'Not Oluştur' },
      { command: 'esc', purpose: 'Kapat' },
    ]);
  }

  /**
   * Kullanıcı arama kutusuna yazdıkça gecikmeli olarak Kitapyurdu araması yapar.
   * Eski (stale) ağ yanıtlarının yeni sonuçları ezmesini engeller.
   */
  async getSuggestions(query: string): Promise<SearchResultItem[]> {
    const trimmed = query.trim();

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (trimmed.length < 2) {
      this.requestSeq++;
      return [];
    }

    const currentSeq = ++this.requestSeq;

    if (this.debounceMs > 0) {
      const shouldContinue = await new Promise<boolean>((resolve) => {
        this.debounceTimer = setTimeout(() => {
          this.debounceTimer = null;
          resolve(currentSeq === this.requestSeq);
        }, this.debounceMs);
      });

      if (!shouldContinue || currentSeq !== this.requestSeq) {
        return [];
      }
    }

    try {
      const results = await this.aggregator.search(trimmed);
      if (currentSeq !== this.requestSeq) {
        return [];
      }
      return results;
    } catch (error) {
      console.error('Kitap arama hatası:', error);
      return [];
    }
  }

  /**
   * Her bir kitap arama sonucunu kapak görseli, başlık, yazar, yayınevi ve puan ile çizer.
   */
  renderSuggestion(item: SearchResultItem, el: HTMLElement): void {
    const container = el.createDiv({ cls: 'kitap-suggest-item' });

    const coverWrapper = container.createDiv({ cls: 'kitap-cover-wrapper' });
    if (item.coverUrl) {
      coverWrapper.createEl('img', {
        cls: 'kitap-cover-image',
        attr: { src: item.coverUrl, alt: item.title },
      });
    } else {
      coverWrapper.createDiv({ cls: 'kitap-cover-placeholder', text: '📚' });
    }

    const details = container.createDiv({ cls: 'kitap-details' });
    details.createDiv({ cls: 'kitap-title', text: item.title });

    const meta = details.createDiv({ cls: 'kitap-meta' });
    if (item.author) {
      meta.createSpan({ cls: 'kitap-meta-author', text: item.author });
    }
    if (item.author && item.publisher) {
      meta.createSpan({ cls: 'kitap-meta-separator', text: '•' });
    }
    if (item.publisher) {
      meta.createSpan({ cls: 'kitap-meta-publisher', text: item.publisher });
    }

    if (item.rating !== undefined) {
      const badges = details.createDiv({ cls: 'kitap-badges' });
      badges.createSpan({
        cls: 'kitap-badge kitap-badge-rating',
        text: `★ ${item.rating}/5`,
      });
    }
  }

  /**
   * Kullanıcı bir kitabı seçtiğinde tetiklenir.
   */
  async onChooseSuggestion(
    item: SearchResultItem,
    _evt: MouseEvent | KeyboardEvent
  ): Promise<void> {
    await this.processBookSelection(item);
  }

  /**
   * Seçilen kitabın tüm detaylarını ve 1000Kitap zenginleştirmelerini çekerek
   * yeni not oluşturur veya aktif nota ekler.
   */
  async processBookSelection(item: SearchResultItem): Promise<TFile | null> {
    new Notice(`"${item.title}" için kitap bilgileri ve alıntılar getiriliyor...`);

    try {
      const bookData = await this.aggregator.getFullBookData(item, this.plugin.settings);
      const renderedContent = renderBookTemplate(
        this.plugin.settings.noteTemplate,
        bookData
      );

      if (this.insertIntoActive) {
        return await this.insertContentIntoActiveNote(renderedContent, bookData);
      }

      return await this.createBookNote(renderedContent, bookData);
    } catch (error) {
      console.error('Kitap notu oluşturma hatası:', error);
      new Notice(`Kitap bilgileri alınırken bir hata oluştu: "${item.title}"`);
      return null;
    }
  }

  /**
   * Hedef klasörü (iç içe alt klasörler dahil) güvenli şekilde oluşturur ve kitap notunu kaydeder.
   */
  private async createBookNote(
    content: string,
    bookData: BookMetadata
  ): Promise<TFile | null> {
    const vault = (this.app as any)?.vault;
    if (!vault) {
      new Notice('Vault erişimi bulunamadı.');
      return null;
    }

    const folderPath = (this.plugin.settings.targetFolder || 'Kitaplar').trim();
    await this.ensureFolderExists(folderPath);

    const rawFileName = renderBookTemplate(
      this.plugin.settings.fileNameTemplate || '{{title}} - {{author}}',
      bookData
    );
    const safeFileName = sanitizeFileName(rawFileName);

    const normalizedFolder = normalizePath(folderPath).replace(/^\/+|\/+$/g, '');
    const fullPath = normalizedFolder
      ? normalizePath(`${normalizedFolder}/${safeFileName}.md`)
      : normalizePath(`${safeFileName}.md`);

    let file = vault.getAbstractFileByPath?.(fullPath) as TFile | null;
    if (file && typeof vault.modify === 'function') {
      await vault.modify(file, content);
      new Notice(`"${bookData.title}" notu güncellendi: ${fullPath}`);
    } else if (typeof vault.create === 'function') {
      file = (await vault.create(fullPath, content)) as TFile;
      new Notice(`"${bookData.title}" notu oluşturuldu: ${fullPath}`);
    }

    const workspace = (this.app as any)?.workspace;
    if (file && workspace?.getLeaf) {
      const leaf = workspace.getLeaf(false);
      if (leaf && typeof leaf.openFile === 'function') {
        await leaf.openFile(file);
      }
    }

    return file ?? null;
  }

  /**
   * Açık olan aktif nota kitap içeriğini ekler.
   */
  private async insertContentIntoActiveNote(
    content: string,
    bookData: BookMetadata
  ): Promise<TFile | null> {
    const workspace = (this.app as any)?.workspace;
    const vault = (this.app as any)?.vault;
    const activeFile = workspace?.getActiveFile?.() as TFile | null;

    if (!activeFile) {
      new Notice('Aktif bir not bulunamadı.');
      return null;
    }

    const activeEditor = workspace?.activeEditor?.editor;
    if (activeEditor && typeof activeEditor.replaceSelection === 'function') {
      activeEditor.replaceSelection(content);
      new Notice(`"${bookData.title}" bilgileri aktif nota eklendi.`);
      return activeFile;
    }

    if (vault && typeof vault.append === 'function') {
      await vault.append(activeFile, `\n${content}`);
    } else if (vault && typeof vault.read === 'function' && typeof vault.modify === 'function') {
      const existing = await vault.read(activeFile);
      const separator = existing.endsWith('\n') ? '' : '\n';
      await vault.modify(activeFile, `${existing}${separator}${content}`);
    }

    new Notice(`"${bookData.title}" bilgileri aktif nota eklendi.`);
    return activeFile;
  }

  /**
   * İç içe klasör yollarını (ör. "Kitaplar/2026/Roman") kademeli ve güvenli olarak oluşturur.
   */
  async ensureFolderExists(folderPath: string): Promise<void> {
    const vault = (this.app as any)?.vault;
    if (!vault || typeof vault.createFolder !== 'function') return;

    const normalized = normalizePath(folderPath).replace(/^\/+|\/+$/g, '');
    if (!normalized || normalized === '.') return;

    const segments = normalized.split('/').filter(Boolean);
    let currentPath = '';

    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const existing = vault.getAbstractFileByPath?.(currentPath);
      if (!existing) {
        try {
          await vault.createFolder(currentPath);
        } catch {
          // Klasör eşzamanlı oluşturulmuşsa hatayı yoksay
        }
      }
    }
  }

  onClose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.requestSeq++;
  }
}
