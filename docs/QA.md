# Manuel test kontrol listesi

Her faz kapanışında baştan sona geçilir. Sonuç tarihiyle birlikte işaretlenir.

## Kurulum
- [ ] `npm ci && npm run build` hatasız
- [ ] `dist/` paketlenmemiş olarak yükleniyor, konsolda hata yok
- [ ] Eklenti simgesi ve popup açılıyor

## Ana sayfa (Faz 4 sonrası)
- [ ] Gizli listedeki videolar görünmüyor
- [ ] Gizli listenin kartı / rafı görünmüyor
- [ ] 5 sayfa sonsuz kaydırma sonrası hâlâ doğru
- [ ] Grid'de boşluk / kırık satır yok
- [ ] Master toggle kapatınca içerik sayfa yenilemeden geri geliyor
- [ ] Debug overlay açıkken gizlenenler kırmızı çerçeveli görünüyor

## Sınır durumları
- [ ] Oturum kapalıyken hiçbir şey gizlenmiyor, hata yok
- [ ] Hiç liste seçilmemişken ana sayfa değişmiyor
- [ ] İndeks bozuk/silinmişken ana sayfa boş kalmıyor (fail-open)
- [ ] Ana sayfa dışına gidip dönünce filtre yeniden çalışıyor
- [ ] Dar pencere ve farklı YouTube düzeni varyantında çalışıyor

## Temizlik
- [ ] Eklenti kaldırıldıktan sonra YouTube'da kalıntı stil/attribute yok
- [ ] Production derlemede `console.debug` çıktısı yok
