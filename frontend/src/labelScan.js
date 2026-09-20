// Décodage d'un code-barres depuis une image fixe (photo d'étiquette).
// 1) BarcodeDetector natif quand le navigateur l'a (Chrome Android) : rapide et précis.
// 2) Sinon html5-qrcode en mode fichier.

const FALLBACK_REGION_ID = 'label-file-scan-region';

async function detectNative(file) {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    const formats = supported.filter(f => f !== 'unknown');
    const detector = new window.BarcodeDetector(formats.length ? { formats } : undefined);
    const bitmap = await createImageBitmap(file);
    try {
      const codes = await detector.detect(bitmap);
      const value = codes?.find(c => c.rawValue)?.rawValue;
      return value ? value.trim() : null;
    } finally {
      bitmap.close?.();
    }
  } catch (err) {
    console.warn('[barcode] BarcodeDetector failed:', err.message);
    return null;
  }
}

async function detectFallback(file) {
  let host = null;
  let scanner = null;
  try {
    const { Html5Qrcode } = await import('html5-qrcode');
    host = document.createElement('div');
    host.id = FALLBACK_REGION_ID;
    host.style.display = 'none';
    document.body.appendChild(host);
    scanner = new Html5Qrcode(host.id);
    const result = await scanner.scanFileV2(file, false);
    const value = result?.decodedText;
    return value ? value.trim() : null;
  } catch (err) {
    console.warn('[barcode] file scan failed:', err.message);
    return null;
  } finally {
    try { await scanner?.clear(); } catch { /* ignore */ }
    host?.remove();
  }
}

export async function decodeBarcodeFromImage(file) {
  if (!file) return null;
  return (await detectNative(file)) || (await detectFallback(file));
}
