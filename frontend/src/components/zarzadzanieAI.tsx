// ZarzadzanieAI.tsx
import { useState, useEffect } from 'react';

interface MLModelEntry {
  group_id: string;
  name: string;
  algorithm: string;
  created_at: string;
  files_used_count: number;
  window_size: number;
  step_size: number;
  axes_trained: string[];
}

export const ZarzadzanieAI = () => {
  // Stany dla formularza uczenia
  const [modelName, setModelName] = useState('Model_Główny_A1_A6');
  const [folderPath, setFolderPath] = useState('Przejazdy z dnia 16_05_26 luzny chwytak');
  const [refPath, setRefPath] = useState('Przejazdy z dnia 16_05_26 luzny chwytak/referencja.csv');
  const [windowSize, setWindowSize] = useState(50); // Np. 50 próbek = 1 sekunda przy 50Hz
  const [stepSize, setStepSize] = useState(10);    // Przesunięcie okna o 10 próbek
  
  // Stany operacyjne
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ status: string; message: string; axes_trained?: string[] } | null>(null);
  
  // Stan dla rejestru modeli (historia)
  const [registry, setRegistry] = useState<{ active_model_group_id: string | null; models: MLModelEntry[] }>({
    active_model_group_id: null,
    models: []
  });

  // Funkcja pobierająca historię modeli z backendu
  const fetchRegistry = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/ml/registry');
      if (response.ok) {
        const data = await response.json();
        setRegistry(data);
      }
    } catch (err) {
      console.error("Błąd pobierania rejestru modeli ML:", err);
    }
  };

  // Pobierz historię modeli przy montowaniu komponentu
  useEffect(() => {
    fetchRegistry();
  }, []);

  // Obsługa wysyłki formularza uczenia
  const handleTrain = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch('http://localhost:8000/api/ml/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_name: modelName,
          folder_path: folderPath,
          reference_path: refPath,
          window_size: windowSize,
          step_size: stepSize
        })
      });
      
      const data = await response.json();
      setMessage(data);
      
      // Jeśli sukces, odśwież tabelę z modelami, aby nowy model od razu się pojawił
      if (data.status === 'success') {
        fetchRegistry();
      }
    } catch (err) {
      setMessage({ status: 'error', message: 'Błąd połączenia z serwerem API.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', textAlign: 'left' }}>
      
      {/* PANEL KREATORA MODUŁU */}
      <div style={{ background: '#111', padding: '2rem', borderRadius: '8px', border: '1px solid #333' }}>
        <h2 style={{ color: '#00ccff', margin: '0 0 5px 0' }}>🧠 Kreator Modeli Anomalii ML</h2>
        <p style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '25px' }}>
          Konfiguracja i trening niezależnych modeli Isolation Forest dla każdej osi w oparciu o uchyb prądowy i analizę okienkową.
        </p>

        <div style={{ display: 'grid', gap: '15px', maxWidth: '600px', marginBottom: '25px' }}>
          <label style={{ color: '#fff', fontSize: '0.9rem' }}>Nazwa bazowa grupy modeli:
            <input type="text" value={modelName} onChange={e => setModelName(e.target.value)} style={{ width: '100%', padding: '8px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px', marginTop: '5px', boxSizing: 'border-box' }} />
          </label>
          
          <label style={{ color: '#fff', fontSize: '0.9rem' }}>Ścieżka do folderu treningowego (zdrowe dane):
            <input type="text" value={folderPath} onChange={e => setFolderPath(e.target.value)} style={{ width: '100%', padding: '8px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px', marginTop: '5px', boxSizing: 'border-box' }} />
          </label>
          
          <label style={{ color: '#fff', fontSize: '0.9rem' }}>Ścieżka do pliku referencyjnego (CSV):
            <input type="text" value={refPath} onChange={e => setRefPath(e.target.value)} style={{ width: '100%', padding: '8px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px', marginTop: '5px', boxSizing: 'border-box' }} />
          </label>
          
          <div style={{ display: 'flex', gap: '15px' }}>
            <label style={{ color: '#fff', fontSize: '0.9rem', flex: 1 }}>Długość okna (liczba próbek):
              <input type="number" value={windowSize} onChange={e => setWindowSize(Number(e.target.value))} style={{ width: '100%', padding: '8px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px', marginTop: '5px', boxSizing: 'border-box' }} />
            </label>
            <label style={{ color: '#fff', fontSize: '0.9rem', flex: 1 }}>Krok przesunięcia (overlap):
              <input type="number" value={stepSize} onChange={e => setStepSize(Number(e.target.value))} style={{ width: '100%', padding: '8px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px', marginTop: '5px', boxSizing: 'border-box' }} />
            </label>
          </div>
        </div>

        <button 
          onClick={handleTrain} 
          disabled={loading} 
          style={{ background: '#00ccff', color: '#000', padding: '12px 24px', border: 'none', borderRadius: '4px', cursor: loading ? 'wait' : 'pointer', fontWeight: 'bold', fontSize: '1rem', transition: '0.2s' }}
        >
          {loading ? '⏳ Trwa przetwarzanie i trening ML...' : '🚀 Rozpocznij Proces Uczenia'}
        </button>

        {message && (
          <div style={{ marginTop: '20px', padding: '15px', borderRadius: '4px', background: message.status === 'success' ? '#1b5e20' : '#b71c1c', color: '#fff', border: message.status === 'success' ? '1px solid #2e7d32' : '1px solid #c62828' }}>
            <strong style={{ fontSize: '1.05rem' }}>{message.status === 'success' ? '✓ Sukces!' : '🛑 Błąd:'}</strong>
            <p style={{ margin: '5px 0 0 0', fontSize: '0.95rem' }}>{message.message}</p>
            {message.axes_trained && (
              <div style={{ marginTop: '10px', fontSize: '0.85rem', background: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '4px' }}>
                <strong>Wytrenowane osie:</strong> {message.axes_trained.join(', ')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* TABELA: BIBLIOTEKA WYUCZONYCH MODELI */}
      <div style={{ background: '#111', padding: '2rem', borderRadius: '8px', border: '1px solid #333' }}>
        <h3 style={{ color: '#ff9800', margin: '0 0 5px 0' }}>📚 Biblioteka Zapisanych Modeli</h3>
        <p style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '20px' }}>
          Historia wygenerowanych struktur matematycznych zabezpieczona na dysku serwera.
        </p>

        {registry.models.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666', border: '1px dashed #444', borderRadius: '6px' }}>
            Brak wytrenowanych modeli. Skonfiguruj parametry powyżej i uruchom pierwszy trening.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', borderRadius: '6px', border: '1px solid #333' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#1a1a1a', borderBottom: '2px solid #444' }}>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Nazwa grupy modeli</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Data utworzenia</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>Pliki bazy</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>Okno / Krok</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Objęte osie robota</th>
                </tr>
              </thead>
              <tbody>
                {registry.models.map((model) => {
                  const isActive = registry.active_model_group_id === model.group_id;
                  return (
                    <tr key={model.group_id} style={{ borderBottom: '1px solid #222', background: isActive ? 'rgba(0, 204, 255, 0.04)' : 'transparent' }}>
                      <td style={{ padding: '12px' }}>
                        <span style={{ 
                          padding: '3px 8px', 
                          borderRadius: '12px', 
                          fontSize: '0.75rem', 
                          fontWeight: 'bold',
                          background: isActive ? '#00ccff' : '#333', 
                          color: isActive ? '#000' : '#aaa' 
                        }}>
                          {isActive ? 'PRODUKCJA' : 'ARCHIWUM'}
                        </span>
                      </td>
                      <td style={{ padding: '12px', fontWeight: 'bold' }}>{model.name}</td>
                      <td style={{ padding: '12px', color: '#aaa' }}>{model.created_at}</td>
                      <td style={{ padding: '12px', textAlign: 'center', color: '#00ccff' }}>{model.files_used_count} szt.</td>
                      <td style={{ padding: '12px', textAlign: 'center', fontFamily: 'monospace' }}>
                        {model.window_size} / {model.step_size} pr.
                      </td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                          {model.axes_trained.map(ax => (
                            <span key={ax} style={{ background: '#222', border: '1px solid #444', padding: '2px 6px', borderRadius: '3px', fontSize: '0.8rem', color: '#ff9800' }}>
                              {ax}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};