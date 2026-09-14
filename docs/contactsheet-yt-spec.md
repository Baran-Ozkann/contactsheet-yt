# Contact Sheet — YouTube Ana Sayfa Playlist Filtresi
### Agent Çalışma Dosyası · Spec v1.0

> Bu dosya bir **uygulama sözleşmesidir**. Agent bu dosyayı tek doğruluk kaynağı kabul eder.
> Burada yazmayan hiçbir özellik yazılmaz. Burada yasaklanan hiçbir şey yapılmaz.
> Bir çelişki veya belirsizlik bulursan **kod yazma, önce soru sor.**

---

## 0. Tanım ve Kapsam

**Ürün:** Chrome/Edge (Manifest V3) tarayıcı eklentisi. Kullanıcının seçtiği YouTube oynatma listelerindeki videoları ve o listelerin kendisini **YouTube ana sayfasından** gizler.

**Ana kullanım senaryosu:** Kullanıcı "Daha Sonra İzle" (WL) listesine 400 video atmıştır. Ana sayfa bu videoları tekrar tekrar önerir. Kullanıcı bu listeleri işaretler, ana sayfa temizlenir.

**Repo adı:** `contactsheet-yt`
**Görünen ad:** Contact Sheet
**Lisans:** MIT
**Dağıtım:** GitHub (kaynak + `.zip` release). Chrome Web Store **v1 kapsamında değildir.**

### Kapsam İçi (v1)
- `https://www.youtube.com/` ana sayfa akışı (rich grid).
- Video kartlarının gizlenmesi (seçili listelerde yer alan `videoId`'ler).
- Playlist kartlarının / shelf'lerin gizlenmesi (seçili `playlistId`'ler).
- Popup arayüzü: liste keşfi, işaretleme, senkronizasyon durumu.
- TR + EN yerelleştirme.

### Kapsam Dışı (v1 — yazma, teklif etme)
- Abonelikler, arama, izleme sayfası kenar çubuğu, Shorts rafı, ana sayfa dışı hiçbir yüzey.
- YouTube hesabında herhangi bir **yazma** işlemi (video silme, listeden çıkarma, "İlgilenmiyorum").
- Firefox / Safari portu.
- Bulut senkronizasyonu, hesap, sunucu, telemetri.
- Reklam engelleme, sponsor atlama, indirme.

---

## 1. Gereksinimler

### 1.1 Fonksiyonel (FR)

| ID | Gereksinim | Kabul |
|---|---|---|
| FR-01 | Kullanıcının kendi oynatma listeleri (özel + genel + WL) keşfedilir ve popup'ta listelenir. | Liste adı ve video sayısı doğru gösterilir. |
| FR-02 | Her liste için "gizle / gösterme" durumu ayrı ayrı ayarlanır ve kalıcı saklanır. | Tarayıcı yeniden başlatıldığında durum korunur. |
| FR-03 | Gizli işaretli listelerdeki tüm `videoId`'ler indekslenir ve yerelde tutulur. | 1000+ videoluk liste eksiksiz indekslenir (continuation takibi). |
| FR-04 | Ana sayfadaki bir video kartının `videoId`'si indeksle eşleşiyorsa kart DOM'dan gizlenir. | Sayfa yenilendiğinde ve sonsuz kaydırmada da geçerli. |
| FR-05 | Ana sayfadaki playlist kartı / raf, gizli işaretli bir `playlistId`'ye işaret ediyorsa gizlenir. | Raf başlığı da dahil, boş kalıntı bırakılmaz. |
| FR-06 | Gizlemede grid boşluk bırakmaz; YouTube'un kendi düzeni bozulmaz. | Satır sonu boşlukları yok, kaydırma kilitlenmiyor. |
| FR-07 | Senkronizasyon: manuel (popup butonu) + otomatik (varsayılan 6 saat, min 30 dk). | Son senkron zamanı ve kayıt sayısı popup'ta görünür. |
| FR-08 | Ana anahtar (master toggle) ile tüm gizleme anında kapatılır. | Kapatınca sayfa yenilemeden içerik geri gelir. |
| FR-09 | "Neden gizlendi" hata ayıklama modu: gizlenen kartlar silinmek yerine kırmızı çerçeveli/soluk gösterilir. | Sadece ayarlardan açılır, varsayılan kapalı. |
| FR-10 | Kullanıcı verisini dışa/içe aktarma (JSON: sadece ayarlar, indeks değil). | Dosya adı `contactsheet-settings-YYYYMMDD.json`. |
| FR-11 | Kullanıcı, otomatik keşif başarısız olsa bile bir listeyi **URL yapıştırarak** elle ekleyebilir. | `youtube.com/playlist?list=PL...`, `watch?v=..&list=PL...` ve çıplak `PL...` kimliği kabul edilir. Serbest metin liste **adı kabul edilmez.** |
| FR-12 | Yetenek katmanları bağımsız çalışır: içerik okunamasa bile playlist kartları gizlenmeye devam eder. | Katman 2 tamamen başarısızken Katman 0 çalışır durumda kalır (§4.0). |

### 1.2 Fonksiyonel Olmayan (NFR)

