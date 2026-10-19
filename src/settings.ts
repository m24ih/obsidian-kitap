import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type KitapPlugin from './main';
import { DEFAULT_NOTE_TEMPLATE } from './types';

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
      text: 'Kitapyurdu üzerinden kitap arama, metaveri çekme ve not oluşturma seçeneklerini buradan özelleştirebilirsiniz.',
      cls: 'setting-item-description',
    });

    // ----------------------------------------------------
    // Bölüm 1: Genel Dosya Ayarları
    // ----------------------------------------------------
    containerEl.createEl('h3', { text: 'Genel Dosya Ayarları' });

    new Setting(containerEl)
      .setName('Hedef Klasör')
      .setDesc('Oluşturulan kitap notlarının kaydedileceği vault klasörü. Klasör mevcut değilse otomatik olarak oluşturulur.')
      .addText((text) =>
        text
          .setPlaceholder('Kitaplar')
          .setValue(this.plugin.settings.targetFolder)
          .onChange(async (value) => {
            this.plugin.settings.targetFolder = value.trim();
            await this.plugin.saveSettings();
          })
      );

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
    // Bölüm 2: Not Şablonu ve Biçimlendirme
    // ----------------------------------------------------
    containerEl.createEl('h3', { text: 'Not Şablonu ve Biçimlendirme' });

    new Setting(containerEl)
      .setName('Not Şablonu')
      .setDesc('Oluşturulacak kitap notunun Markdown şablonu. Aşağıdaki değişkenler otomatik olarak kitap bilgileriyle doldurulur.')
      .addTextArea((textArea) => {
        textArea
          .setPlaceholder('Markdown şablonunuzu buraya girin...')
          .setValue(this.plugin.settings.noteTemplate)
          .onChange(async (value) => {
            this.plugin.settings.noteTemplate = value;
            await this.plugin.saveSettings();
          });
        textArea.inputEl.rows = 14;
        textArea.inputEl.style.width = '100%';
        textArea.inputEl.style.fontFamily = 'var(--font-monospace)';
        textArea.inputEl.style.fontSize = '0.85em';
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
    // Değişkenler Rehberi (Bilgi Kutusu)
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
      { tag: '{{coverUrl}}', desc: 'Yüksek çözünürlüklü kapak görseli bağlantısı' },
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
