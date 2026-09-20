// OCR côté navigateur avec tesseract.js — lazy load pour ne pas plomber le bundle initial.
// Lit sur la photo d'une étiquette : le nom client (sous "Delivery address")
// et la référence client ("Your reference"), qui sert de n° de commande.

let workerPromise = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      // eng suffit pour les mots-clés "Delivery address" / "Your reference".
      // Les valeurs (noms clients) sont en général en majuscules, ASCII latin.
      const w = await createWorker('eng');
      return w;
    })();
  }
  return workerPromise;
}

function cleanLine(s) {
  if (!s) return '';
  return s.replace(/[|]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Une photo de téléphone fait 3000-4000px de large : Tesseract y est lent et pas
// plus précis. On redescend à 2000px max, en niveaux de gris avec contraste
// renforcé — c'est ce que l'OCR lit le mieux sur un texte imprimé.
const MAX_WIDTH = 2000;

async function loadImage(source) {
  const url = typeof source === 'string' ? source : URL.createObjectURL(source);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('image illisible'));
      img.src = url;
    });
    return img;
  } finally {
    if (typeof source !== 'string') setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

export async function preprocess(source) {
  const img = await loadImage(source);
  const scale = Math.min(1, MAX_WIDTH / (img.naturalWidth || img.width));
  const w = Math.round((img.naturalWidth || img.width) * scale);
  const h = Math.round((img.naturalHeight || img.height) * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);

  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    // Luminance perçue, puis contraste centré sur le gris moyen
    const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const c = Math.max(0, Math.min(255, (g - 128) * 1.6 + 128));
    px[i] = px[i + 1] = px[i + 2] = c;
  }
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL('image/png');
}

// Libellés rencontrés sur les étiquettes transporteur, FR et EN
const CLIENT_LABELS = /(?:delivery\s*address|deliver\s*to|ship\s*to|consignee|destinataire|adresse\s*de\s*livraison|livraison)/i;
const REF_LABELS = /(?:your\s*ref(?:erence)?|customer\s*ref(?:erence)?|ref(?:erence)?\s*client|votre\s*r[ée]f(?:[ée]rence)?)/i;

// L'OCR met sur une même ligne des colonnes voisines de l'étiquette :
// "Your reference        Weight: 12.5 kg". Ces libellés-là ne sont jamais
// la valeur cherchée, on les écarte.
const OTHER_LABELS = /(weight|poids|\d+[.,]?\d*\s*(kg|g|lbs)\b|date|page|tel|phone|fax|www\.|https?:|carrier|service|invoice|batch|qty|quantity|colis|parcel|pi[eè]ces)/i;

// Une ligne qui n'est qu'un libellé, un numéro de page, du bruit OCR…
function isNoise(line) {
  const s = cleanLine(line);
  if (s.length < 3) return true;
  if (CLIENT_LABELS.test(s) && s.length < 25) return true;
  if (REF_LABELS.test(s) && s.length < 25) return true;
  if (/^[^a-z0-9]+$/i.test(s)) return true;
  return false;
}

// Valeurs possibles : reste de la ligne du libellé, puis les lignes suivantes
function candidatesAfterLabel(lines, index, labelRegex) {
  const out = [];
  const sameLine = cleanLine(lines[index].replace(labelRegex, '').replace(/^[\s:\-.·]+/, ''));
  if (sameLine) out.push(sameLine);
  for (let i = index + 1; i < Math.min(lines.length, index + 4); i++) {
    const l = cleanLine(lines[i]);
    if (l) out.push(l);
  }
  return out.filter(s => !isNoise(s) && !OTHER_LABELS.test(s));
}

// Une référence contient presque toujours un chiffre : on la préfère
function pickReference(cands) {
  return cands.find(s => /\d/.test(s) && s.length >= 4) || cands[0] || null;
}

// Un nom client contient des lettres et pas seulement un code
function pickClient(cands) {
  return cands.find(s => /[a-z]{3}/i.test(s)) || cands[0] || null;
}

export function parseLabelText(text) {
  const lines = (text || '').split('\n');
  let client = null;
  let reference = null;

  for (let i = 0; i < lines.length; i++) {
    if (!reference && REF_LABELS.test(lines[i])) {
      reference = pickReference(candidatesAfterLabel(lines, i, REF_LABELS));
    }
    if (!client && CLIENT_LABELS.test(lines[i])) {
      client = pickClient(candidatesAfterLabel(lines, i, CLIENT_LABELS));
    }
  }

  // "Your reference" est un code : on retire les espaces parasites de l'OCR
  // si le résultat ressemble à une référence (pas de mots).
  if (reference && !/[a-z]{4}/i.test(reference.replace(/\s/g, ''))) {
    reference = reference.replace(/\s+/g, '');
  }

  return { client: client || null, reference: reference || null };
}

// Lit une photo d'étiquette (File, Blob ou dataURL) et en extrait client + référence
export async function extractLabelFields(source) {
  if (!source) return { client: null, reference: null, text: '' };
  try {
    const image = await preprocess(source);
    const worker = await getWorker();
    const { data: { text } } = await worker.recognize(image);
    return { ...parseLabelText(text), text: text || '' };
  } catch (err) {
    console.warn('[ocr] extraction failed:', err.message);
    return { client: null, reference: null, text: '' };
  }
}

// Décharge le worker si on veut libérer la mémoire
export async function disposeOcr() {
  if (!workerPromise) return;
  try {
    const w = await workerPromise;
    await w.terminate();
  } catch { /* ignore */ }
  workerPromise = null;
}