| ID | Gereksinim | Ölçüt |
|---|---|---|
| NFR-01 | Ana sayfa etkileşim gecikmesi ölçülebilir şekilde artmamalı. | Uzun görev (long task) eklenmemeli; her observer partisi **< 8 ms**. |
| NFR-02 | Eşleştirme sabit zamanlı olmalı. | `Set.has()` — kart başına O(1). Lineer arama yasak. |
| NFR-03 | Bellek tavanı. | Tüm indeks < 8 MB; 20.000 videoId'ye kadar bozulmadan çalışmalı. |
| NFR-04 | **Fail-open.** İndeks yoksa, bozuksa veya bir hata oluşursa hiçbir şey gizlenmez. | Hiçbir koşulda ana sayfa boş kalmamalı. |
| NFR-05 | Sıfır çalışma zamanı bağımlılığı (runtime dependency). | `package.json` içindeki `dependencies` boş. |
| NFR-06 | Paket boyutu < 300 KB (fontlar dahil). | CI'da kontrol edilir. |
| NFR-07 | Eklenti kapalıyken/kaldırıldığında YouTube'da hiçbir kalıntı bırakmamalı. | Enjekte edilen stil ve attribute'lar temizlenir. |

---

## 2. Sistem Mimarisi

### 2.1 Temel mimari kararı

> **Tüm YouTube ağ istekleri content script içinden, `www.youtube.com` origin'inde yapılır.**

Gerekçe: kullanıcının oturum çerezleri aynı-origin isteklerde otomatik gider. Service worker'a hiçbir kimlik bilgisi taşınmaz, `cookies` izni istenmez, CORS ile uğraşılmaz. Bunun bedeli: **senkronizasyon yalnızca açık bir YouTube sekmesi varken yapılabilir.** Bu kabul edilmiş bir kısıttır, arayüzde açıkça belirtilir.

### 2.2 Bileşenler

```
┌─────────────────────────────────────────────────────────────┐
│ POPUP (popup/)                                              │
│  Liste seçimi · master toggle · senkron durumu · ayarlar    │
└───────────────▲─────────────────────────────┬───────────────┘
                │ runtime.sendMessage         │
┌───────────────┴─────────────────────────────▼───────────────┐
│ SERVICE WORKER (background/)                                │
│  • Mesaj yönlendirici (tek giriş noktası)                   │
│  • chrome.alarms zamanlayıcı                                │
│  • Senkron orkestrasyonu: YT sekmesi bul → görevi ver       │
│  • Ayar + indeks yazımının TEK sahibi (yazma serileştirme)  │
│  • Ağ erişimi YOK                                           │
└───────┬──────────────────────────────────┬──────────────────┘
        │ storage.local                    │ tabs.sendMessage
┌───────▼──────────────┐   ┌───────────────▼──────────────────┐
│ STORAGE              │   │ CONTENT SCRIPT (content/)         │
│ settings · index     │   │  A) Indexer  — same-origin fetch  │
│ meta                 │   │  B) Filter   — DOM gizleme motoru │
└──────────────────────┘   └───────────────────────────────────┘
```

### 2.3 Modüller

| Modül | Dosya | Sorumluluk |
|---|---|---|
| `SettingsStore` | `src/core/settings.ts` | Şema doğrulamalı okuma/yazma, varsayılanlar, migration. |
| `IndexStore` | `src/core/index-store.ts` | `playlistId → videoId[]` kalıcılığı; birleşik `Set` üretimi. |
| `Messaging` | `src/core/messaging.ts` | Tipli mesaj sözleşmesi, `type` allow-list, timeout. |
| `Innertube` | `src/content/innertube.ts` | YouTube veri erişimi (bkz. §4). Ham veriyi doğrulanmış DTO'ya çevirir. |
| `PlaylistIndexer` | `src/content/indexer.ts` | Continuation döngüsü, backoff, iptal, ilerleme raporu. |
| `SelectorRegistry` | `src/content/selectors.ts` | **Tüm** CSS seçicileri burada, başka hiçbir yerde string seçici yok. |
| `DomScanner` | `src/content/scanner.ts` | MutationObserver, parti (batch) kuyruğu, kart→kimlik çıkarımı. |
| `Hider` | `src/content/hider.ts` | Attribute işaretleme; DOM'dan düğüm silmez. |
| `Bridge` | `src/content/bridge.ts` | (Yalnızca §4-C yolunda) MAIN world köprüsü. |
| `Logger` | `src/core/logger.ts` | Seviye kontrollü; `production` derlemede `debug` çıkarılır. |

### 2.4 Dizin yapısı

```
contactsheet-yt/
├─ src/
│  ├─ background/service-worker.ts
│  ├─ content/{main.ts,indexer.ts,innertube.ts,scanner.ts,hider.ts,selectors.ts,bridge.ts}
│  ├─ popup/{index.html,popup.ts,popup.css,sprocket.svg}
│  ├─ core/{settings.ts,index-store.ts,messaging.ts,schema.ts,logger.ts,types.ts}
│  └─ assets/fonts/            # yerel .woff2, CDN YOK
├─ _locales/{tr,en}/messages.json
├─ tests/{unit,fixtures}/
├─ docs/{ARCHITECTURE.md,SECURITY.md,THREAT-MODEL.md,PRIVACY.md,adr/}
├─ manifest.json
├─ build.mjs · tsconfig.json · package-lock.json
└─ README.md · CHANGELOG.md · LICENSE
```

### 2.5 Manifest (hedef hali — izin eklemek onay gerektirir)

