// Сканер штрихкода: камера → кадр → распознавание. Распознаватель (zxing-wasm, ≈ 1 МБ) грузится только здесь.
import { useEffect, useRef, useState } from 'react';
import { isValidEan } from '../lib/ean';

export function BarcodeScanner({ onDetect }: { onDetect: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const found = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const canvas = document.createElement('canvas');

    const tick = async (scan: (f: ImageData) => Promise<string | null>) => {
      if (stopped || found.current) return;
      const v = video.current;
      if (v && v.videoWidth > 0) {
        // Берём среднюю полосу кадра: штрихкод держат по центру, а меньший кадр распознаётся быстрее
        const w = Math.min(v.videoWidth, 960);
        const k = w / v.videoWidth;
        const h = Math.round(v.videoHeight * k * 0.5);
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(v, 0, v.videoHeight * 0.25, v.videoWidth, v.videoHeight * 0.5, 0, 0, w, h);
          try {
            const code = await scan(ctx.getImageData(0, 0, w, h));
            if (code && !stopped && !found.current) {
              found.current = true;
              onDetect(code);
              return;
            }
          } catch (e) {
            setErr(`Распознавание не запустилось: ${(e as Error).message}. Введите цифры под штрихкодом вручную.`);
            return;
          }
        }
      }
      timer = setTimeout(() => void tick(scan), 250);
    };

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('браузер не даёт доступ к камере');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play();
        }
        const { scanFrame } = await import('../lib/barcode');
        void tick(scanFrame);
      } catch (e) {
        setErr(`Камера недоступна: ${(e as Error).message}. Введите цифры под штрихкодом вручную.`);
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const code = manual.replace(/\s/g, '');
  const manualOk = isValidEan(code);
  return (
    <div className="stack">
      {err ? (
        <p className="field-error">{err}</p>
      ) : (
        <>
          <div className="camera scanner">
            <video ref={video} playsInline muted />
            <div className="scanner-frame" aria-hidden="true" />
          </div>
          <p className="caption" style={{ margin: 0 }}>
            Наведите камеру на штрихкод так, чтобы он попал в рамку. Код распознаётся на телефоне; в сеть уходит только сам номер — для поиска в Open Food Facts.
          </p>
        </>
      )}
      <form
        className="row"
        style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}
        onSubmit={(e) => {
          e.preventDefault();
          if (manualOk) onDetect(code);
        }}
      >
        <label className="field" style={{ flex: 1 }}>
          <span className="field-label">Или цифры под штрихкодом</span>
          <input inputMode="numeric" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="4601234567890" aria-invalid={code !== '' && !manualOk} className={code.length >= 8 && !manualOk ? 'invalid' : ''} />
        </label>
        <button className="btn btn-primary" disabled={!manualOk}>
          Найти
        </button>
      </form>
      {code.length >= 8 && !manualOk && <p className="field-error">Контрольная цифра не сходится — проверьте, нет ли опечатки.</p>}
    </div>
  );
}
