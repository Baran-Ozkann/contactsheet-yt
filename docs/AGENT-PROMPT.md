# Agent'a verilecek prompt

Bu dosya repoya bilerek konuldu: promptun sohbet geçmişinde kaybolmaması için.

---

## Başlangıç promptu (kopyala–yapıştır)

```
Bu repo bir Chrome MV3 eklentisi. Önce şu üç dosyayı oku, sonra başla:

1. CLAUDE.md              — değişmez kurallar ve faz protokolü
2. docs/contactsheet-yt-spec.md — tek doğruluk kaynağı (mimari, gereksinimler,
                            güvenlik kuralları, fazlar)
3. docs/adr/0001-yigin-secimi.md — derleme yığını kararı

Sonra mevcut kodu incele: src/ altındaki her dosyayı oku, `npm ci && npm run check`
çalıştır ve her şeyin yeşil olduğunu doğrula.

Faz 0 tamamlanmış durumda. Sen Faz 1'i uygulayacaksın.

Kurallar:
- CLAUDE.md'deki 10 değişmez kural ve faz protokolü geçerli.
- Spec'te olmayan hiçbir şey ekleme. İyi fikirler docs/BACKLOG.md'ye yazılır.
- Yeni bağımlılık ekleme, manifest izinlerine dokunma — ikisi de önce sorulur.
- Belirsizlik varsa kod yazmadan önce sor. YouTube'un DOM yapısı veya InnerTube
  alan adları hakkında tahmin yürütme.
- Faz 1 kabul kriterlerini (spec §9) karşıladığında DUR. Push etme.
  CLAUDE.md'deki rapor formatıyla raporunu yaz ve Faz 2 için onay iste.

Başla.
```

---

## Sonraki fazlar için

```
Faz <N> raporunu onaylıyorum, push ettim. Faz <N+1>'e geç.
Aynı protokol: kabul kriterlerini karşıla, dur, rapor ver, onay iste.
```

## Spike sonucunu verirken

```
docs/spike/wl-check.js çıktısı:

<konsol çıktısını buraya yapıştır>

Bu sonuca göre docs/adr/0002-playlist-erisimi.md dosyasını yaz: hangi yol
seçildi, elenenler neden elendi, hangi yetenek katmanı hangi yola bağlı.
ADR'yi yazdıktan sonra dur, onay iste. Faz 3'ü ADR onaylanmadan başlatma.
```

## Bir şey ters gittiğinde

```
Şu davranışı görüyorum: <gözlem>
Beklediğim: <beklenti>

Kök nedeni bul. Düzeltmeden önce nedenin ne olduğunu ve hangi dosyayı
değiştireceğini söyle. Semptomu bastıran çözüm önerme.
```

## Kapsam kayması başladığında

```
Bu spec'te yok. docs/BACKLOG.md'ye ekle ve mevcut faza dön.
```