```json
{
  "manifest_version": 3,
  "name": "__MSG_extName__",
  "default_locale": "tr",
  "version": "0.1.0",
  "permissions": ["storage", "alarms"],
  "host_permissions": ["https://www.youtube.com/*"],
  "background": { "service_worker": "background/service-worker.js", "type": "module" },
  "content_scripts": [{
    "matches": ["https://www.youtube.com/*"],
    "js": ["content/main.js"],
    "run_at": "document_start",
    "all_frames": false
  }],
  "action": { "default_popup": "popup/index.html" },
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'none'; base-uri 'none'"
  }
}
```

---

## 3. Veri Modeli

```ts
type PlaylistId = string;   // "WL" | "LL" | "PL..."
type VideoId    = string;   // /^[A-Za-z0-9_-]{11}$/

interface Settings {
  schemaVersion: 1;
  enabled: boolean;               // master toggle, default true
  debugOverlay: boolean;          // default false
  syncIntervalMinutes: number;    // default 360, min 30
  playlists: Record<PlaylistId, {
    title: string;                // yalnızca gösterim, textContent olarak
    hidden: boolean;
    itemCount: number | null;
    lastSyncedAt: number | null;  // epoch ms
  }>;
}

interface IndexEntry {
  playlistId: PlaylistId;
  videoIds: VideoId[];
  syncedAt: number;
  complete: boolean;              // continuation tamamlandı mı
}
```

**Saklama anahtarları:** `settings`, `index:<playlistId>`, `meta`.
İndeks **liste başına ayrı anahtarda** tutulur (tek dev nesne yazımı yasak — yazma çakışmasını ve gereksiz serileştirmeyi önler).

**Türetilmiş yapı:** content script açılışta gizli listelerin `videoIds`'lerini tek bir `Set<VideoId>` içinde birleştirir. Ayar değişiminde yeniden kurulur.

---

## 4. YouTube Veri Erişimi

Projenin tek gerçek teknik riski burada. Bu bölüm iki soruyu ayırır — çoğu tasarım
hatası ikisini karıştırmaktan çıkar:

1. **Hangi listeler?** → kimlik elde etme. Kolay, düşük riskli.
2. **O listelerde hangi videolar var?** → içerik okuma. Zor kısım burası.

### 4.0 Yetenek katmanları

Eklenti tek parça değildir. Dört katman **bağımsız** çalışır; üsttekiler
çalışmasa bile alttakiler çalışmaya devam eder. Bu, projenin en önemli
dayanıklılık kararıdır: YouTube bir uç noktayı kırdığında eklenti tamamen ölmez,
yeteneği azalır.

| Katman | Ne gizler | Ne gerekir | Risk |
|---|---|---|---|
| **K0** | Playlist kartları ve rafları | Sadece `playlistId` — ağ isteği yok | Yok |
| **K1** | ≤100 videoluk listelerin videoları | Playlist sayfası HTML'i (§4.2 Yol 1) | Düşük |
| **K2** | Büyük listelerin tamamı | InnerTube + devam token'ı (§4.2 Yol 2) | Orta |
| **K3** | "Daha sonra izle"yi bedavaya | Kart üzerindeki toggle durumu (§4.2 Yol 3) | Doğrulanmalı |

**Kural:** K0 her koşulda çalışmak zorundadır ve hiçbir ağ hatası onu düşüremez.
Popup, hangi listenin hangi katmanda filtrelendiğini gösterir; kullanıcı "liste
gizli işaretli ama videoları hâlâ görünüyor" durumunu tahmin etmek zorunda kalmaz.

### 4.1 Liste kimliğini elde etme

**Birincil — otomatik keşif.** Kullanıcının kendi listeleri okunur (playlist
kütüphanesi sayfası veya `browseId: "FEplaylists"`). Kullanıcı hiçbir şey
yazmaz. Düşük riskli, çünkü başarısızlığı ölümcül değil.

**Her zaman açık — elle ekleme (FR-11).** Popup'ta bir yapıştırma alanı bulunur.
Otomatik keşif kırıldığında, liste yeni açıldığında veya kullanıcı yalnızca tek
bir listeyi filtrelemek istediğinde bu yol kullanılır.

> **Kullanıcıdan liste *adı* istenmez.** Ad benzersiz değildir, yeniden
> adlandırılır, yazım hatasına açıktır ve eşleştirme için `playlistId` gerekir.
> Kullanıcı URL yapıştırır, eklenti `list` parametresini çıkarır. Çıplak `PL...`
> / `WL` / `LL` kimliği de kabul edilir. Ayrıştırma `parsePlaylistInput()`
> içindedir ve saf fonksiyondur (test edilebilir).

Elle eklenen listenin başlığı ilk senkronda doldurulur; doldurulamazsa kimliğin
kendisi gösterilir. Başlık yalnızca gösterim içindir, hiçbir eşleştirmede
kullanılmaz.

### 4.2 Liste içeriğini okuma

Sırayla dene, ilk çalışan kazanır. Faz 2'de **ölçülerek** doğrulanır; tahminle
ilerlemek yasaktır.

**Yol 1 — Playlist sayfası HTML'i (ilk sayfa)**
`fetch('https://www.youtube.com/playlist?list=<ID>', {credentials:'include'})`
→ HTML içinden `ytInitialData` çıkar → `playlistVideoRenderer.videoId` topla.
Sunucu tarafı render normal bir gezinme gibi çalıştığı için **yalnızca çerez
yeterlidir**; ek başlık gerekmez. WL dahil çalışması beklenir. İlk ~100 öğe gelir.

