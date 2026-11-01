import { useCallback, useEffect, useRef, useState } from 'react';
import { analyzeFrame, QUALITY_THRESHOLDS } from './labelQuality.js';
import { extractLabelFields } from './ocr.js';

// Forme de l'étiquette visée (largeur / hauteur). Les étiquettes transporteur
// sont en général verticales ; la caméra, elle, filme en paysage. Le cadre
// s'adapte donc à la forme choisie, pas l'inverse.
const LABEL_SHAPES = {
  portrait: { ratio: 0.70, label: 'Verticale' },   // ~A5/A6 debout
  paysage: { ratio: 1.43, label: 'Horizontale' },
};
const GUIDE_MAX = 0.94;       // le cadre ne touche jamais tout à fait le bord

const CHECK_INTERVAL = 150;   // ms entre deux analyses d'image
const OK_FRAMES_NEEDED = 2;   // images consécutives correctes avant déclenchement
const COOLDOWN_MS = 1500;     // pause après une prise, le temps de passer au carton suivant
const REARM_FRAMES = 3;       // images hors cadre avant de réarmer le déclenchement
const CAPTURE_MARGIN = 0.12;  // marge photographiée autour du cadre de visée

// Cadre centré de la forme voulue, le plus grand qui tienne dans l'image.
// Renvoie des fractions (pour l'affichage) ; le même calcul sert au recadrage.
function guideFractions(videoW, videoH, shapeRatio) {
  if (!videoW || !videoH) return null;
  const frameRatio = videoW / videoH;
  let w = GUIDE_MAX;
  let h = (w * frameRatio) / shapeRatio;   // fractions : largeur et hauteur ont des bases différentes
  if (h > GUIDE_MAX) {
    h = GUIDE_MAX;
    w = (h * shapeRatio) / frameRatio;
  }
  return { w, h };
}

// Zone visée, en pixels de la vidéo. `margin` élargit la zone (capture),
// 0 donne exactement le cadre affiché (analyse).
function guideCrop(video, shapeRatio, margin = 0) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const frac = guideFractions(vw, vh, shapeRatio);
  if (!frac) return null;
  const w = Math.min(vw, Math.round(vw * frac.w * (1 + margin)));
  const h = Math.min(vh, Math.round(vh * frac.h * (1 + margin)));
  return { x: Math.round((vw - w) / 2), y: Math.round((vh - h) / 2), w, h };
}

async function getBarcodeDetector() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    const formats = supported.filter(f => f !== 'unknown');
    return new window.BarcodeDetector(formats.length ? { formats } : undefined);
  } catch {
    return null;
  }
}

