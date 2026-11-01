// Contrôle qualité d'une image de caméra, en direct, avant la prise de vue.
// Objectif : ne déclencher que sur une image dont le texte sera lisible,
// plutôt que de découvrir après coup qu'une photo sur cinq est inexploitable.

// Seuils à recaler sur de vraies étiquettes (écran de calibrage).
export const QUALITY_THRESHOLDS = {
  analyzeWidth: 320,   // l'analyse tourne sur une vignette : ~2 ms par image
  minSharpness: 90,    // variance du laplacien ; le flou de bougé la fait chuter
  minBrightness: 55,
  maxBrightness: 246,
  minFill: 0.30,       // part claire du cadre : l'étiquette doit le remplir
  maxFill: 0.99,
  minInk: 0.012,       // part de pixels sombres : sans encre visible, pas de texte
};

const GRAY = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

// Vignette en niveaux de gris de la zone visée (le cadre de visée, pas
// l'image entière : ce qui est autour ne doit pas peser dans le verdict).
function grayscaleThumb(source, crop, width) {
  const sw = crop?.w || source.videoWidth || source.width;
  const sh = crop?.h || source.videoHeight || source.height;
  const sx = crop?.x || 0;
  const sy = crop?.y || 0;
  if (!sw || !sh) return null;

  const w = Math.max(32, Math.round(width));
  const h = Math.max(32, Math.round((sh / sw) * w));

  const canvas = grayscaleThumb.canvas || (grayscaleThumb.canvas = document.createElement('canvas'));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);

  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = GRAY(data[i], data[i + 1], data[i + 2]);
  }
  return { gray, w, h };
}

// Variance du laplacien : mesure de netteté classique et peu coûteuse.
// Image nette = beaucoup de transitions fortes ; image floue = tout est lisse.
function sharpness(gray, w, h) {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap =
        4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export function analyzeFrame(source, crop, thresholds = QUALITY_THRESHOLDS) {
  const thumb = grayscaleThumb(source, crop, thresholds.analyzeWidth);
  if (!thumb) return { ok: false, reason: 'Caméra en cours de démarrage…', metrics: null };

  const { gray, w, h } = thumb;
  let sum = 0;
  let max = 0;
  for (let i = 0; i < gray.length; i++) {
    sum += gray[i];
    if (gray[i] > max) max = gray[i];
  }
  const brightness = sum / gray.length;

  // Encre = pixels nettement plus sombres que le papier. Un reflet qui noie
  // le texte, une étiquette vierge ou un cadrage à côté font chuter ce ratio ;
  // c'est un bien meilleur signal que de compter les pixels saturés, qui sont
  // nombreux et normaux sur une étiquette blanche bien éclairée.
  const inkThreshold = Math.max(60, max * 0.55);
  let ink = 0;
  for (let i = 0; i < gray.length; i++) if (gray[i] <= inkThreshold) ink++;
  const inkRatio = ink / gray.length;

  // L'étiquette est la zone claire du cadre : seuil relatif au plus clair vu,
  // ce qui reste valable sous une lumière d'atelier comme en plein soleil.
  const paperThreshold = Math.max(110, max * 0.72);
  let light = 0;
  for (let i = 0; i < gray.length; i++) if (gray[i] >= paperThreshold) light++;
  const fill = light / gray.length;

  const sharp = sharpness(gray, w, h);
  const metrics = {
    sharpness: Math.round(sharp),
    brightness: Math.round(brightness),
    fill: Number(fill.toFixed(2)),
    ink: Number(inkRatio.toFixed(3)),
  };

  // Ordre des messages : d'abord ce que l'utilisateur peut corriger le plus vite
  let reason = null;
  if (brightness < thresholds.minBrightness) reason = 'Trop sombre';
  else if (brightness > thresholds.maxBrightness) reason = 'Surexposé';
  else if (fill < thresholds.minFill) reason = 'Approche l\'étiquette';
  else if (fill > thresholds.maxFill) reason = 'Recule un peu';
  else if (inkRatio < thresholds.minInk) reason = 'Texte illisible — évite le reflet';
  else if (sharp < thresholds.minSharpness) reason = 'Trop flou — stabilise';

  return { ok: !reason, reason, metrics };
}