**Yol 2 — InnerTube + `SAPISIDHASH` (devam sayfaları) — ana yol**
Devam token'ları `POST /youtubei/v1/browse` ile çözülür. Bu XHR uç noktası çerezle
yetinmez, YouTube'un kendi istemcisinin gönderdiği imzayı bekler:

```
ts   = Math.floor(Date.now() / 1000)
hash = SHA-1( `${ts} ${SAPISID} https://www.youtube.com` )   // crypto.subtle
Authorization: SAPISIDHASH ${ts}_${hash}
```

`SAPISID` çerezi HttpOnly değildir (YouTube'un kendi JS'i de aynı hesabı yapar) ve
content script `document.cookie` üzerinden okuyabilir. **Bunun için `cookies`
izni gerekmez** — sadece DOM erişimidir. Kullanımı §7 kural 15 ile sınırlandırılır.
`SAPISID` yoksa `__Secure-3PAPISID` denenir; ikisi de yoksa Yol 2 devre dışı
kalır ve liste K1 seviyesinde (ilk sayfa) indekslenir, `complete:false` yazılır.

**Yol 3 — Kart üzerindeki "daha sonra izle" durumu (yalnızca WL, doğrulanacak)**
Ana sayfa kartlarının küçük resim katmanında bir "daha sonra izle" geçiş düğmesi
bulunur. Bu düğmenin *zaten eklenmiş* durumu DOM'da (veya `ytInitialData` içindeki
`thumbnailOverlayToggleButtonRenderer.isToggled` alanında) taşınıyorsa, WL için
**hiçbir ağ isteği gerekmez**: kartın kendisi zaten listede olduğunu söylüyordur.
Faz 2'de doğrulanacak sorular: (a) alan ilk render'da var mı yoksa yalnız hover'da
mı oluşuyor, (b) tüm düzen varyantlarında var mı. Varsa WL için birincil yol
budur ve Yol 1–2 yalnızca diğer listeler için kullanılır. Yoksa sessizce elenir.

**Yol 4 — Aynı-origin gizli iframe (son çare)**
YouTube `X-Frame-Options: SAMEORIGIN` gönderir; youtube.com sayfası içine
youtube.com iframe'i gömülebilir. `1×1`, `visibility:hidden` iframe'de playlist
sayfası açılır, `all_frames: true` ile enjekte olan content script içeriden DOM'u
okur, sanal kaydırmayla devamını yükler, `postMessage` ile ana çerçeveye verir.
Ağır ve yavaş; yalnızca Yol 2 kalıcı olarak çalışmazsa açılır.

### 4.3 Her yol için zorunlu davranış

- Sıralı istek, eşzamanlılık 1. Paralel çekim yasak.
- İstekler arası **min 400 ms** bekleme.
- Hata/429'da üstel backoff: 1s → 2s → 4s → 8s, max 4 deneme, sonra vazgeç ve
  **kısmi indeksi `complete:false` ile kaydet.** Kısmi indeks yine de kullanılır;
  eksik video gizlenmez, yanlış video gizlenmez.
- Liste başına sert tavan: 200 devam sayfası.
- Sekme kapanır veya gezinme olursa senkron temiz iptal (`AbortController`).
- Hiçbir hata yolunda gizleme davranışı **artmaz** (fail-open, NFR-04).

### 4.4 Karar kapısı

Faz 2 sonunda `docs/adr/0002-playlist-erisimi.md` yazılır ve şunları içerir:
WL ve normal liste için ayrı ayrı ölçüm çıktısı, Yol 3'ün var olup olmadığı,
seçilen kombinasyon, elenenlerin gerekçesi, hangi katmanların hangi yola bağlı
olduğu. **Bu ADR onaylanmadan Faz 3 başlamaz.**

## 5. DOM Gizleme Motoru

### 5.1 Enjeksiyon
`document_start`'ta tek bir `<style id="cs-style">` enjekte edilir:
```css
[data-cs-hidden="1"] { display: none !important; }
[data-cs-hidden="1"][data-cs-debug="1"] {
  display: block !important; opacity: .28; outline: 2px solid #D0342C;
}
```
Gizleme **yalnızca attribute yazarak** yapılır. `element.remove()`, `style.display` yazımı, sınıf enjeksiyonu **yasak** — YouTube'un kendi sanal listeleyicisi bozulur.

### 5.2 Kart → kimlik çıkarımı
1. Öğe içindeki ilk `a[href]` bul.
2. `new URL(href, location.origin)` ile ayrıştır. **Regex ile URL ayrıştırma yasak.**
3. `pathname === '/watch'` → `searchParams.get('v')` = videoId.
4. `pathname === '/playlist'` → `searchParams.get('list')` = playlistId.
5. `/watch` üzerinde `list` parametresi de varsa: videoId **ve** playlistId eşleşmesi ayrı ayrı denenir.
6. Hiçbiri yoksa → dokunma (fail-open).

### 5.3 Seçici stratejisi
`selectors.ts` katmanlı liste tutar; ilk eşleşen kazanır:
```
container : ytd-rich-grid-renderer, ytd-two-column-browse-results-renderer
item      : ytd-rich-item-renderer, ytd-rich-grid-media, yt-lockup-view-model
section   : ytd-rich-section-renderer, ytd-rich-shelf-renderer
```
YouTube A/B testleri bu isimleri değiştirir. Bu yüzden: **seçici bulunamazsa jenerik geri düşüş** — grid'in doğrudan çocuklarını gez, içinde `/watch` linki olan her düğümü aday say. Ve motor asla "hiç öğe bulamadım" durumunda agresifleşmez.

### 5.4 Gözlemleme
- Tek bir `MutationObserver` (`childList:true, subtree:true`) grid konteynerine bağlanır; `document.body`'ye **bağlanmaz.**
- Eklenen düğümler kuyruğa alınır, `requestAnimationFrame` içinde partiler halinde işlenir; parti başına max 100 düğüm, 8 ms bütçe aşılırsa kalan bir sonraki kareye devreder.
- İşlenen düğüm `data-cs-seen="1"` ile damgalanır, tekrar işlenmez.
- SPA gezinmesi: `yt-navigate-finish` olayı dinlenir; ana sayfa dışına çıkılınca observer sökülür, dönülünce yeniden bağlanır.
- `document.title`/URL polling **yasak.**

### 5.5 Yanıp sönme (FOUC)
Kart eklendiği kare içinde karara varıldığı için titreme ihmal edilebilir. **Tüm grid'i önden gizleyip sonra göstermek yasaktır** — indeks yüklenemezse kullanıcı boş ana sayfa görür (NFR-04 ihlali).

---

## 6. Arayüz Tasarım Spesifikasyonu

> Bu bölüm bağlayıcıdır. Agent tasarımı yeniden yorumlamaz, burada yazılanı uygular.
> Yasak: yuvarlak köşeli kart yığını, yumuşak gri gölge, degrade, cam efekti, mor/indigo aksан, ikon kütüphanesi, emoji, tüm-büyük-harf etiket bandı, "→" eklenmiş buton metni.

### 6.1 Konsept
**Kontak baskı (contact sheet).** Fotoğrafçı, negatif şeridinin baskısını alır ve basılmayacak kareleri yağlı kalemle çizer. Bu eklentinin işi tam olarak budur: hangi karenin görüneceğini seçmek. Arayüz bir kontak baskı şeridi gibi görünür; gizlenen liste, üzerine çizilen bir çarpı işaretiyle elenir.

### 6.2 Token'lar
```
--film      #2B2F27   zemin (soğuk zeytin-gri; siyah DEĞİL)
--frame     #343A31   kare zemini
--emulsion  #D6D2C4   ana metin (gümüşi kırık beyaz)
--latent    #8E9184   ikincil metin
--grease    #D0342C   yağlı kalem kırmızısı — yalnız çarpı ve gizli sayaç
--safelight #E8A33D   amber — yalnız senkron durumu
```
İki aksan bilinçlidir: kırmızı *karar*, amber *süreç* anlatır. Rol karıştırılmaz.

### 6.3 Tipografi
Tek aile: **Archivo** (yerel `.woff2`, `assets/fonts/`; Google Fonts CDN **yasak**).
- Liste adı: Archivo 500, 15px / 1.25, cümle düzeni.
- Video sayısı ve kenar numaraları: Archivo Condensed 400, 11px, `font-variant-numeric: tabular-nums`.
- Başlık: Archivo 600, 17px, `letter-spacing: -0.01em`.
Harf aralığı açılmış büyük harfli etiket kullanılmaz.

### 6.4 Yerleşim (380 × 520 popup)

```
┌──┬──────────────────────────────────────────────┐
│▪ │  Ana sayfada gizlenenler          [ ●─── ]   │  başlık + master
│  │  3 liste, 1.284 video                        │
│▪ ├──────────────────────────────────────────────┤
│  │ 01   Daha sonra izle              412 video  │
│▪ │      ╳ çapraz yağlı kalem çizgisi            │  ← gizli
│  ├──────────────────────────────────────────────┤
│▪ │ 02   Müzik                        193 video  │  ← görünür
│  ├──────────────────────────────────────────────┤
│▪ │ 03   Kaydedilenler                679 video  │
│  │      ╳                                       │
│▪ ├──────────────────────────────────────────────┤
│  │  Son senkron 14:32                [Yenile]   │
└──┴──────────────────────────────────────────────┘
 ↑ 16px perforasyon şeridi (SVG), tam yükseklik
