function formatDateForLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function buildZPL({ client, orderNumber, createdBy, createdAt }) {
  const date = formatDateForLabel(createdAt);
  return `^XA
^CF0,30
^FO20,20^FDEmploye: ${createdBy || ''}^FS
^FO20,60^FDCmd: ${orderNumber}^FS
^CF0,40
^FO20,100^FDClient: ${client}^FS
^CF0,30
^FO20,160^FDDate: ${date}^FS
^FO20,200^BCN,80,Y,N,N^FD${orderNumber}^FS
^XZ`;
}

export function printLabelHTML({ client, orderNumber, createdBy, createdAt }) {
  const W = 520, H = 420;
  // Center popup over the current browser window (works across multi-monitor)
  const dualLeft = window.screenLeft ?? window.screenX ?? 0;
  const dualTop = window.screenTop ?? window.screenY ?? 0;
  const winW = window.outerWidth || window.innerWidth || screen.availWidth;
  const winH = window.outerHeight || window.innerHeight || screen.availHeight;
  const left = Math.round(dualLeft + (winW - W) / 2);
  const top = Math.round(dualTop + (winH - H) / 2);

  const features = `width=${W},height=${H},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`;
  const w = window.open('', '_blank', features);
  if (!w) {
    alert('Le navigateur a bloqué la fenêtre d\'impression. Autorisez les popups pour ce site.');
    return;
  }
  // Force position again once opened (some Chromium versions ignore the first time)
  try { w.moveTo(left, top); w.resizeTo(W, H); } catch {}

  const date = formatDateForLabel(createdAt);
  w.document.write(`
    <html><head><title>Étiquette ${orderNumber}</title>
    <style>
      @page { size: 100mm 50mm; margin: 3mm; }
      html, body { margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; padding: 4mm; color: #000; }
      .row { font-size: 14pt; margin: 2px 0; }
      .client { font-size: 22pt; font-weight: bold; margin: 4px 0; line-height: 1.1; }
      .label { font-weight: bold; }
      @media screen {
        body { background: white; max-width: 100mm; border: 1px solid #ccc; margin: 8px auto; }
        .preview-bar {
          background: #2563eb; color: white; padding: 8px;
          display: flex; justify-content: space-between; align-items: center;
          font-family: Arial; font-size: 13px;
        }
        .preview-bar button {
          background: white; color: #2563eb; border: none;
          padding: 6px 14px; border-radius: 4px; cursor: pointer; font-weight: bold;
        }
      }
      @media print { .preview-bar { display: none; } body { border: none; } }
    </style></head>
    <body>
      <div class="preview-bar">
        <span>Aperçu étiquette</span>
        <button onclick="window.print()">Imprimer</button>
      </div>
      <div class="row"><span class="label">Employé:</span> ${escapeHtml(createdBy || '')}</div>
      <div class="row"><span class="label">Cmd:</span> ${escapeHtml(orderNumber)}</div>
      <div class="client">Client: ${escapeHtml(client)}</div>
      <div class="row"><span class="label">Date:</span> ${date}</div>
      <script>
        window.addEventListener('load', () => {
          setTimeout(() => window.print(), 200);
          window.onafterprint = () => window.close();
        });
      <\/script>
    </body></html>
  `);
  w.document.close();
  w.focus();
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
