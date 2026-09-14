# Başlangıç

> Agent kurallarını `CLAUDE.md`, agent promptunu `docs/AGENT-PROMPT.md` içinde bulacaksın.

Bu dosya sadece senin için. Repoya atmadan önce silebilirsin.

## 1. Klasörü yerine koy

Zip'i aç, çıkan `contactsheet-yt` klasörünü Masaüstü'ne taşı:

```
C:\Users\<kullanıcı>\Desktop\contactsheet-yt     (Windows)
~/Desktop/contactsheet-yt                        (macOS / Linux)
```

Klasör adı repo adıyla aynı olsun — sonradan GitHub'a atarken karışıklık olmaz.

## 2. Kurulumun çalıştığını doğrula

```bash
cd Desktop/contactsheet-yt
npm ci
npm run check
```

`npm run check` typecheck + lint + test + build çalıştırır. Hepsi yeşilse iskelet
sağlam demektir. Ardından Chrome'da `chrome://extensions` → Geliştirici modu →
**Paketlenmemiş öğe yükle** → `dist/` klasörünü seç. Simgeye bastığında popup
"Henüz liste okunmadı." yazmalı. Yazıyorsa mesajlaşma zinciri çalışıyor.

## 3. Kod yazmadan önce SPIKE'ı çalıştır  ← en önemli adım

Projenin tek gerçek riski şu: **"Daha sonra izle" listesinin içeriği sadece
çerezle okunabiliyor mu?** Okunamıyorsa mimarinin bir kısmı değişir. Bunu
öğrenmek 2 dakika sürüyor, öğrenmemek haftalar yakıyor.

1. YouTube'u aç, oturumun açık olsun.
2. F12 → Console.
3. Chrome ilk seferde "allow pasting" yazmanı ister, yaz.
4. `docs/spike/wl-check.js` dosyasının tamamını yapıştır, Enter.

Çıktıda dört satır önemli:

```
0 · session cookie readable from JS: true      → imza hesaplanabilir
1 · WL: ... N video on page 1                  → N>0 ise ilk sayfa çerezle geliyor
2 · WL continuation, cookies only : 0 video    → beklenen
2 · WL continuation, with signature: N video   → N>0 ise büyük listeler de çözüldü
3 · carrying isToggled: N                      → N>0 ise WL bedavaya geliyor
```

Kritik satır ikinci "2 ·" satırı. Orada video geliyorsa 100'den uzun listeler de
tam indekslenebilir demektir ve iframe'li ağır yola hiç gerek kalmaz.

Sonucu bana ilet ya da doğrudan `docs/adr/0002-playlist-erisimi.md` içine yaz.
Faz 3'ün tasarımı bu çıktıya göre kesinleşir.

## 4. Agent'ı başlat

Agent'a şunu ver:

> `docs/contactsheet-yt-spec.md` dosyasını oku. Faz 0 zaten uygulanmış durumda;
> mevcut kodu incele ve Faz 1'e geç. Faz 1 kabul kriterlerini karşıladığında dur,
> yaptıklarını maddeler halinde özetle, Faz 2 için onay iste. Spec'te olmayan
> hiçbir şey ekleme. Belirsizlik varsa kod yazmadan önce sor.

## 5. GitHub'a atma (çalıştığından emin olduğunda)

```bash
cd Desktop/contactsheet-yt
git init
git add .
git commit -m "chore: project scaffold and spec"
git branch -M main
git remote add origin https://github.com/Baran-Ozkann/contactsheet-yt.git
git push -u origin main
```

`.gitignore` `node_modules/`, `dist/`, `dist-zip/` ve ham fixture'ları zaten
dışarıda tutuyor. `BASLANGIC.md`'yi commit'ten önce silmek istersen sil.

Repo'yu açarken **private** başlat, çalıştığından emin olunca public'e çevir.
