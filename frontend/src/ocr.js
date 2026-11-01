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
// plus précis. On redescend à 2000px max, en niveaux de gris avec un contraste
// léger — un contraste fort referme les chiffres fins et les fait confondre.
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

export async function preprocess(source, contrast = 1.15) {
  const img = await loadImage(source);
  const srcW = img.naturalWidth || img.width;
  // Mesuré sur une étiquette réelle : agrandir une image déjà petite dégrade
  // la lecture des chiffres (interpolation). On se contente de réduire.
  const scale = Math.min(1, MAX_WIDTH / srcW);
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
    // Luminance perçue, puis contraste léger : au-delà, les chiffres fins
    // se referment et l'OCR les confond (mesuré sur étiquette réelle).
    const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const c = contrast === 1 ? g : Math.max(0, Math.min(255, (g - 128) * contrast + 128));
    px[i] = px[i + 1] = px[i + 2] = c;
  }
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL('image/png');
}

// Libellés rencontrés sur les étiquettes transporteur, FR et EN
const CLIENT_LABELS = /(?:delivery\s*address|deliver\s*to|ship\s*to|consignee|destinataire|adresse\s*de\s*livraison|livraison)/i;
const REF_LABELS = /(?:your\s*ref(?:erence)?|customer\s*ref(?:erence)?|ref(?:erence)?\s*client|votre\s*r[ée]f(?:[ée]rence)?)/i;
// Le n° de colis/palette imprimé à côté ou au-dessus du code-barres
const PALLET_LABELS = /(?:internal\s*pallet\s*id|pallet\s*id|internal\s*id)/i;

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

// Le nom du client est la ligne immédiatement sous "Delivery address".
// Si l'OCR a laissé le nom sur la ligne du libellé, on le prend là.
function firstLineBelow(lines, index, labelRegex) {
  const sameLine = cleanLine(lines[index].replace(labelRegex, '').replace(/^[\s:\-.·]+/, ''));
  const sameName = nameOrNull(sameLine);
  if (sameName && !OTHER_LABELS.test(sameName)) return sameName;
  for (let i = index + 1; i < lines.length; i++) {
    if (!cleanLine(lines[i])) continue; // l'OCR intercale des lignes vides
    const name = nameOrNull(lines[i]);
    if (name) return name;
    return null; // la ligne sous le libellé existe mais n'est pas un nom
  }
  return null;
}

// Un nom lisible, débarrassé du bruit de bord de scan : "73 savickaite
// Gabriele" -> "savickaite Gabriele", "Ss :" -> rien.
function nameOrNull(line) {
  const tokens = cleanLine(line).split(/\s+/).filter(Boolean);
  while (tokens.length && !/[a-zà-ÿ]{3}/i.test(tokens[0])) tokens.shift();
  const s = tokens.join(' ').replace(/[\s:;.,_|-]+$/, '').trim();
  if (s.length < 3 || !/[a-zà-ÿ]{3}/i.test(s)) return null;
  return s;
}

// Internal Pallet ID : un code, chiffres (parfois lettres), sans espaces
function pickPalletId(cands) {
  const isCode = t => /^[A-Z0-9][A-Z0-9\-_/]*$/i.test(t) && /\d/.test(t);
  const digits = s => (s.match(/\d/g) || []).length;

  for (const cand of cands) {
    const tokens = cand.split(/\s+/).filter(Boolean);
    // L'OCR coupe le code ("1 001275612") et laisse du bruit avant
    // ("nternal : 1 001275612"). On cherche la plus longue suite de
    // morceaux de code qui se suivent, et on la recolle.
    let best = '';
    let run = '';
    for (const t of tokens) {
      if (isCode(t)) {
        run += t;
        if (digits(run) > digits(best)) best = run;
      } else {
        run = '';
      }
    }
    if (best) return best;
  }
  return null;
}

