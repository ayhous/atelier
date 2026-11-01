// Page d'essai autonome du scan en série : ni connexion, ni backend.
// Sert à tester la caméra, la visée verte et la lecture sur un vrai téléphone.
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import SeriesCapture from './SeriesCapture.jsx';
import './styles.css';

function Essai() {
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState(null);

  return (
    <div className="app">
      <header>
        <h1>Essai — Scan en série</h1>
      </header>
      <section>
        <h2>Test caméra et lecture d'étiquette</h2>
        <p style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.6 }}>
          Rien n'est enregistré et rien n'est envoyé : cette page sert
          uniquement à régler la visée et à mesurer la qualité de lecture.
        </p>
        <button className="primary big" style={{ width: '100%', padding: 14 }}
          onClick={() => setOpen(true)}>
          📸 Ouvrir le scan en série
        </button>
        {last !== null && (
          <p style={{ color: '#10b981', fontSize: 13, marginTop: 14 }}>
            Dernière série : {last} étiquette{last > 1 ? 's' : ''} capturée{last > 1 ? 's' : ''}.
          </p>
        )}
      </section>

      {open && (
        <SeriesCapture
          onClose={() => setOpen(false)}
          onDone={items => { setLast(items.length); setOpen(false); }}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode><Essai /></StrictMode>
);
