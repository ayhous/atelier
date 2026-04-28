import JsBarcode from 'jsbarcode';

function formatDateForLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function generateBarcodeSVG(value) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try {
    JsBarcode(svg, String(value || '0'), {
      format: 'CODE128',
      width: 2.4,
      height: 80,
      displayValue: true,
      fontSize: 16,
      margin: 0,
      background: '#ffffff',
      lineColor: '#000000',
    });
  } catch {
    return '';
  }
  return svg.outerHTML;
}

export function buildZPL({ client, orderNumber, createdBy, createdAt }) {
  const date = formatDateForLabel(createdAt);
  return `^XA
^PW812
^LL1218
^FO40,30^GB732,60,60,B,0^FS
^CF0,40,40
^FO60,40^FR^FDZONE 53 - TRACABILITE^FS
^CF0,28
^FO60,120^FDCLIENT^FS
^CF0,80,80
^FO60,160^FD${client}^FS
^CF0,28
^FO60,300^FDN COMMANDE^FS
^CF0,60
^FO60,340^FD${orderNumber}^FS
^FO60,420^BCN,160,Y,N,N^FD${orderNumber}^FS
^CF0,28
^FO60,650^FDPREPARE PAR^FS
^CF0,40
^FO60,690^FD${createdBy || ''}^FS
^CF0,28
^FO60,770^FDDATE^FS
^CF0,40
^FO60,810^FD${date}^FS
^XZ`;
}

export function printLabelHTML({ client, orderNumber, createdBy, createdAt }) {
  // Preview window centered (4x6 portrait → ~420x600 px)
  const W = 460, H = 700;
  const dualLeft = window.screenLeft ?? window.screenX ?? 0;
  const dualTop = window.screenTop ?? window.screenY ?? 0;
  const winW = window.outerWidth || window.innerWidth || screen.availWidth;
  const winH = window.outerHeight || window.innerHeight || screen.availHeight;
  const left = Math.round(dualLeft + (winW - W) / 2);
  const top = Math.round(dualTop + Math.max(0, (winH - H) / 2));

  const features = `width=${W},height=${H},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`;
  const w = window.open('', '_blank', features);
  if (!w) {
    alert('Le navigateur a bloqué la fenêtre d\'impression. Autorisez les popups pour ce site.');
    return;
  }
  try { w.moveTo(left, top); w.resizeTo(W, H); } catch {}

  const date = formatDateForLabel(createdAt);
  const barcodeSVG = generateBarcodeSVG(orderNumber);

  w.document.write(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>Étiquette ${escapeHtml(orderNumber)}</title>
<style>
  @page { size: 100mm 150mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, "Helvetica Neue", sans-serif; color: #000; background: #f4f6f8; }

  .label {
    width: 100mm; min-height: 150mm;
    background: white; margin: 0 auto;
    display: flex; flex-direction: column;
  }

  .header {
    background: #000; color: #fff;
    padding: 5mm 6mm;
    display: flex; justify-content: space-between; align-items: center;
  }
  .header .brand { font-size: 16pt; font-weight: 900; letter-spacing: 1px; }
  .header .tag { font-size: 9pt; opacity: 0.85; }

  .section { padding: 5mm 6mm; border-bottom: 1px solid #000; }
  .section:last-child { border-bottom: none; }

  .label-small {
    font-size: 8pt; letter-spacing: 1.5px;
    text-transform: uppercase; color: #555;
    margin-bottom: 1.5mm; font-weight: bold;
  }
  .client-name {
    font-size: 30pt; font-weight: 900;
    line-height: 1.05; word-break: break-word;
  }
  .order-number {
    font-size: 22pt; font-weight: bold;
    letter-spacing: 1px; margin-bottom: 3mm;
  }
  .barcode { text-align: center; padding: 2mm 0; }
  .barcode svg { max-width: 100%; height: auto; }

  .footer-grid {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 4mm; padding: 4mm 6mm;
    font-size: 10pt;
  }
  .footer-grid .label-small { margin-bottom: 0.5mm; }
  .footer-grid strong { font-size: 12pt; display: block; }

  /* Preview UI (hidden when printing) */
  .preview-bar {
    background: #2563eb; color: white; padding: 8px 12px;
    display: flex; justify-content: space-between; align-items: center;
    font-size: 13px; font-family: Arial;
  }
  .preview-bar button {
    background: white; color: #2563eb; border: none;
    padding: 6px 14px; border-radius: 4px; cursor: pointer;
    font-weight: bold;
  }
  @media screen {
    .label { box-shadow: 0 4px 16px rgba(0,0,0,0.15); margin-top: 8px; margin-bottom: 8px; }
  }
  @media print {
    body { background: white; }
    .preview-bar { display: none; }
    .label { box-shadow: none; margin: 0; }
  }
</style>
</head>
<body>
  <div class="preview-bar">
    <span>Aperçu étiquette colis</span>
    <button onclick="window.print()">Imprimer</button>
  </div>
  <div class="label">
    <div class="header">
      <span class="brand">ZONE 53</span>
      <span class="tag">TRAÇABILITÉ ATELIER</span>
    </div>

    <div class="section">
      <div class="label-small">Destinataire / Client</div>
      <div class="client-name">${escapeHtml(client)}</div>
    </div>

    <div class="section">
      <div class="label-small">N° de commande</div>
      <div class="order-number">${escapeHtml(orderNumber)}</div>
      <div class="barcode">${barcodeSVG}</div>
    </div>

    <div class="footer-grid">
      <div>
        <div class="label-small">Préparé par</div>
        <strong>${escapeHtml(createdBy || '—')}</strong>
      </div>
      <div>
        <div class="label-small">Date</div>
        <strong>${date}</strong>
      </div>
    </div>
  </div>
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => window.print(), 250);
      window.onafterprint = () => window.close();
    });
  <\/script>
</body></html>`);
  w.document.close();
  w.focus();
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
