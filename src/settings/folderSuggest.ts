import { AbstractInputSuggest, App, TFolder } from 'obsidian';

/**
 * Vault içerisindeki klasörleri listeleyen ve filtreleyen suggester bileşeni
 */
export class FolderSuggest extends AbstractInputSuggest<TFolder> {
  protected inputEl: HTMLInputElement;
  private onSelectCb?: (folder: TFolder, evt: MouseEvent | KeyboardEvent) => void;

  constructor(app: App, textInputEl: HTMLInputElement) {
    super(app, textInputEl);
    this.inputEl = textInputEl;
  }

  override onSelect(callback: (value: TFolder, evt: MouseEvent | KeyboardEvent) => unknown): this {
    this.onSelectCb = callback;
    super.onSelect(callback);
    return this;
  }

  protected getSuggestions(query: string): TFolder[] {
    const lowerCaseInputStr = query.toLowerCase().trim();
    const vault = this.app.vault;
    if (!vault || typeof vault.getAllLoadedFiles !== 'function') {
      return [];
    }

    const files = vault.getAllLoadedFiles() as unknown[];
    return files
      .filter((file): file is TFolder => file instanceof TFolder)
      .filter((folder) => {
        if (!lowerCaseInputStr) return true;
        return folder.path.toLowerCase().includes(lowerCaseInputStr);
      });
  }

  renderSuggestion(value: TFolder, el: HTMLElement): void {
    el.setText(value.path);
  }

  selectSuggestion(folder: TFolder, evt?: MouseEvent | KeyboardEvent): void {
    this.setValue(folder.path);
    if (this.onSelectCb) {
      this.onSelectCb(folder, evt as MouseEvent | KeyboardEvent);
    }
    this.inputEl?.dispatchEvent(new Event('input', { bubbles: true }));
    this.inputEl?.dispatchEvent(new Event('change', { bubbles: true }));
    this.close();
  }
}
