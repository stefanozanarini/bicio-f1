import { useMemo, useState } from 'react';
import { generateGrid, portraitSvg, usingPrivatePool } from '../drivers/index.ts';

/** Anteprima dei piloti generati (prototipo del generatore di ritratti). */
export function DriversGallery({ onBack }: { onBack: () => void }) {
  const [seed, setSeed] = useState(2026);
  const grid = useMemo(() => generateGrid(seed, 8), [seed]);

  return (
    <div className="menu">
      <header>
        <h1>
          Piloti<span>.</span>
        </h1>
        <p>Anteprima del generatore di ritratti {usingPrivatePool() ? '' : '(nomi pubblici di riserva)'}</p>
      </header>
      <div className="gallery-actions">
        <button onClick={onBack}>← Menu</button>
        <button className="primary" onClick={() => setSeed((s) => s + 1)}>
          Nuova griglia
        </button>
      </div>
      <div className="gallery">
        {grid.map((d) => (
          <figure key={d.id} className="driver-card">
            {/* SVG generato dal nostro codice, nessun contenuto esterno */}
            <div className="portrait" dangerouslySetInnerHTML={{ __html: portraitSvg(d.portrait) }} />
            <figcaption>
              <strong>{d.name.full}</strong>
              <span>
                {d.name.code} · #{d.portrait.number}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