```

- Sol kenardaki **perforasyon şeridi** tasarımın taşıyıcı öğesidir; başka hiçbir yerde süsleme yapılmaz.
- Satır numaraları (01, 02…) film karesi numaralandırmasıdır — içerik gerçekten sıralı bir şerit olduğu için meşrudur.
- Satırlar arası ayrım hairline çizgi değil, `--film` renginde 2px kare arası boşluktur.
- Hizalama: sol; sayılar sağa dayalı.

### 6.5 Etkileşim
- Her satır: `<button role="switch" aria-checked>`. Tüm satır tıklanabilir.
- Açma/kapama: `<svg>` içindeki elle çizilmiş, hafif titrek iki `<path>` çarpı, `stroke-dasharray/offset` ile **180 ms**'de çizilir (`cubic-bezier(.2,.7,.3,1)`), ikinci vuruş 60 ms gecikmeli. Kapatmada aynı animasyon ters çalışır.
- Senkron sırasında: perforasyon deliklerinin `fill`'i sırayla `--safelight`'a döner (2s döngü). Başka spinner yok.
- Odak halkası: 2px `--safelight` outline, `outline-offset: 2px`. `:focus-visible` kullanılır.
- `prefers-reduced-motion: reduce` → çarpı anında görünür, perforasyon animasyonu durur, durum metinle bildirilir.
- Sayfa yüklenirken sıralı giriş animasyonu **yok.**

### 6.6 Metinler (TR)
| Durum | Metin |
|---|---|
| Başlık | Ana sayfada gizlenenler |
| Alt bilgi | 3 liste, 1.284 video |
| Boş | Henüz liste okunmadı. YouTube'u aç, listelerini buradan getirelim. |
| Sekme yok | Senkronizasyon için açık bir YouTube sekmesi gerekiyor. |
| Hata | Listeler alınamadı. YouTube yanıtı beklenenden farklı. Tekrar dene. |
| Kısmi | Bu liste kısmen indekslendi (412/679). Yenile. |
| Buton | Yenile → çalışırken "Yenileniyor" → biterken "Yenilendi" |

Hata metni özür dilemez, ne olduğunu söyler ve ne yapılacağını gösterir.

### 6.7 Erişilebilirlik
- Kontrast: `--emulsion` / `--film` ≥ 7:1; `--latent` / `--film` ≥ 4.5:1 (doğrula, gerekirse token'ı ayarla).
- Tam klavye gezinmesi: Tab + Space/Enter.
- Durum değişimi `aria-live="polite"` bölgede duyurulur.
- Renk tek başına anlam taşımaz (çarpı işareti + `aria-checked`).

---

## 7. Güvenlik Kuralları

### 7.1 Tehdit modeli (kısa)
| Tehdit | Önlem |
|---|---|
| YouTube'dan gelen kötü/beklenmedik veri | Tüm veri **güvenilmez** kabul edilir; şema doğrulama + boyut/derinlik limiti. |
| XSS (popup'a liste adı enjeksiyonu) | Yalnız `textContent`. `innerHTML` yasak. |
| Ayrıcalık yükselmesi (MAIN world köprüsü) | Nonce'lu, `origin` kontrollü, sabit şemalı `postMessage`; kod/fonksiyon taşınmaz. |
| Tedarik zinciri | Sıfır runtime bağımlılığı, `npm ci`, lockfile commit, dev bağımlılıkları sabitlenmiş sürüm. |
| Veri sızıntısı | youtube.com dışına **hiçbir** ağ isteği yok. |
| İzin genişlemesi | İzinler kilitli; değişiklik onay gerektirir. |

### 7.2 Kesin kurallar (ihlali = fazın reddi)

1. **Uzak kod yasak.** CDN, `eval`, `new Function`, `setTimeout("string")`, uzaktan indirilen script/stil/font yok. MV3 varsayılan CSP gevşetilmez.
2. **`innerHTML` / `outerHTML` / `insertAdjacentHTML` yasaktır.** DOM API veya `textContent` kullanılır. ESLint kuralıyla zorunlu kılınır.
3. **İzin minimumu.** Yalnız `storage`, `alarms` + `https://www.youtube.com/*`. `tabs`, `cookies`, `webRequest`, `scripting`, `<all_urls>`, `declarativeNetRequest` **istenmez.** (`chrome.tabs.query` host izniyle çalışır; `tabs` izni gerekmez.)
4. **youtube.com dışına ağ isteği yok.** Analitik, hata raporlama, güncelleme kontrolü, "bağış" pixel'i — hiçbiri.
5. **Kimlik bilgisi saklanmaz.** Token, çerez, API anahtarı, `SAPISID` diske yazılmaz. InnerTube anahtarı yalnız bellekte, sekme ömrü kadar tutulur.
6. **Kişisel veri diske yazımı sınırlı.** Yalnızca `playlistId`, liste başlığı, `videoId` listesi, zaman damgaları. İzleme geçmişi, arama, öneri verisi, kanal listesi **toplanmaz.**
7. **Gelen JSON doğrulanır.** `videoId` regex `^[A-Za-z0-9_-]{11}$`; `playlistId` `^[A-Za-z0-9_-]{2,64}$`; liste başına max 50.000 öğe; JSON gövde max 8 MB; ayrıştırma derinliği sınırlı. Doğrulamayan kayıt sessizce atılır.
8. **Mesajlaşma allow-list'tir.** `sender.id !== chrome.runtime.id` olan mesaj reddedilir. Bilinmeyen `type` reddedilir. Content script'ten gelen veri SW'de yeniden doğrulanır.
9. **Sayfaya yazma yok.** YouTube'un `window` nesnesi, `fetch`, `XMLHttpRequest`, prototype'ları yamalanmaz (monkey-patch yasak).
10. **YouTube hesabına yazan hiçbir uç nokta çağrılmaz.** Yalnız `browse` benzeri okuma. Bu kural kod incelemesinde açıkça kontrol edilir.
11. **Fixture'lar anonimdir.** Test verisindeki gerçek `videoId`, kanal adı, kullanıcı adı, çerez, oturum kimliği temizlenir. Ham YouTube yanıtı repoya commit edilmez.
12. **`.gitignore` sıkı.** `dist/`, `node_modules/`, `*.local.json`, `fixtures/raw/`, `.env*`.
13. **Loglama.** Production derlemede `console.debug` çıkarılır; hiçbir seviyede `videoId` listesinin tamamı veya URL parametreleri loglanmaz.
14. **Sürüm bütünlüğü.** Release zip'i CI'da temiz checkout'tan üretilir, SHA-256 özeti release notuna yazılır.
15. **`SAPISID` kullanımı kilitlidir.** Çerez değeri yalnızca `crypto.subtle` ile
    imza hesaplamak için, yalnızca content script içinde, yalnızca istek anında
    okunur. Değişkende tutulmaz, `storage`'a yazılmaz, loglanmaz, mesajla
    taşınmaz, hash dışında hiçbir yerde kullanılmaz. Hesap yapan fonksiyon tek
    dosyada izole edilir ve girdisini dışarı sızdırmadığı testle gösterilir.
    `cookies` izni yine istenmez.

