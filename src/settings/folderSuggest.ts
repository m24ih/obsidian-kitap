import { AbstractInputSuggest, App, TFolder } from 'obsidian';

/**
 * Vault içerisindeki klasörleri listeleyen ve filtreleyen suggester bileşeni
 */
export class FolderSuggest extends AbstractInputSuggest<TFolder> {
  constructor(app: App, textInputEl: HTMLInputElement) {
    super(app, textInputEl);
  }

  protected getSuggestions(query: string): TFolder[] {
    const lowerCaseInputStr = query.toLowerCase().trim();
    const vault = (this.app as any)?.vault;
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

  selectSuggestion(folder: TFolder, _evt: MouseEvent | KeyboardEvent): void {
    this.setValue(folder.path);
    this.close();
  }
}
