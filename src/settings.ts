import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type KitapPlugin from './main';
import { DEFAULT_NOTE_TEMPLATE } from './types';
import { FileSuggest } from './settings/fileSuggest';
import { FolderSuggest } from './settings/folderSuggest';
import { PropertyMappingComponent } from './settings/propertyMappingComponent';
import { PropertyMappingData } from './settings/propertyMapping';

export class KitapSettingTab extends PluginSettingTab {
  plugin: KitapPlugin;

  constructor(app: App, plugin: KitapPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Kitap Eklentisi Ayarları' });
    containerEl.createEl('p', {
      text: 'Kitapyurdu üzerinden kitap arama, metaveri çekme, YAML özellik eşleme ve şablon seçeneklerini buradan özelleştirebilirsiniz.',
      cls: 'setting-item-description',
    });

    // ----------------------------------------------------
    // Bölüm 1: Genel Dosya Ayarları
    // ----------------------------------------------------
    containerEl.createEl('h3', { text: 'Genel Dosya Ayarları' });

    new Setting(containerEl)
      .setName('Hedef Klasör')
      .setDesc('Oluşturulan kitap notlarının kaydedileceği vault klasörü. Klasör mevcut değilse otomatik olarak oluşturulur.')
      .addText((text) => {
        new FolderSuggest(this.app, text.inputEl);
        text
          .setPlaceholder('Kitaplar')
          .setValue(this.plugin.settings.targetFolder)
          .onChange(async (value) => {
            this.plugin.settings.targetFolder = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Dosya Adı Şablonu')
      .setDesc('Oluşturulacak kitap notu dosyasının adı formatı. Kullanılabilir değişkenler: {{title}}, {{author}}, {{publisher}}, {{isbn}}, {{publishDate}}.')
      .addText((text) =>
        text
          .setPlaceholder('{{title}} - {{author}}')
          .setValue(this.plugin.settings.fileNameTemplate)
          .onChange(async (value) => {
            this.plugin.settings.fileNameTemplate = value.trim();
            await this.plugin.saveSettings();
          })
      );

    // ----------------------------------------------------
    // Bölüm: Kapak Görselleri
    // ----------------------------------------------------
    containerEl.createEl('h3', { text: 'Kapak Görselleri' });

    new Setting(containerEl)
      .setName('Kapak Görsellerini İndir')
      .setDesc('Yeni kitap notları oluşturulurken kapak görselini yerel olarak indirir ve vault içine kaydeder. Böylece her kitap için harici bağlantıya gerek kalmaz.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.downloadCovers)
          .onChange(async (value) => {
            this.plugin.settings.downloadCovers = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.downloadCovers) {
      new Setting(containerEl)
        .setClass('kitap-setting-wide-control')
        .setName('Kapak Klasörü')
        .setDesc('İndirilen kitap kapaklarının kaydedileceği vault klasörü. Klasör mevcut değilse otomatik olarak oluşturulur.')
        .addSearch((cb) => {
          new FolderSuggest(this.app, cb.inputEl);
          cb.setPlaceholder('Kitaplar/Kapaklar')
            .setValue(this.plugin.settings.coverFolder)
            .onChange(async (value) => {
              this.plugin.settings.coverFolder = value.trim();
              await this.plugin.saveSettings();
            });
        });
    }

    // ----------------------------------------------------
    // Bölüm: Okuma Durumu Ayarları
    // ----------------------------------------------------
    containerEl.createEl('h3', { text: 'Okuma Durumu Ayarları' });

    new Setting(containerEl)
      .setName('Okuma Durumu Seçenekleri')
      .setDesc('Kitaplar için kullanabileceğiniz durum seçenekleri (virgülle ayırarak girin). Örn: Okunacak, Okunuyor, Okundu veya TBR, Reading, Read.')
      .addText((text) =>
        text
          .setPlaceholder('Okunacak, Okunuyor, Okundu')
          .setValue(this.plugin.settings.readingStatusOptions.join(', '))
          .onChange(async (value) => {
            const rawOpts = value.split(',').map((s) => s.trim()).filter(Boolean);
            const options = rawOpts.length > 0 ? rawOpts : ['Okunacak'];
            this.plugin.settings.readingStatusOptions = options;
            if (!options.includes(this.plugin.settings.defaultReadingStatus)) {
              this.plugin.settings.defaultReadingStatus = options[0];
            }
            await this.plugin.saveSettings();
            this.display();
          })
      );

    new Setting(containerEl)
      .setName('Varsayılan Okuma Durumu')
      .setDesc('Yeni eklenen kitap notuna otomatik atanacak başlangıç okuma durumu.')
      .addDropdown((dropdown) => {
        const opts = this.plugin.settings.readingStatusOptions;
        for (const opt of opts) {
          dropdown.addOption(opt, opt);
        }
        if (!opts.includes(this.plugin.settings.defaultReadingStatus)) {
          dropdown.addOption(this.plugin.settings.defaultReadingStatus, this.plugin.settings.defaultReadingStatus);
        }
        dropdown
          .setValue(this.plugin.settings.defaultReadingStatus)
          .onChange(async (value) => {
            this.plugin.settings.defaultReadingStatus = value;
            await this.plugin.saveSettings();
          });
      });

    // ----------------------------------------------------
    // Bölüm 2: Not Şablonu ve Biçimlendirme
    // ----------------------------------------------------
    containerEl.createEl('h3', { text: 'Not Şablonu ve Biçimlendirme' });

    new Setting(containerEl)
      .setClass('kitap-setting-wide-control')
      .setName('Şablon Dosyası (Vault İçi)')
      .setDesc('Kitap notları oluşturulurken kullanılacak vault içi Markdown şablon dosyası (.md). Belirtilirse aşağıdaki metin şablonu yerine bu dosya kullanılır.')
      .addSearch((cb) => {
        new FileSuggest(this.app, cb.inputEl);
        cb.setPlaceholder('Örnek: Sablonlar/KitapSablonu.md')
          .setValue(this.plugin.settings.templateFile || '')
          .onChange(async (value) => {
            this.plugin.settings.templateFile = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setClass('kitap-setting-stacked')
      .setName('Doğrudan Not Şablonu (Markdown)')
      .setDesc('Şablon dosyası seçilmediğinde veya bulunamadığında kullanılacak standart metin şablonu.')
      .addTextArea((textArea) => {
        textArea
          .setPlaceholder('Markdown şablonunuzu buraya girin...')
          .setValue(this.plugin.settings.noteTemplate)
          .onChange(async (value) => {
            this.plugin.settings.noteTemplate = value;
            await this.plugin.saveSettings();
          });
        textArea.inputEl.rows = 14;
      });

    new Setting(containerEl)
      .setName('Varsayılan Şablona Sıfırla')
      .setDesc('Not şablonunu eklentinin orijinal varsayılan şablonuna geri döndürür.')
      .addButton((button) =>
        button
          .setButtonText('Varsayılana Sıfırla')
          .setWarning()
          .onClick(async () => {
            this.plugin.settings.noteTemplate = DEFAULT_NOTE_TEMPLATE;
            await this.plugin.saveSettings();
            new Notice('Kitap not şablonu varsayılan ayarlara sıfırlandı.');
            this.display();
          })
      );

    // ----------------------------------------------------
    // Bölüm 3: Templater Entegrasyonu
    // ----------------------------------------------------
    containerEl.createEl('h3', { text: 'Templater Entegrasyonu' });

    new Setting(containerEl)
      .setName('Templater Entegrasyonunu Etkinleştir')
      .setDesc(
        'Templater eklentisi ile entegrasyon sağlar. Not oluşturulduğunda Templater otomatik çalıştırılır ve şablonlarınızda `book` objesine (<%* const b = book; %>) erişebilirsiniz. (Templater eklentisinin kurulu olması gerekir).'
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableTemplaterIntegration)
          .onChange(async (value) => {
            this.plugin.settings.enableTemplaterIntegration = value;
            await this.plugin.saveSettings();
          })
      );

    // ----------------------------------------------------
    // Bölüm 4: YAML Frontmatter & Özellik Eşlemeleri (Property Mappings)
    // ----------------------------------------------------
    containerEl.createEl('h3', { text: 'YAML Frontmatter & Özellik Eşlemeleri' });

    new Setting(containerEl)
      .setName('Varsayılan Frontmatter Oluştur')
      .setDesc('Etkinleştirildiğinde, aşağıdaki özellik eşlemelerine göre otomatik YAML frontmatter oluşturulur. Devre dışı bırakılırsa yalnızca şablonda tanımlı frontmatter kullanılır.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.useDefaultFrontMatter)
          .onChange(async (value) => {
            this.plugin.settings.useDefaultFrontMatter = value;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.useDefaultFrontMatter) {
      const mappingContainer = containerEl.createDiv('kitap-property-mappings-section');
      const comp = new PropertyMappingComponent(mappingContainer, {
        mappings: this.plugin.settings.propertyMappings,
        save: async (updated: PropertyMappingData[]) => {
          this.plugin.settings.propertyMappings = updated;
          await this.plugin.saveSettings();
          new Notice('Özellik eşlemeleri başarıyla kaydedildi.');
        },
      });
      comp.onload();
    }

    // ----------------------------------------------------
    // Bölüm 5: Değişkenler Rehberi (Bilgi Kutusu)
    // ----------------------------------------------------
    const infoContainer = containerEl.createDiv({ cls: 'kitap-settings-guide' });

    infoContainer.createEl('h4', { text: 'Kullanılabilir Şablon Değişkenleri' });
    const list = infoContainer.createEl('ul');
    list.style.paddingLeft = '20px';
    list.style.lineHeight = '1.6';

    const variables: { tag: string; desc: string }[] = [
      { tag: '{{title}}', desc: 'Kitap Başlığı' },
      { tag: '{{author}}', desc: 'Yazar(lar)' },
      { tag: '{{publisher}}', desc: 'Yayınevi' },
      { tag: '{{translator}}', desc: 'Çevirmen (varsa)' },
      { tag: '{{isbn}}', desc: '13 haneli ISBN numarası' },
      { tag: '{{pages}}', desc: 'Sayfa sayısı' },
      { tag: '{{publishDate}}', desc: 'Yayın tarihi' },
      { tag: '{{coverUrl}}', desc: 'Kapak görseli bağlantısı (indirildiğinde vault içi wikilink formatı)' },
      { tag: '{{coverPath}}', desc: 'İndirilen kapak görselinin vault içi ham dosya yolu' },
      { tag: '{{readingStatus}}', desc: 'Kitap okuma durumu (örn: Okunacak, TBR)' },
      { tag: '{{okumaDurumu}}', desc: 'Kitap okuma durumu (Türkçe değişken adı)' },
      { tag: '{{rating}}', desc: 'Kitapyurdu okur puanı (0-5)' },
      { tag: '{{description}}', desc: 'Kitap açıklaması / arka kapak tanıtım metni' },
      { tag: '{{url}}', desc: 'Kitapyurdu ürün sayfası bağlantısı' },
    ];

    for (const v of variables) {
      const item = list.createEl('li');
      item.createEl('code', { text: v.tag });
      item.appendText(`: ${v.desc}`);
    }
  }
}
