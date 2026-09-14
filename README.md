# Contact Sheet

YouTube ana sayfasında, senin seçtiğin oynatma listelerindeki videoları gizler.

"Daha sonra izle" listende 400 video birikmişse ana sayfa onları tekrar tekrar önerir. Bu eklentide listeyi işaretlersin, o listedeki videolar ve listenin kendisi ana sayfada görünmez olur.

> **Durum: geliştirme aşamasında (v0.1.0, Faz 0).** Henüz gizleme yapmıyor. Yol haritası için `docs/contactsheet-yt-spec.md`.

## Ne yapar

- Seçilen listelerdeki videoları ana sayfa akışından gizler.
- Seçilen listelerin kartlarını ve raflarını gizler.
- Her şey yerelde çalışır: sunucu yok, hesap yok, telemetri yok.

## Ne yapmaz

- YouTube hesabında hiçbir değişiklik yapmaz. Video silmez, listeden çıkarmaz.
- Ana sayfa dışındaki sayfalara dokunmaz (abonelikler, arama, izleme sayfası).
- Reklam engellemez, video indirmez.
- youtube.com dışında hiçbir adrese istek atmaz.

## Kısıtlar

- Oynatma listelerini okumak için YouTube'un kendi dahili uç noktaları kullanılır. Bunlar belgelenmiş bir API değildir; YouTube değiştirirse eklenti güncelleme gerektirir.
- Senkronizasyon yalnızca **açık bir YouTube sekmesi varken** çalışır. Bu bilinçli bir tercih: böylece eklentinin çerez veya oturum bilgisi saklaması gerekmiyor.
- Yalnızca Chrome / Edge (Manifest V3). Firefox portu yok.

## Kurulum (geliştirme)

```bash
npm ci
npm run build
```

Sonra Chrome'da:

1. `chrome://extensions` adresini aç.
2. Sağ üstten **Geliştirici modu**'nu aç.
3. **Paketlenmemiş öğe yükle** → bu klasördeki `dist/` klasörünü seç.

Kod değiştirdiğinde `npm run build` çalıştır ve eklentiler sayfasındaki yenile simgesine bas.

## Komutlar

| Komut | İş |
|---|---|
| `npm run build` | Geliştirme derlemesi → `dist/` |
| `npm run build:prod` | Küçültülmüş derleme, debug logları çıkarılır |
| `npm run zip` | Yayın paketi + SHA-256 → `dist-zip/` |
| `npm run typecheck` | TypeScript denetimi |
| `npm run lint` | ESLint (güvenlik kuralları dahil) |
| `npm test` | Birim testleri |
| `npm run check` | Hepsi birden |

## Gizlilik

Eklenti şunları **yerelde** saklar: oynatma listesi kimlikleri, liste başlıkları, o listelerdeki video kimlikleri ve senkron zaman damgaları. Başka hiçbir şey saklanmaz ve hiçbir veri cihazından çıkmaz. Ayrıntı: `docs/PRIVACY.md`.

İstenen izinler:

| İzin | Neden |
|---|---|
| `storage` | Ayarlar ve video kimliği indeksi |
| `alarms` | Periyodik senkronizasyon |
| `https://www.youtube.com/*` | Ana sayfayı filtrelemek ve listeleri okumak |

`tabs`, `cookies`, `webRequest` ve `<all_urls>` izinleri **istenmez**.

## Lisans

MIT
