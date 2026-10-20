import { mkdir, readdir, copyFile } from 'node:fs/promises';
await mkdir('public/fonts', { recursive: true });
for (const filename of await readdir('node_modules/@fontsource/noto-sans-thai/files')) {
  if (filename.endsWith('.woff2') && /-(400|500|600|700)-normal/.test(filename)) {
    await copyFile(`node_modules/@fontsource/noto-sans-thai/files/${filename}`, `public/fonts/${filename}`);
  }
}
await copyFile('node_modules/@fontsource/noto-sans-thai/LICENSE','public/fonts/OFL.txt');
