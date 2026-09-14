# Changelog

Bu proje [Semantic Versioning](https://semver.org/lang/tr/) kullanır.

## [Yayınlanmadı]

### Eklendi
- Faz 0: proje iskeleti, derleme betiği, lint kuralları, birim test altyapısı.
- Düzeltildi: `build.mjs` Windows'ta yolu bozuyordu (`fileURLToPath` kullanılıyor).
- `npm run zip` artık Windows'ta da çalışıyor (`Compress-Archive`).
- Dev bağımlılıkları güncellendi: vitest 5, eslint 10, esbuild 0.28. `npm audit` temiz.
