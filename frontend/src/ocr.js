// OCR côté navigateur avec tesseract.js — lazy load pour ne pas plomber le bundle initial.
// Utilisé pour extraire "Delivery address" et "Your reference" depuis une image d'étiquette.

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

// Extrait client (ligne après "Delivery address") et référence (texte après "Your reference")
export async function extractLabelFields(imageDataUrl) {
  if (!imageDataUrl) return { client: null, reference: null };
  try {
    const worker = await getWorker();
    const { data: { text } } = await worker.recognize(imageDataUrl);
    if (!text) return { client: null, reference: null };

    // Client = 1ʳᵉ ligne non vide sous "Delivery address"
    let client = null;
    const daMatch = text.match(/Delivery\s*address\s*[:\-]?\s*\n+([^\n]+)/i);
    if (daMatch) {
      client = cleanLine(daMatch[1]);
      // Si la 1ʳᵉ ligne est juste "à" ou trop courte, essayer la ligne suivante
      if (client.length < 3) {
        const m2 = text.match(/Delivery\s*address\s*[:\-]?\s*\n+[^\n]+\n+([^\n]+)/i);
        if (m2) client = cleanLine(m2[1]);
      }
    }

    // Reference = texte après "Your reference" jusqu'au retour ligne
    let reference = null;
    const yrMatch = text.match(/Your\s*reference\s*[:\-]?\s*([^\n]+)/i);
    if (yrMatch) reference = cleanLine(yrMatch[1]);

    return { client, reference };
  } catch (err) {
    console.warn('[ocr] extraction failed:', err.message);
    return { client: null, reference: null };
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
