---
type: book
baslik: "{{title}}"
yazar: "{{author}}"
yayinevi: "{{publisher}}"
cevirmen: "{{translator}}"
isbn: "{{isbn}}"
sayfa: {{pages}}
yayin_tarihi: "{{publishDate}}"
fiyat: "{{price}}"
format: "{{format}}"
tur:
{{genresList}}
orijinal_baslik: "{{originalTitle}}"
dil: "{{language}}"
puan_kitapyurdu: {{rating}}
kapak: "{{coverUrl}}"
url: "{{url}}"
okuma_durumu: "{{readingStatus}}"
current_page: 0
total_pages: {{pages}}
okunma_tarihi:
kisisel_puan:
---

# 📖 `$= dv.current().baslik || "{{title}}"`

`$= (() => { const k = dv.current()?.kapak || '{{coverUrl}}'; const p = (typeof k === 'object' && k?.path) ? k.path : String(k).replace(/^\[\[/, '').replace(/\]\]$/, ''); return p.startsWith('http') ? '![Kapak|250](' + p + ')' : '![[' + p + '|250]]'; })()`

> **Yazar:** `$= dv.current().yazar || "{{author}}"`  
> **Yayınevi:** `$= dv.current().yayinevi || "{{publisher}}"`  
> **Format:** `$= dv.current().format || "{{format}}"` | **Fiyat:** `$= dv.current().fiyat || "{{price}}"`  
> **Kitapyurdu Puanı:** `$= dv.current().puan_kitapyurdu || "{{rating}}"` / 5  

## 📊 Okuma İlerlemesi
```dataviewjs
const p = dv.current();
const current = Number(p?.current_page) || 0;
const total = Number(p?.total_pages || p?.sayfa) || 1;
const percent = Math.min(100, Math.round((current / total) * 100));
const status = p?.okuma_durumu || 'Okunacak';

dv.paragraph(`**Durum:** \`${status}\` | **İlerleme:** \`${current} / ${total} sayfa\` (%${percent})`);
dv.paragraph(`<progress value="${percent}" max="100" style="width: 100%; height: 18px;"></progress>`);
```

## 📝 Notlar & Alıntılar

| **Alıntı / Not** | **Sayfa** | **Tarih** |
| :--------------: | :-------: | :-------: |
|                  |           |           |

## ⏳ Okuma Günlüğü

| **Tarih** | **Başlangıç** | **Bitiş** | **Okunan Sayfa** | **Notlar** |
| :-------: | :-----------: | :-------: | :--------------: | :--------: |
|           |               |           |                  |            |

## 📖 Kitap Açıklaması
{{description}}