---

## 8. Test Stratejisi

- **Birim (vitest):** URL ayrıştırma, `videoId` doğrulama, `ytInitialData` ayrıştırıcı, continuation zinciri, settings migration, `Set` birleştirme. Hedef: `core/` ve ayrıştırıcılarda **%85+ satır kapsamı.**
- **Fixture:** anonimleştirilmiş JSON/HTML örnekleri — normal liste, WL, boş liste, tek sayfa, 3 continuation'lı liste, bozuk/kesik JSON, beklenmedik şema.
- **DOM testi (jsdom):** kaydedilmiş ana sayfa parçası üzerinde scanner+hider; iki farklı YouTube düzeni varyantı.
- **Manuel kontrol listesi (her fazda, `docs/QA.md`):** oturum açık/kapalı, boş ana sayfa, sonsuz kaydırma 5 sayfa, tema değişimi, dar pencere, master toggle açma-kapama, eklenti kaldırma sonrası kalıntı.
- **Performans:** 300 kartlık gridde parti süreleri `performance.measure` ile ölçülür, NFR-01 doğrulanır.
- **CI:** typecheck + lint + test + boyut kontrolü. Kırmızı CI ile faz kapanmaz.

---

## 9. Fazlar

Her faz **ayrı bir dal ve ayrı bir PR**'dır. Faz sonunda agent durur, çıktıyı özetler, onay bekler.

