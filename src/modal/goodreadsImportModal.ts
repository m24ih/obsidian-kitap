/**
 * obsidian-kitap - Goodreads CSV Import Modal
 * Interactive modal orchestrating file selection, duplicate detection,
 * non-destructive update confirmation, provider enrichment, and progress reporting.
 * Zero external runtime dependencies. Zero `: any` or `as any` casts.
 */

import { App, Modal, Setting } from 'obsidian';
import type KitapPlugin from '../main';
import { parseGoodreadsCsv, stripBom } from '../goodreads/csvParser';
import { mapGoodreadsRow } from '../goodreads/mapper';
import { scanVaultBooks } from '../goodreads/vaultScanner';
import { detectDuplicates } from '../goodreads/duplicateDetector';
import { GoodreadsImporter } from '../goodreads/importer';
import type {
  GoodreadsRawRow,
  ParsedGoodreadsBook,
  ExistingVaultBook,
  DuplicateScanResult,
  ImportOptions,
  ImportResult,
} from '../goodreads/types';

export type ModalStep = 'select' | 'scanning' | 'preview' | 'importing' | 'completed';

export interface GoodreadsImportModalOptions {
  /** Optional callback fired when import finishes */
  onImportComplete?: (result: ImportResult) => void;
  /** Pluggable import runner (enables decoupled testing and custom pipelines) */
  importHandler?: (
    scanResult: DuplicateScanResult,
    options: ImportOptions
  ) => Promise<ImportResult>;
  /** Optional function overrides for unit testing */
  scannerFn?: (app: App, targetFolder?: string) => Promise<ExistingVaultBook[]>;
  detectorFn?: (
    csvBooks: ParsedGoodreadsBook[],
    vaultBooks: ExistingVaultBook[]
  ) => DuplicateScanResult;
  parserFn?: (csvContent: string) => GoodreadsRawRow[];
  mapperFn?: (
    row: GoodreadsRawRow,
    settings: import('../types').KitapPluginSettings
  ) => ParsedGoodreadsBook;
}



export class GoodreadsImportModal extends Modal {
  private readonly plugin: KitapPlugin;
  private readonly options?: GoodreadsImportModalOptions;

  // State Machine
  private currentStep: ModalStep = 'select';
  private selectedFileName = '';
  private rawCsvContent = '';
  private scanResult: DuplicateScanResult | null = null;

  // User Configuration Options
  private updateExisting = false;
  private enrichFromProviders = false;

  // Execution & Progress State
  private abortController: AbortController | null = null;
  private isImportRunning = false;
  private importResult: ImportResult | null = null;
  private errorMessage: string | null = null;

  // Cached DOM elements
  private progressFillEl: HTMLElement | null = null;
  private progressPercentEl: HTMLElement | null = null;
  private progressStatusEl: HTMLElement | null = null;
  private errorBannerEl: HTMLElement | null = null;
  private submitButtonEl: HTMLButtonElement | null = null;
  private currentProgress = { current: 0, total: 0, percent: 0, message: '' };

  constructor(app: App, plugin: KitapPlugin, options?: GoodreadsImportModalOptions) {
    super(app);
    this.plugin = plugin;
    this.options = options;
  }

  override onOpen(): void {
    void super.onOpen?.();
    this.modalEl.addClass('kitap-goodreads-modal');
    this.titleEl.setText('Goodreads Kütüphanesini İçe Aktar');
    this.renderCurrentStep();
  }

  override onClose(): void {
    if (this.isImportRunning && this.abortController) {
      this.abortController.abort();
    }
    if (this.plugin && this.plugin.activeImportModal === this) {
      this.plugin.activeImportModal = null;
    }
    this.contentEl.empty();
  }

  // --- Public State Accessors for Testing & Coordination ---

  getCurrentStep(): ModalStep {
    return this.currentStep;
  }

  getScanResult(): DuplicateScanResult | null {
    return this.scanResult;
  }

  getUpdateExisting(): boolean {
    return this.updateExisting;
  }

  setUpdateExisting(val: boolean): void {
    this.updateExisting = val;
    if (this.submitButtonEl) {
      this.submitButtonEl.setText(this.getSubmitButtonText());
    }
  }

  getEnrichFromProviders(): boolean {
    return this.enrichFromProviders;
  }

  setEnrichFromProviders(val: boolean): void {
    this.enrichFromProviders = val;
  }

  getImportResult(): ImportResult | null {
    return this.importResult;
  }

