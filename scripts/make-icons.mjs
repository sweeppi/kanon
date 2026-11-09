// Генерация иконок PWA без зависимостей: PNG-кодировщик на zlib + простая растеризация прямоугольников.
// Запуск: npm run icons
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons');
mkdirSync(OUT, { recursive: true });

const BG = [0x12, 0x12, 0x12];
const FG = [0xc9, 0x96, 0x5b];
// Колонна «канона» в координатах 32×32 (как логотип в интерфейсе)
const RECTS = [
  [5, 4, 22, 3],
  [7, 25, 18, 3],
  [9, 8, 3, 16],
  [14.5, 8, 3, 16],
  [20, 8, 3, 16],
];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, glyphScale) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const s = (size * glyphScale) / 32;
  const off = (size - 32 * s) / 2;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // сглаживание: 4×4 подвыборки
      let cov = 0;
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const gx = (x + (sx + 0.5) / 4 - off) / s;
          const gy = (y + (sy + 0.5) / 4 - off) / s;
          if (RECTS.some(([rx, ry, rw, rh]) => gx >= rx && gx < rx + rw && gy >= ry && gy < ry + rh)) cov++;
        }
      const a = cov / 16;
      const i = y * (size * 3 + 1) + 1 + x * 3;
      for (let k = 0; k < 3; k++) raw[i + k] = Math.round(BG[k] * (1 - a) + FG[k] * a);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

writeFileSync(resolve(OUT, 'icon-192.png'), png(192, 0.8));
writeFileSync(resolve(OUT, 'icon-512.png'), png(512, 0.8));
writeFileSync(resolve(OUT, 'icon-maskable-512.png'), png(512, 0.55)); // безопасная зона maskable ≈ 80 % диаметра
writeFileSync(resolve(OUT, 'apple-touch-icon.png'), png(180, 0.7));
const svgRects = RECTS.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="0.6" fill="#c9965b"/>`).join('');
writeFileSync(resolve(OUT, 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#121212"/>${svgRects}</svg>\n`);
console.log('Иконки записаны в', OUT);