// Repli : première ligne "nom d'entreprise" avant la référence — ni une
// adresse (qui commence par un numéro), ni un libellé, ni un code.
function guessClientLine(lines) {
  for (const raw of lines) {
    const s = cleanLine(raw);
    if (!s || isNoise(s) || OTHER_LABELS.test(s)) continue;
    if (REF_LABELS.test(s) || PALLET_LABELS.test(s)) return null; // trop bas dans l'étiquette
    if (/^\d/.test(s)) continue;              // "12 RUE DES ARTISANS"
    if (!/[a-z]{3}/i.test(s)) continue;       // un code, pas un nom
    if (s.length < 4) continue;
    return s;
  }
  return null;
}

export function parseLabelText(text) {
  const lines = (text || '').split('\n');
  let client = null;
  let reference = null;
  let palletId = null;

  for (let i = 0; i < lines.length; i++) {
    if (!reference && REF_LABELS.test(lines[i])) {
      reference = pickReference(candidatesAfterLabel(lines, i, REF_LABELS));
    }
    // Client = la ligne juste en dessous de "Delivery address", rien d'autre
    if (!client && CLIENT_LABELS.test(lines[i])) {
      client = firstLineBelow(lines, i, CLIENT_LABELS);
    }
    if (!palletId && PALLET_LABELS.test(lines[i])) {
      palletId = pickPalletId(candidatesAfterLabel(lines, i, PALLET_LABELS));
    }
  }

  // "Your reference" est un code : on retire les espaces parasites de l'OCR
  // si le résultat ressemble à une référence (pas de mots).
  if (reference && !/[a-z]{4}/i.test(reference.replace(/\s/g, ''))) {
    reference = reference.replace(/\s+/g, '');
  }

  // Si "Delivery address" a été coupé par le cadrage, le nom du client est en
  // général la première ligne de l'étiquette. On la propose, mais marquée
  // comme incertaine : à l'écran elle s'affiche "à vérifier", jamais comme lue.
  let clientSource = client ? 'label' : null;
  if (!client) {
    const guess = guessClientLine(lines);
    if (guess) {
      client = guess;
      clientSource = 'guess';
    }
  }

  return {
    client: client || null,
    clientSource,
    reference: reference || null,
    palletId: palletId || null,
  };
}

// Une passe de lecture avec des réglages donnés
async function readPass(source, { contrast, pageSegMode }) {
  const image = await preprocess(source, contrast);
  const worker = await getWorker();
  if (pageSegMode) await worker.setParameters({ tessedit_pageseg_mode: String(pageSegMode) });
  try {
    const { data: { text } } = await worker.recognize(image);
    return text || '';
  } finally {
    if (pageSegMode) await worker.setParameters({ tessedit_pageseg_mode: '3' });
  }
}

// "Your reference" est le n° de commande : c'est le champ qui ne doit pas
// manquer. S'il sort vide, on relit la même photo avec d'autres réglages
// avant d'abandonner — ça ne coûte que sur les étiquettes qui ont échoué.
const RETRY_PASSES = [
  { contrast: 1.0, pageSegMode: 6 },   // bloc de texte uniforme
  { contrast: 1.45, pageSegMode: 4 },  // colonnes de largeurs variables
];

export async function extractLabelFields(source) {
  if (!source) {
    return { client: null, clientSource: null, reference: null, palletId: null, text: '', passes: 0 };
  }
  try {
    let text = await readPass(source, { contrast: undefined });
    let parsed = parseLabelText(text);
    let passes = 1;

    for (const settings of RETRY_PASSES) {
      if (parsed.reference) break;
      const retryText = await readPass(source, settings);
      passes++;
      const retry = parseLabelText(retryText);
      // On ne remplace que ce qui manquait : une relecture ne doit pas
      // écraser un champ déjà lu correctement.
      parsed = {
        client: parsed.client || retry.client,
        clientSource: parsed.client ? parsed.clientSource : retry.clientSource,
        reference: parsed.reference || retry.reference,
        palletId: parsed.palletId || retry.palletId,
      };
      text = retryText;
    }

    return { ...parsed, text, passes };
  } catch (err) {
    console.warn('[ocr] extraction failed:', err.message);
    return { client: null, clientSource: null, reference: null, palletId: null, text: '', passes: 0 };
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
