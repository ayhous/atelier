function formatDateForLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Format Zebra warehouse : 104 x 152 mm portrait, marge non-imprimable 0.5mm L/R
// ZPL: 832 dots largeur, 1216 dots hauteur (8 dots/mm = 203 dpi standard Zebra)
export function buildZPL({ type, client, orderNumber, createdBy, createdAt }) {
  const date = formatDateForLabel(createdAt);
  const header = (type || 'Zone 53').toUpperCase();
  return `^XA
^PW832
^LL1216
^FO40,30^GB752,80,80,B,0^FS
^CF0,60,60
^FO60,45^FR^FD${header}^FS
^CF0,28
^FO60,160^FDCLIENT^FS
^CF0,90,90
^FO60,200^FD${client}^FS
^CF0,28
^FO60,360^FDN COMMANDE^FS
^CF0,70
^FO60,400^FD${orderNumber}^FS
^CF0,28
^FO60,540^FDPREPARE PAR^FS
^CF0,40
^FO60,580^FD${createdBy || ''}^FS
^CF0,28
^FO60,680^FDDATE^FS
^CF0,40
^FO60,720^FD${date}^FS
^XZ`;
}

export function printLabelHTML({ type, client, orderNumber, createdBy, createdAt }) {
  const W = 480, H = 720;
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
  const headerText = (type || 'Zone 53').toUpperCase();

  w.document.write(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>Étiquette ${escapeHtml(orderNumber)}</title>
<style>
  /* Format Zebra réel : 104 x 152 mm, marges non-imprimables 0.5mm gauche/droite */
  @page { size: 104mm 152mm; margin: 0 0.5mm 0 0.5mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, "Helvetica Neue", sans-serif; color: #000; background: #f4f6f8; }

  .label {
    width: 103mm;
    min-height: 152mm;
    background: white;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
  }

  .header {
    background: #000; color: #fff;
    padding: 8mm 6mm;
    text-align: center;
  }
  .header .brand {
    font-size: 30pt; font-weight: 900;
    letter-spacing: 2px;
  }

  .section { padding: 6mm; border-bottom: 1.5px solid #000; }
  .section:last-child { border-bottom: none; }

  .label-small {
    font-size: 9pt; letter-spacing: 1.5px;
    text-transform: uppercase; color: #555;
    margin-bottom: 2mm; font-weight: bold;
  }
  .client-name {
    font-size: 34pt; font-weight: 900;
    line-height: 1.05; word-break: break-word;
  }
  .order-number {
    font-size: 28pt; font-weight: bold;
    letter-spacing: 1px;
  }

  .footer-grid {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 4mm; padding: 6mm;
    font-size: 11pt;
  }
  .footer-grid .label-small { margin-bottom: 1mm; }
  .footer-grid strong { font-size: 13pt; display: block; }

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
    .label {
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
      margin-top: 8px; margin-bottom: 8px;
    }
  }
  @media print {
    body { background: white; }
    .preview-bar { display: none; }
    .label {
      box-shadow: none;
      margin: 0;
      width: 103mm;
      min-height: 152mm;
    }
  }
</style>
</head>
<body>
  <div class="preview-bar">
    <span>Aperçu étiquette (104 × 152 mm)</span>
    <button onclick="window.print()">Imprimer</button>
  </div>
  <div class="label">
    <div class="header">
      <div class="brand">${escapeHtml(headerText)}</div>
    </div>

    <div class="section">
      <div class="label-small">Client</div>
      <div class="client-name">${escapeHtml(client)}</div>
    </div>

    <div class="section">
      <div class="label-small">N° de commande</div>
      <div class="order-number">${escapeHtml(orderNumber)}</div>
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
