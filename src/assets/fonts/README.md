# Archivo

Spec §6.3 specifies a single family, **Archivo**, loaded locally. The Google
Fonts CDN is forbidden — by §6.3 explicitly, and by §7 rule 1, which bars any
remotely downloaded font.

**These binaries are not in the repo.** `popup.css` declares `@font-face` for
the three faces below; until the files are here the popup falls back to the
system sans stack, which is legible but is *not* the specified typography.

Drop these files in, exactly these names:

| File | Used for |
|---|---|
| `Archivo-Medium.woff2` | playlist names (500, 15px) |
| `Archivo-SemiBold.woff2` | heading (600, 17px) |
| `ArchivoCondensed-Regular.woff2` | counts and frame numbers (400, 11px) |

Archivo is under the SIL Open Font License 1.1. Download the family, subset it
to latin + latin-ext, convert to woff2, and add the OFL licence text alongside
these files.

`build.mjs` copies `src/assets/` to `dist/assets/` automatically, so no build
change is needed once the files are present. Keep an eye on NFR-06: the whole
package must stay under 300 KB, and three subset woff2 faces should land around
30–50 KB together.