### Faz 0 — İskelet
**Yapılacak:** Repo, TypeScript + esbuild yapılandırması, ESLint (`no-innerHTML` dahil özel kurallar), vitest, MV3 manifest, MIT lisans, README taslağı, `docs/ADR-0001` (yığın seçimi), CI iş akışı.
**Bitti sayılır:** Eklenti paketlenmemiş olarak yüklenir, konsolda hata yok, `npm run build && npm test` yeşil.

### Faz 1 — Çekirdek
**Yapılacak:** `types.ts`, `schema.ts` (doğrulayıcılar), `SettingsStore`, `IndexStore`, `Messaging` sözleşmesi, `Logger`. Service worker mesaj yönlendirici (henüz iş yapmıyor).
**Bitti sayılır:** Birim testleri geçer; bozuk/eksik/yabancı alanlı ayar nesnesi güvenli varsayılana düşer.

### Faz 2 — SPIKE + Liste Kimliği  ⚠️ *karar kapısı*
**Yapılacak:** `docs/spike/wl-check.js` gerçek hesapta çalıştırılır; §4.2'deki Yol 1/2/3 ölçülür. `parsePlaylistInput()` (elle ekleme, FR-11) yazılır ve test edilir. Otomatik keşif denenir. `docs/adr/0002-playlist-erisimi.md` yazılır.
**Bitti sayılır:** WL ve normal liste için ölçüm çıktısı kayıtlı; Yol 3'ün var olup olmadığı kesin; hangi katmanın hangi yola bağlı olduğu ADR'de. **ADR onaylanmadan Faz 3 başlamaz.**

### Faz 3 — İndeksleme Motoru
**Yapılacak:** `PlaylistIndexer`: Yol 1 ile ilk sayfa, Yol 2 ile devam sayfaları, backoff, iptal, ilerleme olayları, kısmi kayıt. İmza hesabı izole dosyada (§7 kural 15). SW tarafında alarm zamanlayıcı + YT sekmesi bulma + görev dağıtımı. Yazma serileştirme.
**Bitti sayılır:** 500+ videoluk bir liste eksiksiz indekslenir; Yol 2 devre dışı bırakıldığında liste K1 seviyesinde kısmi indekslenir ve `complete:false` yazılır; ikinci senkron çakışma üretmez; imza fonksiyonu çerez değerini dışarı sızdırmıyor (test).

### Faz 4 — Gizleme Motoru
**Yapılacak:** `SelectorRegistry`, `DomScanner`, `Hider`, stil enjeksiyonu, SPA gezinme yönetimi, parti bütçesi, debug overlay.
**Bitti sayılır:** Gerçek ana sayfada gizli listedeki videolar ve playlist kartları görünmez; 5 sayfa sonsuz kaydırmada da geçerli; grid boşluk vermiyor; NFR-01 ölçümü belgelenmiş; master toggle kapatınca içerik geri geliyor.

### Faz 5 — Arayüz
**Yapılacak:** §6'nın birebir uygulaması. Popup, master toggle, liste satırları, elle ekleme alanı (FR-11), katman göstergesi (§4.0), senkron durumu, boş/hata/kısmi durumlar, `_locales` TR+EN, yerel fontlar.
**Bitti sayılır:** Tasarım kontrol listesi geçer (perforasyon şeridi, çarpı animasyonu, iki aksan rolü, odak halkası, reduced-motion, kontrast ölçümleri); klavyeyle tam kullanılabilir; ekran görüntüsü `docs/`'a eklenmiş.

