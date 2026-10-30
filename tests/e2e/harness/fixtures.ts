export const GOODREADS_HEADER_24 =
  'Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Owned Copies';

export const SAMPLE_DUNE_ROW =
  '234225,"Dune (Dune, #1)","Frank Herbert","Herbert, Frank","","=""0441172717""","=""9780441172719""","5","4.27","Ace Books","Paperback","412","2019","1965","2023/04/10","2022/01/15","sci-fi, favorites","favorites (#1)","read","A masterpiece of science fiction.<br/>Unmatched worldbuilding.","false","","1","1"';

export const SAMPLE_TURKISH_ROW =
  '456789,"İnce Memed 1","Yaşar Kemal","Kemal, Yaşar","","=""9750807143""","=""9789750807145""","4","4.45","Yapı Kredi Yayınları","Karton Kapak","436","2018","1955","2022/08/20","2021/05/10","edebiyat, turk-klasikleri","","read","Torosların eşsiz hikayesi.","false","","1","1"';

export const SAMPLE_CURRENTLY_READING_ROW =
  '123456,"Karanlığın Sol Eli","Ursula K. Le Guin","Le Guin, Ursula K.","","=""9755390770""","=""9789755390772""","0","4.08","Ayrıntı Yayınları","Karton Kapak","256","2020","1969","","2024/02/01","bilim-kurgu","","currently-reading","","false","","0","1"';

export const SAMPLE_TO_READ_ROW =
  '789012,"Mülksüzler","Ursula K. Le Guin","Le Guin, Ursula K.","","=""9755390193""","=""9789755390192""","0","4.22","Metis Yayınları","Karton Kapak","344","2021","1974","","2024/02/10","anarsizm, bilim-kurgu","","to-read","","false","","0","0"';

export const SAMPLE_MULTILINE_SPOILER_ROW =
  '999888,"Otostopçunun Galaksi Rehberi","Douglas Adams","Adams, Douglas","","=""9755104441""","=""9789755104447""","5","4.23","Kabalcı","Karton Kapak","212","2015","1979","2021/11/05","2020/09/12","mizah","","read","Harika bir absürd komedi.<br/><br/><b>Unutulmaz:</b> 42 cevabı.<spoiler>Dünya aslında bir bilgisayar programıydı!</spoiler>","true","Arkadaş tavsiyesi","2","1"';

export const SAMPLE_CSV_STANDARD = [
  GOODREADS_HEADER_24,
  SAMPLE_DUNE_ROW,
  SAMPLE_TURKISH_ROW,
  SAMPLE_CURRENTLY_READING_ROW,
  SAMPLE_TO_READ_ROW,
  SAMPLE_MULTILINE_SPOILER_ROW,
].join('\n');

export const SAMPLE_CSV_WITH_BOM = '\uFEFF' + SAMPLE_CSV_STANDARD;

export const SAMPLE_CSV_CRLF = [
  GOODREADS_HEADER_24,
  SAMPLE_DUNE_ROW,
  SAMPLE_TURKISH_ROW,
].join('\r\n');

export const SAMPLE_CSV_LEGACY_28 = [
  GOODREADS_HEADER_24 + ',Recommended For,Recommended By,Condition,BCID',
  SAMPLE_DUNE_ROW + ',"Alice","Bob","Very Good","BC12345"',
].join('\n');

export const SAMPLE_EXISTING_VAULT_NOTE_DUNE = `---
baslik: "Dune"
yazar: "Frank Herbert"
yayinevi: "İthaki Yayınları"
isbn: "9780441172719"
okuma_durumu: "Okunuyor"
kisisel_puan: 
okunma_tarihi: 
ozel_etiket: "favori-bilimkurgu" # Kullanıcı özel etiketi
---

# Dune

Bu not kullanıcı tarafından daha önce açılmıştır.

\`\`\`kitap-kart
id: 9780441172719
\`\`\`

## Kişisel Düşünceler
Kitabı çok beğendim, harika bir dünya.
`;

export const SAMPLE_EXISTING_VAULT_NOTE_INCE_MEMED = `---
baslik: "İnce Memed 1"
yazar: "Yaşar Kemal"
yayinevi: "Yapı Kredi Yayınları"
isbn: "9789750807145"
okuma_durumu: "Okundu"
kisisel_puan: 4
okunma_tarihi: "2022-08-20"
---

# İnce Memed 1
Toros Dağları'nda geçen eşsiz bir destan.
`;