  // --- Step Rendering ---

  private renderCurrentStep(): void {
    this.contentEl.empty();
    switch (this.currentStep) {
      case 'select':
        this.renderSelectStep();
        break;
      case 'scanning':
        this.renderScanningStep();
        break;
      case 'preview':
        this.renderPreviewStep();
        break;
      case 'importing':
        this.renderImportingStep();
        break;
      case 'completed':
        this.renderCompletedStep();
        break;
    }
  }

  private renderSelectStep(): void {
    const container = this.contentEl.createDiv({ cls: 'kitap-import-container' });

    container.createEl('p', {
      cls: 'kitap-import-desc',
      text: 'Goodreads hesabınızdan dışa aktardığınız goodreads_library_export.csv dosyasını seçin. Kitaplarınız kasanızdaki mevcut kitaplarla karşılaştırılacak ve mükerrer kayıtlar tespit edilecektir.',
    });

    this.errorBannerEl = container.createDiv({
      cls: `kitap-import-error-banner ${this.errorMessage ? '' : 'is-hidden'}`,
      text: this.errorMessage || '',
    });

    const dropzone = container.createDiv({ cls: 'kitap-import-dropzone' });
    dropzone.createDiv({ cls: 'kitap-import-dropzone-icon', text: '📄' });
    dropzone.createDiv({
      cls: 'kitap-import-dropzone-text',
      text: 'Goodreads CSV dosyasını seçin veya buraya sürükleyin',
    });
    dropzone.createDiv({
      cls: 'kitap-import-dropzone-subtext',
      text: 'goodreads_library_export.csv dosyası desteklenir',
    });

    const fileInput = container.createEl('input', {
      cls: 'kitap-import-file-input',
      attr: { type: 'file', accept: '.csv,text/csv' },
    });
    fileInput.type = 'file';
    fileInput.accept = '.csv,text/csv';

    dropzone.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) {
        void this.processFile(file);
      }
    });

    dropzone.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
      dropzone.addClass('is-dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.removeClass('is-dragover');
    });

    dropzone.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault();
      dropzone.removeClass('is-dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        void this.processFile(file);
      }
    });
  }

  private renderScanningStep(): void {
    const container = this.contentEl.createDiv({ cls: 'kitap-import-container' });
    const loadingBox = container.createDiv({ cls: 'kitap-loading-container' });
    loadingBox.createDiv({ cls: 'kitap-spinner' });
    loadingBox.createDiv({
      cls: 'kitap-import-desc',
      text: 'Kasadaki mevcut kitaplar taranıyor ve mükerrer kayıtlar tespit ediliyor...',
    });
  }

  private renderPreviewStep(): void {
    if (!this.scanResult) return;

    const container = this.contentEl.createDiv({ cls: 'kitap-import-container' });

    // 1. File Badge
    const fileBadge = container.createDiv({ cls: 'kitap-import-file-info' });
    fileBadge.createDiv({
      cls: 'kitap-import-file-name',
      text: this.selectedFileName || 'goodreads_library_export.csv',
    });
    const totalCount =
      this.scanResult.newBooks.length + this.scanResult.existingBooks.length;
    fileBadge.createDiv({
      cls: 'kitap-import-stat-label',
      text: `${totalCount} kitap kaydı okundu`,
    });

    // 2. Statistics Grid
    const statsGrid = container.createDiv({ cls: 'kitap-import-stats-grid' });

    const newCard = statsGrid.createDiv({
      cls: 'kitap-import-stat-card kitap-stat-new',
    });
    newCard.createDiv({
      cls: 'kitap-import-stat-num',
      text: String(this.scanResult.newBooks.length),
    });
    newCard.createDiv({ cls: 'kitap-import-stat-label', text: 'Yeni Kitaplar' });

    const existingCard = statsGrid.createDiv({
      cls: 'kitap-import-stat-card kitap-stat-existing',
    });
    existingCard.createDiv({
      cls: 'kitap-import-stat-num',
      text: String(this.scanResult.existingBooks.length),
    });
    existingCard.createDiv({ cls: 'kitap-import-stat-label', text: 'Mevcut Kitaplar' });

    const totalCard = statsGrid.createDiv({
      cls: 'kitap-import-stat-card kitap-stat-total',
    });
    totalCard.createDiv({
      cls: 'kitap-import-stat-num',
      text: String(totalCount),
    });
    totalCard.createDiv({ cls: 'kitap-import-stat-label', text: 'Toplam Kitap' });

    // 3. Existing Books Interactive Confirmation & Details
    if (this.scanResult.existingBooks.length > 0) {
      const confirmBox = container.createDiv({ cls: 'kitap-import-confirm-box' });
      confirmBox.createDiv({
        cls: 'kitap-import-confirm-header',
        text: '⚠️ Mevcut Kitap Notları Tespit Edildi',
      });
      confirmBox.createEl('p', {
        cls: 'kitap-import-confirm-desc',
        text: `Kasanızda zaten ${this.scanResult.existingBooks.length} adet kitap notu bulunmaktadır. Bu mevcut notların okuma durumu, kişisel puan, okunma tarihi gibi frontmatter metaverilerini güncellemek ister misiniz? Not içeriğiniz, kişisel düşünceleriniz ve kitap-kart bloklarınız kesinlikle korunur.`,
      });

      new Setting(confirmBox)
        .setName('Mevcut Kitap Notlarını Güncelle')
        .setDesc(
          'Açık: Mevcut notların YAML frontmatter değerleri güncellenir. Kapalı: Mevcut notlar atlanır, yalnızca yeni kitaplar eklenir.'
        )
        .addToggle((toggle) => {
          toggle.setValue(this.updateExisting).onChange((val) => {
            this.setUpdateExisting(val);
          });
        });

      const detailsEl = container.createEl('details', {
        cls: 'kitap-import-existing-details',
      });
      detailsEl.createEl('summary', {
        cls: 'kitap-import-existing-summary',
        text: `Kasada Bulunan Mevcut Kitapları İncele (${this.scanResult.existingBooks.length})`,
      });
      const listEl = detailsEl.createDiv({ cls: 'kitap-import-existing-list' });
      for (const match of this.scanResult.existingBooks) {
        const itemEl = listEl.createDiv({ cls: 'kitap-import-existing-item' });
        const titleSpan = itemEl.createSpan();
        titleSpan.setText(
          `${match.csvBook.cleanTitle} - ${match.csvBook.metadata.author}`
        );
        const reasonText =
          match.matchReason === 'title-author-normalized'
            ? 'Başlık & Yazar Eşleşmesi'
            : 'ISBN Eşleşmesi';
        itemEl.createSpan({ cls: 'kitap-import-match-badge', text: reasonText });
      }
    }

    // 4. Provider Enrichment Toggle
    const optionsSection = container.createDiv({ cls: 'kitap-import-options-section' });
    new Setting(optionsSection)
      .setName('Eksik kapak ve künye bilgilerini sağlayıcılardan zenginleştir')
      .setDesc(
        'Etkinleştirildiğinde eksik kapak görselleri ve bibliyografik detaylar Kitapyurdu, D&R, OpenLibrary ve Hardcover sağlayıcılarından sorgulanır. Kapalıyken (önerilen) aktarım tamamen yerel ve çevrimdışı gerçekleşir.'
      )
      .addToggle((toggle) => {
        toggle.setValue(this.enrichFromProviders).onChange((val) => {
          this.setEnrichFromProviders(val);
        });
      });

    // 5. Action Footer
    const footer = container.createDiv({ cls: 'kitap-import-footer' });
    const backBtn = footer.createEl('button', {
      cls: 'mod-cancel',
      text: 'Geri',
    });
    backBtn.addEventListener('click', () => {
      this.currentStep = 'select';
      this.renderCurrentStep();
    });

    this.submitButtonEl = footer.createEl('button', {
      cls: 'mod-cta',
      text: this.getSubmitButtonText(),
    });
    this.submitButtonEl.addEventListener('click', () => {
      void this.startImport();
    });
  }

  private renderImportingStep(): void {
    const container = this.contentEl.createDiv({ cls: 'kitap-import-container' });
    const progressContainer = container.createDiv({
      cls: 'kitap-import-progress-container',
    });

    progressContainer.createEl('h3', {
      cls: 'kitap-import-progress-title',
      text: 'Kitaplar İçe Aktarılıyor...',
    });

    const barWrap = progressContainer.createDiv({
      cls: 'kitap-import-progress-bar-wrap',
    });
    this.progressFillEl = barWrap.createDiv({ cls: 'kitap-import-progress-fill' });
    this.progressFillEl.style.width = `${this.currentProgress.percent}%`;

    const meta = progressContainer.createDiv({ cls: 'kitap-import-progress-meta' });
    this.progressPercentEl = meta.createDiv({
      cls: 'kitap-import-progress-percent',
      text: `%${this.currentProgress.percent} (${this.currentProgress.current} / ${this.currentProgress.total})`,
    });

    this.progressStatusEl = meta.createDiv({
      cls: 'kitap-import-status-text',
      text: this.currentProgress.message || 'Hazırlanıyor...',
    });

    const footer = container.createDiv({ cls: 'kitap-import-footer' });
    const cancelBtn = footer.createEl('button', {
      cls: 'mod-warning',
      text: 'İptal Et',
    });
    cancelBtn.addEventListener('click', () => {
      this.cancelImport();
    });
  }

  private renderCompletedStep(): void {
    const container = this.contentEl.createDiv({ cls: 'kitap-import-container' });

    const isAborted = this.abortController?.signal.aborted ?? false;
    const hasErrors = (this.importResult?.errors.length ?? 0) > 0;

    const titleText = isAborted
      ? '⚠️ İçe Aktarma Durduruldu'
      : hasErrors
      ? '⚠️ İçe Aktarma Kısmen Tamamlandı'
      : '🎉 İçe Aktarma Başarıyla Tamamlandı';

    container.createEl('h3', { text: titleText });

    const statsGrid = container.createDiv({ cls: 'kitap-import-stats-grid' });

    const newCard = statsGrid.createDiv({
      cls: 'kitap-import-stat-card kitap-stat-new',
    });
    newCard.createDiv({
      cls: 'kitap-import-stat-num',
      text: String(this.importResult?.importedCount ?? 0),
    });
    newCard.createDiv({ cls: 'kitap-import-stat-label', text: 'Oluşturulan Notlar' });

    const updateCard = statsGrid.createDiv({
      cls: 'kitap-import-stat-card kitap-stat-existing',
    });
    updateCard.createDiv({
      cls: 'kitap-import-stat-num',
      text: String(this.importResult?.updatedCount ?? 0),
    });
    updateCard.createDiv({ cls: 'kitap-import-stat-label', text: 'Güncellenen Notlar' });

    const skippedCard = statsGrid.createDiv({
      cls: 'kitap-import-stat-card kitap-stat-total',
    });
    skippedCard.createDiv({
      cls: 'kitap-import-stat-num',
      text: String(this.importResult?.skippedCount ?? 0),
    });
    skippedCard.createDiv({ cls: 'kitap-import-stat-label', text: 'Atlanan Notlar' });

    if (hasErrors && this.importResult) {
      const errorDetails = container.createEl('details', {
        cls: 'kitap-import-existing-details',
      });
      errorDetails.createEl('summary', {
        cls: 'kitap-import-existing-summary',
        text: `Hatalar (${this.importResult.errors.length})`,
      });
      const errorList = errorDetails.createDiv({ cls: 'kitap-import-existing-list' });
      for (const err of this.importResult.errors) {
        const item = errorList.createDiv({ cls: 'kitap-import-existing-item' });
        item.createSpan({ text: err.title });
        item.createSpan({ cls: 'kitap-import-error-banner', text: err.error });
      }
    }

    const footer = container.createDiv({ cls: 'kitap-import-footer' });
    const closeBtn = footer.createEl('button', {
      cls: 'mod-cta',
      text: 'Kapat',
    });
    closeBtn.addEventListener('click', () => {
      this.close();
    });
  }

  // --- Logic Helpers ---

  private getSubmitButtonText(): string {
    if (!this.scanResult) return 'İçe Aktarmayı Başlat';
    const newCount = this.scanResult.newBooks.length;
    const existingCount = this.scanResult.existingBooks.length;
    if (this.updateExisting) {
      return `İçe Aktar ve Güncelle (${newCount} Yeni, ${existingCount} Güncelleme)`;
    }
    return `Yalnızca Yeni Kitapları Aktar (${newCount} Kitap)`;
  }

  private validateGoodreadsCsv(content: string): string | null {
    if (!content || !content.trim()) {
      return 'Seçilen CSV dosyası boş.';
    }

    const clean = stripBom(content);
    const firstLineEnd = clean.search(/\r?\n/);
    const firstLine = firstLineEnd !== -1 ? clean.slice(0, firstLineEnd) : clean;
    const lowerFirstLine = firstLine.toLowerCase();

    const hasTitle = lowerFirstLine.includes('title');
    const hasAuthorOrId =
      lowerFirstLine.includes('author') ||
      lowerFirstLine.includes('book id') ||
      lowerFirstLine.includes('bookid');

    if (!hasTitle || !hasAuthorOrId) {
      return "Geçersiz Goodreads CSV formatı. Dosya 'Title' ve 'Author' (veya 'Book Id') sütunlarını içermelidir.";
    }

    const parser = this.options?.parserFn ?? parseGoodreadsCsv;
    const rawRows = parser(clean);
    if (rawRows.length === 0) {
      return 'CSV dosyasında okunabilecek kitap kaydı bulunamadı.';
    }

    return null;
  }

  private async processFile(file: File): Promise<void> {
    this.selectedFileName = file.name;
    try {
      const text = await file.text();
      await this.handleFileSelected(text, file.name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.errorMessage = 'Dosya okunamadı: ' + msg;
      this.currentStep = 'select';
      this.renderCurrentStep();
    }
  }

  async handleFileSelected(content: string, fileName: string): Promise<void> {
    this.errorMessage = null;
    const validationError = this.validateGoodreadsCsv(content);
    if (validationError) {
      this.errorMessage = validationError;
      this.currentStep = 'select';
      this.renderCurrentStep();
      return;
    }

    this.selectedFileName = fileName;
    this.rawCsvContent = stripBom(content);
    this.currentStep = 'scanning';
    this.renderCurrentStep();

    try {
      const parser = this.options?.parserFn ?? parseGoodreadsCsv;
      const rawRows = parser(this.rawCsvContent);
      const mapper = this.options?.mapperFn ?? mapGoodreadsRow;
      const parsedBooks = rawRows.map((r) => mapper(r, this.plugin.settings));

      const scanner = this.options?.scannerFn ?? scanVaultBooks;
      const vaultBooks = await scanner(this.app, this.plugin.settings?.targetFolder);

      const detector = this.options?.detectorFn ?? detectDuplicates;
      this.scanResult = detector(parsedBooks, vaultBooks);

      this.currentStep = 'preview';
      this.renderCurrentStep();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.errorMessage = 'Tarama sırasında hata oluştu: ' + msg;
      this.currentStep = 'select';
      this.renderCurrentStep();
    }
  }

  updateProgressUI(current: number, total: number, message: string): void {
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    this.currentProgress = { current, total, percent, message };
    if (this.progressFillEl) {
      this.progressFillEl.style.width = `${percent}%`;
    }
    if (this.progressPercentEl) {
      this.progressPercentEl.setText(`%${percent} (${current} / ${total})`);
    }
    if (this.progressStatusEl) {
      this.progressStatusEl.setText(message);
    }
  }

  async startImport(): Promise<ImportResult> {
    if (!this.scanResult) {
      throw new Error('İçe aktarma başlatılamadı: Tarama sonucu bulunamadı.');
    }

    this.currentStep = 'importing';
    this.isImportRunning = true;
    this.abortController = new AbortController();
    this.renderCurrentStep();

    const total =
      this.scanResult.newBooks.length +
      (this.updateExisting ? this.scanResult.existingBooks.length : 0);
    this.updateProgressUI(0, total, 'İçe aktarma başlatılıyor...');

    const importOptions: ImportOptions = {
      updateExisting: this.updateExisting,
      enrichFromProviders: this.enrichFromProviders,
      targetFolder: this.plugin.settings?.targetFolder,
      abortSignal: this.abortController.signal,
      onProgress: (current: number, tot: number, message: string) => {
        this.updateProgressUI(current, tot, message);
      },
    };

    try {
      let result: ImportResult;
      if (this.options?.importHandler) {
        result = await this.options.importHandler(this.scanResult, importOptions);
      } else {
        const importer = new GoodreadsImporter(this.app, this.plugin);
        result = await importer.importBooks(this.scanResult, importOptions);
      }

      this.importResult = result;
      this.currentStep = 'completed';
      this.isImportRunning = false;
      this.renderCurrentStep();
      this.options?.onImportComplete?.(result);
      return result;
    } catch (err) {
      this.isImportRunning = false;
      const msg = err instanceof Error ? err.message : String(err);
      this.importResult = {
        importedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errors: [{ title: 'İçe Aktarma', error: msg }],
      };
      this.currentStep = 'completed';
      this.renderCurrentStep();
      return this.importResult;
    }
  }

  cancelImport(): void {
    if (this.abortController && !this.abortController.signal.aborted) {
      this.abortController.abort();
    }
    if (this.progressStatusEl) {
      this.progressStatusEl.setText('İçe aktarma durduruldu...');
    }
  }
}
