// Распознавание штрихкода с кадра камеры. В Safari на iPhone встроенного BarcodeDetector нет
// (выключен по умолчанию), поэтому основной путь — zxing-wasm. Файл .wasm лежит в сборке приложения:
// без запросов к чужим серверам и с кэшем для офлайна. Модуль грузится отдельным куском только при открытии сканера.
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { pickEan } from './ean';

let prepared = false;
type NativeDetector = { detect(src: ImageData): Promise<Array<{ rawValue: string }>> };
let native: NativeDetector | null | undefined;

export async function scanFrame(frame: ImageData): Promise<string | null> {
  // Встроенный распознаватель (Chrome на Android) быстрее; если его нет или он ошибся — zxing
  if (native === undefined) {
    try {
      const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => NativeDetector }).BarcodeDetector;
      native = BD ? new BD({ formats: ['ean_13', 'ean_8', 'upc_a'] }) : null;
    } catch {
      native = null;
    }
  }
  if (native) {
    try {
      const hit = pickEan((await native.detect(frame)).map((r) => r.rawValue));
      if (hit) return hit;
    } catch {
      native = null;
    }
  }
  if (!prepared) {
    prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } });
    prepared = true;
  }
  const results = await readBarcodes(frame, { formats: ['EANUPC'], tryHarder: true, maxNumberOfSymbols: 2 });
  return pickEan(results.filter((r) => r.isValid).map((r) => r.text));
}
