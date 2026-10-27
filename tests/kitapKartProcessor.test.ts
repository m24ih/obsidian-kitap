import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createKitapKartProcessor } from '../src/codeblock/kitapKartProcessor';
import KitapPlugin from '../src/main';

describe('kitap-kart Codeblock Processor Suite', () => {
  let mockApp: any;
  let mockContainer: HTMLElement;
  let mockContext: any;

  beforeEach(() => {
    mockContainer = document.createElement('div');
    mockContext = {
      sourcePath: 'Kitaplar/Sabırsız Yürek.md',
    };

    mockApp = {
      metadataCache: {
        getCache: vi.fn(),
        getFileCache: vi.fn(),
        getFirstLinkpathDest: vi.fn(),
      },
      vault: {
        getAbstractFileByPath: vi.fn(),
        getResourcePath: vi.fn(),
      },
      workspace: {
        getActiveFile: vi.fn(),
      },
    };
  });

  it('renders card when frontmatter is retrieved from metadataCache', async () => {
    mockApp.metadataCache.getCache.mockReturnValue({
      frontmatter: {
        baslik: 'Sabırsız Yürek',
        yazar: 'Stefan Zweig',
        yayinevi: 'Can Yayınları',
        sayfa: 310,
        okunan_sayfa: 210,
        okuma_durumu: 'Okunuyor',
        isbn: '9789750738913',
      },
    });

    const processor = createKitapKartProcessor(mockApp);
    await processor('', mockContainer, mockContext);

    const card = mockContainer.querySelector('.kitap-kart-wrapper');
    expect(card).not.toBeNull();

    const titleEl = mockContainer.querySelector('.cover-book-title');
    expect(titleEl?.textContent).toBe('Sabırsız Yürek');

    const progressFill = mockContainer.querySelector('.slip-progress-bar-fill') as HTMLElement;
    expect(progressFill?.style.width).toBe('68%');
  });

  it('applies codeblock source overrides over frontmatter values', async () => {
    mockApp.metadataCache.getCache.mockReturnValue({
      frontmatter: {
        baslik: 'Sabırsız Yürek',
        yazar: 'Stefan Zweig',
        sayfa: 310,
        okunan_sayfa: 100,
      },
    });

    const source = `
okunan_sayfa: 310
okuma_durumu: Okundu
`;

    const processor = createKitapKartProcessor(mockApp);
    await processor(source, mockContainer, mockContext);

    const badge = mockContainer.querySelector('.book-cover-stage .badge');
    expect(badge?.textContent).toBe('OKUNDU (%100)');
    expect(badge?.classList.contains('badge-emerald')).toBe(true);

    const progressFill = mockContainer.querySelector('.slip-progress-bar-fill') as HTMLElement;
    expect(progressFill?.style.width).toBe('100%');
  });

  it('gracefully handles missing frontmatter by falling back to sourcePath filename', async () => {
    mockApp.metadataCache.getCache.mockReturnValue(null);
    mockApp.vault.getAbstractFileByPath.mockReturnValue(null);

    const processor = createKitapKartProcessor(mockApp);
    await processor('', mockContainer, { sourcePath: 'Kitaplar/Kuyucaklı Yusuf.md' } as any);

    const titleEl = mockContainer.querySelector('.cover-book-title');
    expect(titleEl?.textContent).toBe('Kuyucaklı Yusuf');

    const authorEl = mockContainer.querySelector('.cover-author');
    expect(authorEl?.textContent).toBe('Bilinmeyen Yazar');
  });

  it('renders graceful error message if card generation throws an unexpected error', async () => {
    // Cause an error by passing a throwing getter
    const badApp = {
      ...mockApp,
      metadataCache: {
        getCache: () => {
          throw new Error('Database disk corrupted');
        },
      },
    };

    const processor = createKitapKartProcessor(badApp as any);
    await processor('', mockContainer, mockContext);

    const errorEl = mockContainer.querySelector('.kitap-kart-error');
    expect(errorEl).not.toBeNull();
    expect(errorEl?.querySelector('.kitap-kart-error-desc')?.textContent).toContain(
      'Database disk corrupted'
    );
  });

  it('registers kitap-kart codeblock processor during KitapPlugin.onload()', async () => {
    const plugin = new KitapPlugin(mockApp as any, {} as any);
    plugin.loadData = vi.fn().mockResolvedValue({});
    plugin.addSettingTab = vi.fn();
    plugin.addRibbonIcon = vi.fn().mockReturnValue({ addClass: vi.fn() });
    plugin.addCommand = vi.fn();
    plugin.registerMarkdownCodeBlockProcessor = vi.fn();

    await plugin.onload();

    expect(plugin.registerMarkdownCodeBlockProcessor).toHaveBeenCalledWith(
      'kitap-kart',
      expect.any(Function)
    );
  });
});
