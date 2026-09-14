/**
 * Build script. No bundler framework, on purpose: an extension that asks people
 * to trust it should have a build you can read in one sitting.
 *
 *   node build.mjs            development build
 *   node build.mjs --prod     minified, console.debug stripped
 *   node build.mjs --prod --zip  also produces dist-zip/contactsheet-yt-<version>.zip
 */
import { build } from 'esbuild';
import { cp, mkdir, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const exec = promisify(execFile);
// fileURLToPath, not new URL(...).pathname: on Windows the latter yields
// "/C:/Users/..." and every path.join after it produces "C:\C:\Users\...".
const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const prod = process.argv.includes('--prod');
const wantZip = process.argv.includes('--zip');

const shared = {
  bundle: true,
  target: 'chrome116',
  minify: prod,
  sourcemap: prod ? false : 'inline',
  legalComments: 'none',
  // Content scripts cannot be ES modules in MV3, so everything but the
  // service worker is bundled to a single classic script.
  drop: prod ? ['debugger'] : [],
  pure: prod ? ['console.debug'] : [],
  define: { __DEV__: String(!prod) },
};

async function run() {
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });

  await build({
    ...shared,
    entryPoints: [path.join(root, 'src/background/service-worker.ts')],
    outfile: path.join(dist, 'background/service-worker.js'),
    format: 'esm',
  });

  await build({
    ...shared,
    entryPoints: [path.join(root, 'src/content/main.ts')],
    outfile: path.join(dist, 'content/main.js'),
    format: 'iife',
  });

  await build({
    ...shared,
    entryPoints: [path.join(root, 'src/popup/popup.ts')],
    outfile: path.join(dist, 'popup/popup.js'),
    format: 'iife',
  });

  await cp(path.join(root, 'manifest.json'), path.join(dist, 'manifest.json'));
  await cp(path.join(root, '_locales'), path.join(dist, '_locales'), { recursive: true });
  await cp(path.join(root, 'icons'), path.join(dist, 'icons'), { recursive: true });
  await cp(path.join(root, 'src/popup/index.html'), path.join(dist, 'popup/index.html'));
  await cp(path.join(root, 'src/popup/popup.css'), path.join(dist, 'popup/popup.css'));

  const assets = path.join(root, 'src/assets');
  if (existsSync(assets)) {
    await cp(assets, path.join(dist, 'assets'), { recursive: true });
  }

  const bytes = await totalSize(dist);
  console.log(`built ${prod ? 'production' : 'development'} → dist/ (${(bytes / 1024).toFixed(1)} KB)`);
  if (bytes > 300 * 1024) {
    console.error('package exceeds the 300 KB budget (NFR-06)');
    process.exitCode = 1;
  }

  if (wantZip) await zip();
}

async function totalSize(dir) {
  let sum = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    sum += entry.isDirectory() ? await totalSize(p) : (await readFile(p)).byteLength;
  }
  return sum;
}

async function zip() {
  const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const out = path.join(root, 'dist-zip');
  await mkdir(out, { recursive: true });
  const file = path.join(out, `contactsheet-yt-${version}.zip`);
  await rm(file, { force: true });

  if (process.platform === 'win32') {
    await exec('powershell', [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${path.join(dist, '*')}' -DestinationPath '${file}' -Force`,
    ]);
  } else {
    await exec('zip', ['-r', '-q', '-X', file, '.'], { cwd: dist });
  }
  const digest = createHash('sha256').update(await readFile(file)).digest('hex');
  await writeFile(`${file}.sha256`, `${digest}  ${path.basename(file)}\n`);
  console.log(`packaged ${path.relative(root, file)}\nsha256 ${digest}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