export default function SeriesCapture({ onClose, onDone }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectorRef = useRef(null);
  const okStreakRef = useRef(0);
  const lastShotRef = useRef(0);
  const lastBarcodeRef = useRef(null);
  const busyRef = useRef(false);
  // Après une prise, il faut que le cadre redevienne mauvais (étiquette retirée,
  // caméra déplacée) avant de pouvoir redéclencher : sans ça, un appareil sans
  // lecteur de code-barres reprendrait le même carton en boucle.
  const armedRef = useRef(true);
  const notOkStreakRef = useRef(0);
  const queueBusyRef = useRef(false);
  const mountedRef = useRef(true);

  const [error, setError] = useState('');
  const [status, setStatus] = useState({ ok: false, reason: 'Démarrage de la caméra…', metrics: null });
  const [barcode, setBarcode] = useState(null);
  const [items, setItems] = useState([]);
  const [flash, setFlash] = useState(false);
  const [shape, setShape] = useState('portrait');
  const [videoSize, setVideoSize] = useState(null);
  const shapeRef = useRef('portrait');
  const [showMetrics, setShowMetrics] = useState(false);

  // --- Prise de vue -------------------------------------------------------
  const capture = useCallback(async (detectedBarcode) => {
    const video = videoRef.current;
    if (!video || busyRef.current) return;
    // On photographie un peu plus large que le cadre de visée : si l'étiquette
    // dépasse légèrement, on ne perd pas la ligne "Delivery address".
    const crop = guideCrop(video, LABEL_SHAPES[shapeRef.current].ratio, CAPTURE_MARGIN);
    if (!crop) return;

    busyRef.current = true;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = crop.w;
      canvas.height = crop.h;
      canvas.getContext('2d').drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.9));
      if (!blob) return;

      lastShotRef.current = Date.now();
      lastBarcodeRef.current = detectedBarcode || null;
      okStreakRef.current = 0;
      armedRef.current = false;
      notOkStreakRef.current = 0;
      setFlash(true);
      setTimeout(() => setFlash(false), 180);

      setItems(prev => [...prev, {
        id: `${Date.now()}-${prev.length}`,
        blob,
        url: URL.createObjectURL(blob),
        barcode: detectedBarcode || null,
        status: 'pending',
        fields: null,
      }]);
    } finally {
      busyRef.current = false;
    }
  }, []);

  // --- Caméra + boucle d'analyse -----------------------------------------
  useEffect(() => {
    let cancelled = false;
    let timer = null;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 2560 },
            height: { ideal: 1440 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        video.srcObject = stream;
        // La forme réelle de l'image décide du cadre : selon les téléphones,
        // la caméra rend du portrait ou du paysage.
        video.onloadedmetadata = () =>
          setVideoSize({ w: video.videoWidth, h: video.videoHeight });
        await video.play().catch(() => {});
        if (video.videoWidth) setVideoSize({ w: video.videoWidth, h: video.videoHeight });

        // Mise au point continue quand l'appareil l'expose
        const track = stream.getVideoTracks()[0];
        try {
          const caps = track.getCapabilities?.() || {};
          if (caps.focusMode?.includes('continuous')) {
            await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
          }
        } catch { /* optionnel */ }

        detectorRef.current = await getBarcodeDetector();

        timer = setInterval(async () => {
          const v = videoRef.current;
          if (!v || v.readyState < 2 || busyRef.current) return;
          const crop = guideCrop(v, LABEL_SHAPES[shapeRef.current].ratio);
          if (!crop) return;

          const result = analyzeFrame(v, crop);
          let code = null;

          if (result.ok && detectorRef.current) {
            // Le code-barres ne se décode que sur une image nette et cadrée :
            // c'est la meilleure preuve que le texte sera lisible.
            try {
              const c = document.createElement('canvas');
              c.width = Math.round(crop.w / 2);
              c.height = Math.round(crop.h / 2);
              c.getContext('2d').drawImage(v, crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height);
              const codes = await detectorRef.current.detect(c);
              code = codes?.find(x => x.rawValue)?.rawValue?.trim() || null;
            } catch { /* le gate qualité suffit */ }
          }

          setBarcode(code);
          const needsCode = !!detectorRef.current;
          const ready = result.ok && (!needsCode || !!code);
          setStatus({
            ok: ready,
            reason: result.ok
              ? (ready ? null : 'Cherche le code-barres…')
              : result.reason,
            metrics: result.metrics,
          });

          if (!ready) {
            okStreakRef.current = 0;
            notOkStreakRef.current += 1;
            // Le cadre est retombé : on réarme pour l'étiquette suivante
            if (notOkStreakRef.current >= REARM_FRAMES) armedRef.current = true;
            return;
          }
          notOkStreakRef.current = 0;
          if (Date.now() - lastShotRef.current < COOLDOWN_MS) return;
          // Même code-barres que la photo précédente : on ne reprend pas le même carton
          if (code && code === lastBarcodeRef.current) return;
          // Un nouveau code-barres suffit à réarmer, même sans passage par le rouge
          if (!armedRef.current && !(code && code !== lastBarcodeRef.current)) return;

          okStreakRef.current += 1;
          if (okStreakRef.current >= OK_FRAMES_NEEDED) capture(code);
        }, CHECK_INTERVAL);
      } catch (err) {
        if (cancelled) return;
        const msg = err?.message || String(err);
        if (/permission|denied|notallowed/i.test(msg)) {
          setError('Accès caméra refusé. Autorise la caméra pour ce site.');
        } else if (/notfound|no camera|device/i.test(msg)) {
          setError('Aucune caméra détectée sur cet appareil.');
        } else {
          setError('Caméra indisponible : ' + msg);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [capture]);

  // --- File d'extraction : une photo à la fois, en arrière-plan -----------
  useEffect(() => {
    // Une seule lecture à la fois : le verrou vit dans une ref, pas dans le
    // nettoyage de l'effet — sinon chaque nouvelle photo annulerait la lecture
    // en cours et les étiquettes resteraient bloquées sur "Lecture en cours".
    if (queueBusyRef.current) return;
    const next = items.find(i => i.status === 'pending');
    if (!next) return;
    queueBusyRef.current = true;

    setItems(prev => prev.map(i => i.id === next.id ? { ...i, status: 'working' } : i));
    extractLabelFields(next.blob)
      .then(fields => {
        if (!mountedRef.current) return;
        setItems(prev => prev.map(i => i.id === next.id
          ? {
              ...i,
              status: 'read',
              fields: {
                client: fields.client,
                clientSure: fields.clientSource === 'label',
                reference: fields.reference,
                // "Your reference" sans aucun chiffre : l'OCR a probablement
                // dérapé (mesuré : "178053" lu "TEBOSS"). On le signale.
                referenceSure: !!fields.reference && /\d/.test(fields.reference),
                // Le code-barres vaut l'Internal Pallet ID, et il est exact :
                // on le préfère à l'OCR, qui confond les chiffres.
                cartonCode: i.barcode || fields.palletId || null,
                cartonFromBarcode: !!i.barcode,
              },
            }
          : i));
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setItems(prev => prev.map(i => i.id === next.id
          ? { ...i, status: 'read', fields: { client: null, reference: null, cartonCode: i.barcode || null } }
          : i));
      })
      .finally(() => { queueBusyRef.current = false; });
  }, [items]);

  // Remonté à chaque montage : sans ça, un remontage (StrictMode en
  // développement, ou simple réouverture de l'écran) laissait le drapeau à
  // false et toutes les lectures suivantes étaient ignorées.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      queueBusyRef.current = false;
    };
  }, []);

  function removeItem(id) {
    setItems(prev => {
      const target = prev.find(i => i.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter(i => i.id !== id);
    });
  }

  // Le cadre dessiné doit couvrir exactement la zone analysée et photographiée
  const frac = videoSize && guideFractions(videoSize.w, videoSize.h, LABEL_SHAPES[shape].ratio);
  const guideStyle = frac
    ? {
        width: `${(frac.w * 100).toFixed(2)}%`,
        height: `${(frac.h * 100).toFixed(2)}%`,
        left: `${((1 - frac.w) * 50).toFixed(2)}%`,
        top: `${((1 - frac.h) * 50).toFixed(2)}%`,
      }
    : undefined;

  function switchShape() {
    const next = shape === 'portrait' ? 'paysage' : 'portrait';
    shapeRef.current = next;
    setShape(next);
  }

  const pending = items.filter(i => i.status !== 'read').length;
  const incomplete = items.filter(
    i => i.status === 'read' && (!i.fields?.client || !i.fields?.clientSure
      || !i.fields?.reference || !i.fields?.referenceSure || !i.fields?.cartonCode)
  ).length;

  return (
    <div className="modal-backdrop series-backdrop">
      <div className="modal modal-series">
        <header className="modal-header">
          <h3>Scan en série — {items.length} étiquette{items.length > 1 ? 's' : ''}</h3>
          <button className="ghost" onClick={onClose}>Fermer</button>
        </header>

        <div
          className="series-camera"
          style={videoSize ? { aspectRatio: `${videoSize.w} / ${videoSize.h}` } : undefined}
        >
          <video ref={videoRef} playsInline muted className="series-video" />
          <div
            className={`series-guide ${status.ok ? 'guide-ok' : ''}`}
            style={guideStyle}
          >
            <span className="series-guide-label">
              {status.ok ? '✓ OK' : status.reason}
            </span>
          </div>
          {flash && <div className="series-flash" />}
          {error && <div className="scanner-error series-error">{error}</div>}
        </div>

        <div className="series-bar">
          <button
            className="primary"
            onClick={() => capture(barcode)}
            disabled={!!error}
            title="Forcer la prise si le cadre ne passe pas au vert"
          >
            Prendre quand même
          </button>
          <button className="ghost" onClick={switchShape} title="Forme de l'étiquette">
            ⟲ {LABEL_SHAPES[shape].label}
          </button>
          <button className="ghost" onClick={() => setShowMetrics(v => !v)}>
            {showMetrics ? 'Masquer' : 'Mesures'}
          </button>
          <span className="series-queue">
            {pending > 0 ? `${pending} en lecture…` : 'Lecture à jour'}
            {incomplete > 0 && ` · ${incomplete} à vérifier`}
          </span>
        </div>

        {showMetrics && status.metrics && (
          <div className="series-metrics">
            netteté {status.metrics.sharpness} (min {QUALITY_THRESHOLDS.minSharpness})
            · lumière {status.metrics.brightness}
            · remplissage {status.metrics.fill}
            · encre {status.metrics.ink}
            · code-barres {barcode || '—'}
          </div>
        )}

        <div className="series-list">
          {items.length === 0 && (
            <p className="series-hint">
              Vise une étiquette : la photo part toute seule dès que le cadre est vert.
            </p>
          )}
          {items.map((item, idx) => (
            <div key={item.id} className="series-item">
              <img src={item.url} alt={`Étiquette ${idx + 1}`} className="series-thumb" />
              <div className="series-fields">
                {item.status !== 'read' ? (
                  <span className="series-reading">Lecture en cours…</span>
                ) : (
                  <>
                    <div>
                      <b>N° commande</b>{' '}
                      {item.fields.reference
                        ? <span className={item.fields.referenceSure ? '' : 'series-unsure'}>
                            {item.fields.reference}{item.fields.referenceSure ? '' : ' (à vérifier)'}
                          </span>
                        : <i>à compléter</i>}
                    </div>
                    <div>
                      <b>Client</b>{' '}
                      {item.fields.client
                        ? <span className={item.fields.clientSure ? '' : 'series-unsure'}>
                            {item.fields.client}{item.fields.clientSure ? '' : ' (à vérifier)'}
                          </span>
                        : <i>à compléter</i>}
                    </div>
                    <div>
                      <b>N° carton</b>{' '}
                      {item.fields.cartonCode
                        ? <span className={item.fields.cartonFromBarcode ? '' : 'series-unsure'}>
                            {item.fields.cartonCode}{item.fields.cartonFromBarcode ? '' : ' (à vérifier)'}
                          </span>
                        : <i>à compléter</i>}
                    </div>
                  </>
                )}
              </div>
              <button className="ghost series-del" onClick={() => removeItem(item.id)}>✕</button>
            </div>
          ))}
        </div>

        <footer className="series-footer">
          <button className="ghost" onClick={onClose}>Annuler</button>
          <button
            className="primary"
            disabled={!items.length || pending > 0}
            onClick={() => onDone?.(items)}
          >
            Terminer ({items.length})
          </button>
        </footer>
      </div>
    </div>
  );
}
