# ADR 0001 — Derleme yığını olarak esbuild + TypeScript

- Durum: kabul edildi
- Tarih: 2026-09-08

## Bağlam

MV3 eklentisinde üç ayrı giriş noktası var ve bunların modül formatları farklı:
service worker ES modülü olabilir, content script **olamaz** (MV3 içerik
betikleri klasik script olarak yüklenir), popup betiği de klasik olmalı.
Çoğu Vite tabanlı eklenti şablonu bu farkı bir eklenti (crxjs) ile gizler.

## Seçenekler

1. **Vite + @crxjs/vite-plugin** — hazır, ama davranışı gizli, sürüm değişimlerine
   duyarlı ve bir bağımlılık daha ekliyor.
2. **Vite (düz)** — çok girişli rollup yapılandırması content script formatı
   yüzünden yine elle ayarlanmak zorunda; kazanç az.
3. **esbuild + ~90 satırlık `build.mjs`** — üç ayrı bundle çağrısı, statik dosya
   kopyası, boyut kontrolü. Tamamı okunabilir.

## Karar

Seçenek 3. Gerekçe: kullanıcıdan YouTube oturumuna erişim izni isteyen bir
eklentinin derleme adımının tek oturumda okunabilir olması güvenlik iddiasının
parçasıdır. Ayrıca sıfır çalışma zamanı bağımlılığı hedefiyle (NFR-05) tutarlı.

## Sonuç

Spec §2.4'te geçen "Vite" ifadesi esbuild olarak güncellendi. HMR yok; geliştirme
döngüsü `npm run build` + eklentiyi yenile. Bu kabul edilebilir, çünkü asıl test
yüzeyi zaten gerçek YouTube sayfası.
