// Проверка самой библиотеки распознавания: штрихкод EAN-13 рисуется и читается обратно с теми же
// настройками, что в приложении (formats: ['EANUPC']). Камера и браузер здесь не участвуют.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prepareZXingModule, readBarcodes, writeBarcode } from 'zxing-wasm/full';
import { pickEan } from '../src/lib/ean';

describe('zxing-wasm: EAN-13 туда и обратно', () => {
  it('нарисованный штрихкод читается как тот же код', async () => {
    const wasmBinary = readFileSync(resolve(__dirname, '../node_modules/zxing-wasm/dist/full/zxing_full.wasm'));
    prepareZXingModule({ overrides: { wasmBinary: wasmBinary.buffer.slice(wasmBinary.byteOffset, wasmBinary.byteOffset + wasmBinary.byteLength) as ArrayBuffer } });
    const code = '4006381333931';
    const written = await writeBarcode(code, { format: 'EAN13', scale: 3 });
    expect(written.error).toBeFalsy();
    const results = await readBarcodes(written.image!, { formats: ['EANUPC'], tryHarder: true, maxNumberOfSymbols: 2 });
    expect(pickEan(results.filter((r) => r.isValid).map((r) => r.text))).toBe(code);
  });
});
