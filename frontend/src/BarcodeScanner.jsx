import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

const REGION_ID = 'barcode-scan-region';

const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.QR_CODE,
];

export default function BarcodeScanner({ onDetect, onClose }) {
  const scannerRef = useRef(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const scanner = new Html5Qrcode(REGION_ID, { formatsToSupport: SUPPORTED_FORMATS });
    scannerRef.current = scanner;

    const config = {
      fps: 10,
      qrbox: (viewW, viewH) => {
        const size = Math.min(viewW, viewH);
        // Rectangle large : mieux pour les codes-barres 1D
        return { width: Math.round(size * 0.85), height: Math.round(size * 0.45) };
      },
      aspectRatio: 1.7778,
      videoConstraints: { facingMode: { ideal: 'environment' } },
    };

    scanner
      .start(
        { facingMode: { ideal: 'environment' } },
        config,
        (decodedText) => {
          onDetect(decodedText.trim());
        },
        () => { /* ignore les erreurs par frame */ },
      )
      .then(() => { if (!cancelled) setStarting(false); })
      .catch((err) => {
        if (cancelled) return;
        setStarting(false);
        const msg = err?.message || String(err);
        if (/permission|denied|notallowed/i.test(msg)) {
          setError('Accès caméra refusé. Autorise la caméra dans les paramètres du navigateur.');
        } else if (/notfound|no camera/i.test(msg)) {
          setError('Aucune caméra détectée sur cet appareil.');
        } else {
          setError('Impossible de démarrer la caméra : ' + msg);
        }
      });

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s) {
        s.stop().catch(() => {}).finally(() => s.clear().catch(() => {}));
      }
    };
  }, [onDetect]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-scanner" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h3>Scanner un code-barres</h3>
          <button className="ghost" onClick={onClose}>Fermer</button>
        </header>

        <div className="scanner-body">
          <div id={REGION_ID} className="scanner-region"></div>

          {starting && !error && (
            <p className="scanner-hint">Démarrage de la caméra…</p>
          )}
          {error && (
            <div className="scanner-error">{error}</div>
          )}
          {!starting && !error && (
            <p className="scanner-hint">
              Pointe la caméra vers le code-barres. Détection automatique.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
