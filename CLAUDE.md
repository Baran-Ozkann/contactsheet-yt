# CLAUDE.md

Bu dosya her oturumun başında okunur. Kısa tutulmuştur; ayrıntı `docs/contactsheet-yt-spec.md` içindedir.

## Proje

Chrome/Edge MV3 eklentisi. Kullanıcının seçtiği YouTube oynatma listelerindeki videoları ve o listelerin kartlarını **YouTube ana sayfasından** gizler. Sunucusuz, hesapsız, telemetrisiz.

Tek doğruluk kaynağı: **`docs/contactsheet-yt-spec.md`**. Bu dosya ile spec çelişirse spec kazanır. Spec'te olmayan özellik yazılmaz.

## Komutlar

```bash
npm ci            # bağımlılıklar (npm install değil)
npm run check     # typecheck + lint + test + build — commit öncesi zorunlu
npm run build     # dist/ üretir, Chrome'a paketlenmemiş olarak yüklenir
npm test          # birim testleri
npm run zip       # yayın paketi + SHA-256
```

Chrome'da test: `chrome://extensions` → Geliştirici modu → Paketlenmemiş öğe yükle → `dist/`.

## Mimari — üç cümle

1. Service worker storage'ın **tek yazarıdır** ve ağa **hiç** çıkmaz.
2. Tüm YouTube istekleri content script içinden, `www.youtube.com` origin'inde yapılır (çerezler otomatik gider, `cookies` izni gerekmez). Bedeli: senkron yalnızca açık bir YouTube sekmesi varken çalışır.
3. Popup hiçbir iş yapmaz; her şeyi mesajla service worker'dan ister.

Yetenek katmanları (spec §4.0): K0 playlist kartları (ağ yok) · K1 ilk sayfa · K2 devam sayfaları · K3 WL toggle sinyali. Üsttekiler çökse bile alttakiler çalışmaya devam eder.

## Değişmez kurallar

Bunlar tercih değil, sözleşmedir. İhlali fazın reddidir.

1. **Fail-open.** Şüphe varsa kart gösterilir. İndeks yoksa, bozuksa, istek başarısızsa hiçbir şey gizlenmez. "Emin değilsem gizle" mantığı yazılamaz.
2. **İzin eklenmez.** `storage`, `alarms`, `https://www.youtube.com/*` dışına çıkmak açık onay ister. `tabs`, `cookies`, `webRequest`, `<all_urls>` istenmez.
3. **Bağımlılık eklenmez.** Dev bağımlılığı bile önce gerekçesiyle sorulur. `dependencies` boş kalır.
4. **`innerHTML` / `outerHTML` / `insertAdjacentHTML` / `eval` / `new Function` yok.** Lint zaten kırar; atlatılmaya çalışılmaz.
5. **CSS seçici stringi yalnızca `src/content/selectors.ts` içinde bulunur.** Başka dosyada seçici görürsen taşı.
6. **youtube.com dışına hiçbir istek yok.** Analitik, hata raporlama, güncelleme kontrolü, font CDN'i — hiçbiri.
7. **YouTube hesabına yazan uç nokta çağrılmaz.** Sadece okuma.
8. **`SAPISID` kilitli.** Yalnızca imza hesabı için, yalnızca istek anında okunur. Saklanmaz, loglanmaz, mesajla taşınmaz, hash dışında kullanılmaz. Tek dosyada izole.
9. **Gerçek veri commit edilmez.** Kendi hesabından alınan ham yanıtlar, video kimlikleri, ekran görüntülerindeki liste adları temizlenir.
10. **Production loglarında video kimliği veya URL parametresi bulunmaz.**

## Çalışma biçimi

- **Fazlar sırayla.** Faz atlama yok. Spec §9'daki kabul kriterleri karşılanmadan sonraki faza geçilmez.
- **Belirsizlikte sor.** Özellikle YouTube DOM yapısı, InnerTube alan adları ve kimlik doğrulama davranışı hakkında **tahmin yürütme** — çalıştır, gör, yaz. Spike çıktısı olmadan Faz 3 tasarlanmaz.
- **Kapsam genişletme yok.** İyi fikir `docs/BACKLOG.md`'ye yazılır, uygulanmaz.
- **Her mimari karar ADR'ye:** `docs/adr/NNNN-baslik.md` — bağlam, seçenekler, karar, sonuç.
- **Test aynı commit'te.** Ayrıştırıcı veya doğrulayıcı yazıyorsan testi yanında gelir.
- **Yorum ekonomisi.** *Ne* yaptığını değil, *neden* öyle yaptığını yaz. Özellikle YouTube'a özgü tuhaflıklarda.
- Konuşma dili Türkçe. Kod, commit mesajları, kod yorumları İngilizce. Arayüz metinleri `_locales` üzerinden.

## Faz protokolü

Her faz için sırayla:

1. `git checkout -b phase-N-kisa-ad`
2. Fazı uygula.
3. `npm run check` — yeşil olmadan devam yok.
4. Chrome'da elle doğrula (spec §8 / `docs/QA.md`).
5. `git add -A && git commit` (Conventional Commits).
6. **Push etme.** Raporu yaz ve dur.

Push'u ben yaparım. Sen rapor verir, onay beklersin.

### Faz raporu formatı

```markdown
## Faz N raporu — <ad>

**Yapılanlar**
- <madde> (`dosya/yolu.ts`)

**Kabul kriterleri**
| Kriter | Durum | Kanıt |
|---|---|---|
| <spec'ten birebir kriter> | ✅ / ❌ | <test adı, ölçüm, ekran doğrulaması> |

**Ölçümler**
- Test: N geçti · Build: N KB · <faza özgü ölçüm>

**Spec'ten sapmalar**
- <sapma + gerekçe + hangi ADR'ye yazıldı> — yoksa "yok"

**Bilinen eksikler**
- <sonraki faza devredilen>

**Önerilen commit**
`feat: ...`

**Onay bekleniyor:** Faz N+1'e geçebilir miyim?
```

Rapor kısa olsun. Kabul kriterleri tablosunda ❌ varsa faz kapanmamıştır; onay isteme, eksiği bitir.

## Mevcut durum

- **Faz 0 tamamlandı.** İskelet, derleme betiği (`build.mjs`, esbuild), lint güvenlik kuralları, vitest, manifest, ikonlar, TR/EN locale, CI, ADR-0001 hazır ve yeşil.
- `src/content/identify.ts` ve `src/core/playlist-input.ts` yazıldı ve test edildi.
- **Sıradaki: Faz 1.** Ama önce `docs/spike/wl-check.js` gerçek hesapta çalıştırılmalı (Faz 2 karar kapısı); çıktısı olmadan Faz 3'ün tasarımı belirsizdir.