### Faz 6 — Dayanıklılık
**Yapılacak:** Alternatif YouTube düzenleri, oturum kapalı hâli, sıfır liste, çok büyük liste (10k+), seçici geri düşüşü, ayar dışa/içe aktarma, migration testi.
**Bitti sayılır:** `docs/QA.md` kontrol listesi baştan sona manuel olarak geçilmiş ve işaretlenmiştir.

### Faz 7 — Güvenlik Sertleştirme
**Yapılacak:** §7 maddelerinin tek tek denetimi, `docs/THREAT-MODEL.md` + `docs/SECURITY.md` + `docs/PRIVACY.md`, izin gerekçelendirmesi, bağımlılık denetimi, production derlemesinde log temizliği doğrulaması.
**Bitti sayılır:** 14 güvenlik kuralı için kanıt tablosu (kural → nerede sağlandı → nasıl doğrulandı) yazılmıştır.

### Faz 8 — Yayın
**Yapılacak:** README (ne yapar, ne yapmaz, kısıtlar, kurulum, gizlilik özeti, ekran görüntüleri), CHANGELOG, SemVer `v0.1.0` etiketi, CI ile üretilmiş zip + SHA-256, `CONTRIBUTING.md`, issue şablonları.
**Bitti sayılır:** Temiz bir makinede README talimatlarıyla kurulum baştan sona çalışır.

---

## 10. Agent Çalışma Kuralları

1. **Sırayla ilerle.** Faz atlama yok. Her faz sonunda dur, değişiklikleri ve kabul kriterlerinin karşılanma durumunu özetle, onay iste.
2. **Belirsizlikte sor, uydurma.** Özellikle YouTube DOM yapısı, InnerTube alan adları ve kimlik doğrulama davranışı hakkında tahmin yürütme — çalıştır, gör, yaz.
3. **Kapsam genişletme yok.** Bu dosyada olmayan özellik önerilebilir, ancak `docs/BACKLOG.md`'ye yazılır, uygulanmaz.
4. **Bağımlılık ekleme yok.** Yeni bir paket (dev dahil) gerekiyorsa önce gerekçesiyle onay iste.
5. **İzin ekleme yok.** `manifest.json` içindeki `permissions`/`host_permissions` değişikliği açık onay gerektirir.
6. **Seçiciler tek dosyada.** `selectors.ts` dışında CSS seçici string'i yazma.
7. **Her mimari karar ADR'ye.** `docs/adr/NNNN-baslik.md` — bağlam, seçenekler, karar, sonuç. Minimum: yığın seçimi, playlist erişim yolu, storage şeması, gizleme yöntemi, senkron zamanlaması.
8. **Commit disiplini.** Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`). Küçük ve odaklı commit'ler. Faz başına tek PR.
9. **Test önce/beraber.** Ayrıştırıcı veya doğrulayıcı yazıyorsan testi aynı commit'te gelir.
10. **Yorum satırı ekonomisi.** *Ne* yaptığını değil, *neden* öyle yaptığını yaz — özellikle YouTube'a özgü tuhaflıklarda.
11. **Gerçek veri commit etme.** Kendi hesabından alınan ham yanıtları, `videoId`'leri, ekran görüntülerindeki liste adlarını temizle.
12. **Fail-open'ı asla bozma.** Şüphe varsa kart gösterilir. "Emin değilsem gizle" mantığı yazılamaz.
13. **Konuşma dili Türkçe, kod ve commit mesajları İngilizce.** Kullanıcıya dönen arayüz metinleri `_locales` üzerinden, koda gömülü değil.
14. **Anlatma, ölç.** "Performans iyi" demek yeterli değil; `performance.measure` çıktısı ver.

---

## 11. Bilinen Riskler

| Risk | Etki | Yanıt |
|---|---|---|
| InnerTube devam sayfaları imza ister | Büyük listeler eksik kalır | `SAPISIDHASH` (§4.2 Yol 2); olmazsa K1 seviyesinde kısmi indeks + Yol 4 |
| Otomatik keşif kırılır | Liste bulunamaz | Elle URL ekleme (FR-11) her zaman açık |
| YouTube DOM etiketlerini değiştirir | Gizleme sessizce durur | Katmanlı seçici + jenerik geri düşüş + debug overlay |
| Sadece YT sekmesi açıkken senkron | Kullanıcı beklentisi | Arayüzde açık mesaj, sekme açılınca otomatik dene |
| İnternal API kullanımı YouTube ToS'a göre gri alan | Store yayını riski | v1 GitHub-only; README'de açık uyarı |
| Çok büyük listeler (10k+) | Bellek/süre | Sayfa tavanı, kısmi indeks, `complete:false` göstergesi |
| A/B testli farklı ana sayfa düzenleri | Kısmi çalışma | Faz 6'da en az iki varyantla test |

---

## 12. Başlangıç Komutu (agent'a verilecek ilk mesaj)

> `contactsheet-yt-spec.md` dosyasını oku. Faz 0'ı uygula. Faz 0 kabul kriterlerini karşıladığında dur, yaptıklarını ve kriter karşılama durumunu maddeler halinde özetle, Faz 1 için onay iste. Bu spec'te olmayan hiçbir şey ekleme. Belirsizlik varsa kod yazmadan önce sor.
