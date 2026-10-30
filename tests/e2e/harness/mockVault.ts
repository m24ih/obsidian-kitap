import { App, TFile } from 'obsidian';
import type { CachedMetadata } from 'obsidian';

export class InMemoryVault {
  private files: Map<string, { file: TFile; content: string }> = new Map();
  private caches: Map<string, CachedMetadata> = new Map();

  createFile(filePath: string, content: string, frontmatter?: Record<string, unknown>): TFile {
    const file = new TFile();
    file.path = filePath;
    const parts = filePath.split('/');
    file.name = parts[parts.length - 1];
    file.basename = file.name.replace(/\.[^/.]+$/, '');
    file.extension = filePath.endsWith('.md') ? 'md' : 'txt';

    this.files.set(filePath, { file, content });
    if (frontmatter) {
      this.caches.set(filePath, { frontmatter });
    }
    return file;
  }

  async read(file: TFile): Promise<string> {
    const record = this.files.get(file.path);
    if (!record) {
      throw new Error(`File not found: ${file.path}`);
    }
    return record.content;
  }

  async modify(file: TFile, newContent: string): Promise<void> {
    const record = this.files.get(file.path);
    if (!record) {
      throw new Error(`File not found: ${file.path}`);
    }
    record.content = newContent;
  }

  async create(path: string, content: string): Promise<TFile> {
    if (this.files.has(path)) {
      throw new Error(`File already exists: ${path}`);
    }
    return this.createFile(path, content);
  }

  getMarkdownFiles(): TFile[] {
    const mdFiles: TFile[] = [];
    for (const record of this.files.values()) {
      if (record.file.extension === 'md') {
        mdFiles.push(record.file);
      }
    }
    return mdFiles;
  }

  getAbstractFileByPath(path: string): TFile | null {
    const record = this.files.get(path);
    return record ? record.file : null;
  }

  getFileCache(file: TFile): CachedMetadata | null {
    return this.caches.get(file.path) ?? null;
  }
}

export interface MockObsidianEnvironment {
  app: App;
  vault: InMemoryVault;
}

export function createMockObsidianApp(): MockObsidianEnvironment {
  const vault = new InMemoryVault();
  const app = new App();

  const vaultApi = {
    read: (f: TFile): Promise<string> => vault.read(f),
    modify: (f: TFile, c: string): Promise<void> => vault.modify(f, c),
    create: (p: string, c: string): Promise<TFile> => vault.create(p, c),
    getMarkdownFiles: (): TFile[] => vault.getMarkdownFiles(),
    getAbstractFileByPath: (p: string): TFile | null => vault.getAbstractFileByPath(p),
  };

  const metadataCacheApi = {
    getFileCache: (f: TFile): CachedMetadata | null => vault.getFileCache(f),
  };

  Object.assign(app, {
    vault: vaultApi,
    metadataCache: metadataCacheApi,
  });

  return { app, vault };
}
