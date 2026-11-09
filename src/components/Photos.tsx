// Фото прогресса: хранятся только локально (IndexedDB). Контур прошлого фото для одинаковой позы, «было/стало» ползунком.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDb, type Photo, type PhotoAngle } from '../lib/data/db';
import { Card, Seg, fmtDate, useToast, Empty, pickFile } from './ui';
import { today } from '../lib/derive';

const ANGLE_RU: Record<PhotoAngle, string> = { front: 'Спереди', side: 'Сбоку', back: 'Сзади' };

function useObjectUrl(p: Photo | undefined) {
  const url = useMemo(() => (p ? URL.createObjectURL(new Blob([p.data], { type: p.mime })) : null), [p]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

/** Уменьшение до 1280 px по длинной стороне и JPEG 0.85 — экономит место в IndexedDB. */
async function toJpeg(source: CanvasImageSource, w: number, h: number): Promise<ArrayBuffer> {
  const k = Math.min(1, 1280 / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.getContext('2d')!.drawImage(source, 0, 0, c.width, c.height);
  const blob: Blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('не удалось сжать фото'))), 'image/jpeg', 0.85));
  return blob.arrayBuffer();
}

function Camera({ ghost, onShot, onClose }: { ghost: string | null; onShot: (buf: ArrayBuffer) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false });
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play();
        }
      } catch (e) {
        setErr(`Камера недоступна: ${(e as Error).message}. Используйте «Из галереи».`);
      }
    })();
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);
  return (
    <div>
      {err ? (
        <p className="field-error">{err}</p>
      ) : (
        <div className="camera">
          <video ref={video} playsInline muted />
          {ghost && <img className="ghost" src={ghost} alt="" />}
        </div>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        {!err && (
          <button
            className="btn btn-primary"
            onClick={async () => {
              const v = video.current!;
              onShot(await toJpeg(v, v.videoWidth, v.videoHeight));
            }}
          >
            Снять
          </button>
        )}
        <button className="btn" onClick={onClose}>
          Отмена
        </button>
      </div>
      <p className="tiny muted">Совместите силуэт с полупрозрачным контуром прошлого фото: та же дистанция, свет и поза.</p>
    </div>
  );
}

export function Photos() {
  const toast = useToast();
  const [angle, setAngle] = useState<PhotoAngle>('front');
  const [camera, setCamera] = useState(false);
  const [split, setSplit] = useState(50);
  const photos = useLiveQuery(() => getDb().photos.where('angle').equals(angle).sortBy('date'), [angle]) ?? [];
  const [aId, setAId] = useState<number | null>(null);
  const [bId, setBId] = useState<number | null>(null);
  const last = photos[photos.length - 1];
  const A = photos.find((p) => p.id === aId) ?? photos[0];
  const B = photos.find((p) => p.id === bId) ?? last;
  const urlLast = useObjectUrl(last);
  const urlA = useObjectUrl(A);
  const urlB = useObjectUrl(B);

  const store = async (data: ArrayBuffer) => {
    await getDb().photos.add({ date: today(), angle, mime: 'image/jpeg', data });
    setCamera(false);
    toast('Фото сохранено на устройстве');
  };
  const fromGallery = async () => {
    const f = await pickFile('image/*');
    if (!f) return;
    try {
      const bmp = await createImageBitmap(f);
      await store(await toJpeg(bmp, bmp.width, bmp.height));
    } catch (e) {
      toast(`Не удалось открыть фото: ${(e as Error).message}`);
    }
  };

  return (
    <Card title="Фото прогресса" extra={<span className="badge">только на устройстве</span>}>
      <Seg<PhotoAngle> value={angle} onChange={setAngle} label="Ракурс" options={(Object.keys(ANGLE_RU) as PhotoAngle[]).map((a) => [a, ANGLE_RU[a]])} />
      <div style={{ marginTop: 10 }}>
        {camera ? (
          <Camera ghost={urlLast} onShot={store} onClose={() => setCamera(false)} />
        ) : (
          <div className="row">
            <button className="btn btn-primary" onClick={() => setCamera(true)}>
              Камера с контуром
            </button>
            <button className="btn" onClick={fromGallery}>
              Из галереи
            </button>
          </div>
        )}
      </div>
      {photos.length === 0 ? (
        <Empty>Фото «{ANGLE_RU[angle].toLowerCase()}» ещё нет.</Empty>
      ) : photos.length === 1 ? (
        <p className="tiny muted" style={{ marginTop: 8 }}>Одно фото от {fmtDate(photos[0].date)}. Для сравнения нужно второе.</p>
      ) : (
        <div style={{ marginTop: 10 }}>
          <div className="grid2">
            <select value={A?.id} onChange={(e) => setAId(+e.target.value)} aria-label="Было">
              {photos.map((p) => (
                <option key={p.id} value={p.id}>
                  Было: {fmtDate(p.date)}
                </option>
              ))}
            </select>
            <select value={B?.id} onChange={(e) => setBId(+e.target.value)} aria-label="Стало">
              {photos.map((p) => (
                <option key={p.id} value={p.id}>
                  Стало: {fmtDate(p.date)}
                </option>
              ))}
            </select>
          </div>
          <div className="compare" style={{ marginTop: 8 }}>
            {urlB && <img src={urlB} alt="Стало" />}
            {urlA && <img src={urlA} alt="Было" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} />}
            <div className="divider" style={{ left: `${split}%` }} />
          </div>
          <input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(+e.target.value)} aria-label="Ползунок было/стало" style={{ width: '100%' }} />
          <div className="row">
            <button
              className="btn btn-small btn-danger"
              onClick={async () => {
                if (B?.id && confirm(`Удалить фото от ${fmtDate(B.date)}? Это необратимо.`)) {
                  await getDb().photos.delete(B.id);
                  setBId(null);
                }
              }}
            >
              Удалить фото «стало»
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
