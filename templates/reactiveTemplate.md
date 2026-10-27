---
tip: kitap
baslik: "{{title}}"
yazar: "{{author}}"
yayinevi: "{{publisher}}"
cevirmen: "{{translator}}"
isbn: "{{isbn}}"
sayfa: {{pages}}
okunan_sayfa: 0
toplam_sayfa: {{pages}}
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
okunma_tarihi:
kisisel_puan:
---

\`\`\`kitap-kart
\`\`\`

# 📖 `$= dv.current()?.baslik || dv.current()?.title || "{{title}}"`

`$= (() => { const k = dv.current()?.kapak || dv.current()?.cover || dv.current()?.coverUrl || dv.current()?.image || '{{coverUrl}}'; const p = (typeof k === 'object' && k?.path) ? k.path : String(k).replace(/^\[\[/, '').replace(/\]\]$/, ''); return p.startsWith('http') ? '![Kapak|250](' + p + ')' : '![[' + p + '|250]]'; })()`

> **Yazar:** `$= dv.current()?.yazar || dv.current()?.author || "{{author}}"`  
> **Yayınevi:** `$= dv.current()?.yayinevi || dv.current()?.publisher || "{{publisher}}"`  
> **Format:** `$= dv.current()?.format || "{{format}}"` | **Fiyat:** `$= dv.current()?.fiyat || dv.current()?.price || "{{price}}"`  
> **Puan:** `$= dv.current()?.puan || dv.current()?.puan_dr || dv.current()?.puan_kitapyurdu || dv.current()?.rating || "{{rating}}"` / 5  

## 📊 Okuma İlerlemesi
```dataviewjs
const p = dv.current();
const current = Number(p?.okunan_sayfa ?? p?.current_page ?? 0);
const total = Number(p?.toplam_sayfa ?? p?.sayfa ?? p?.total_pages ?? 1);
const percent = Math.min(100, Math.round((current / total) * 100));
const status = p?.okuma_durumu ?? p?.durum ?? 'Okunacak';

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
