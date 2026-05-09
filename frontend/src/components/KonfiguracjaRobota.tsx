// KonfiguracjaRobota.tsx
import { useState, useEffect } from 'react';

export const KonfiguracjaRobota = ({ selectedFilePath }: { selectedFilePath: string | null }) => {
  const robotName = selectedFilePath ? selectedFilePath.split(/[/\\]/)[1] : '';
  
  const [config, setConfig] = useState({ 
    description: '', model: '', location: '',
    is_diagnosed: false,
    diagnosis_type: 'Odchylenia', 
    a_deadband_threshold: 0.1,
    cur_deadband_threshold: 0.5,
    a_deviation_threshold: 2,
    cur_deviation_threshold: 10,
    a_offset_threshold: 0.1,
    cur_offset_threshold: 2.0,
    max_violation_threshold: 30.0,
    selected_metric: 'MAE', 
    metric_threshold: 10
  });

  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{type: 'success' | 'error' | '', msg: string}>({type: '', msg: ''});

  useEffect(() => {
    if (!robotName) return;
    setStatus({type: '', msg: ''});
    const fetchConfig = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/robot-config/${robotName}`);
        if (res.ok) {
          const data = await res.json();
          setConfig(prev => ({ ...prev, ...data }));
        }
      } catch (e) { console.error(e); }
    };
    fetchConfig();
  }, [robotName]);

  const handleChange = (field: string, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setStatus({type: '', msg: ''});
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/robot-config/${robotName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (res.ok) {
        setStatus({type: 'success', msg: 'Zapisano pomyślnie!'});
        setTimeout(() => setStatus({type: '', msg: ''}), 3000);
      }
    } catch (e) {
      setStatus({type: 'error', msg: 'Błąd połączenia.'});
    }
    setIsSaving(false);
  };

  if (!robotName) {
    return (
      <div style={{ marginTop: '2rem', padding: '3rem', border: '2px dashed #444', borderRadius: '8px', color: '#aaa', textAlign: 'center' }}>
        <span style={{ fontSize: '2rem' }}>👈</span><br/><br/>
        Wybierz robota z drzewka, aby edytować konfigurację.
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'left', maxWidth: '800px' }}>
      <h2 style={{ color: '#4caf50' }}>⚙️ Konfiguracja robota: {robotName}</h2>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '1.5rem', padding: '1.5rem', backgroundColor: '#1a1a1a', borderRadius: '8px', border: '1px solid #444' }}>
        
        <section>
          <h4 style={{ color: '#aaa', marginBottom: '10px', borderBottom: '1px solid #333' }}>Dane podstawowe</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#888' }}>Model</label>
              <input type="text" value={config.model} onChange={e => handleChange('model', e.target.value)} style={{ width: '100%', padding: '8px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: '#888' }}>Lokalizacja</label>
              <input type="text" value={config.location} onChange={e => handleChange('location', e.target.value)} style={{ width: '100%', padding: '8px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px' }} />
            </div>
          </div>
          <div style={{ marginTop: '10px' }}>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#888' }}>Opis</label>
            <textarea value={config.description} onChange={e => handleChange('description', e.target.value)} style={{ width: '100%', padding: '8px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px', height: '60px' }} />
          </div>
        </section>

        <section style={{ backgroundColor: '#222', padding: '1rem', borderRadius: '6px' }}>
          <h4 style={{ color: '#00bcd4', marginTop: 0, marginBottom: '15px' }}>🛠️ Parametry diagnostyki</h4>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
            <input type="checkbox" checked={config.is_diagnosed} onChange={e => handleChange('is_diagnosed', e.target.checked)} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
            <label style={{ color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>Robot podlega automatycznej diagnozie</label>
          </div>

          {config.is_diagnosed && (
            <div style={{ paddingLeft: '28px', display: 'flex', flexDirection: 'column', gap: '15px', borderLeft: '2px solid #333' }}>
              <div>
                <label style={{ color: '#aaa', fontSize: '0.9rem', marginRight: '10px' }}>Typ diagnozy:</label>
                <select value={config.diagnosis_type} onChange={e => handleChange('diagnosis_type', e.target.value)} style={{ padding: '6px', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: '4px' }}>
                  <option value="Odchylenia">Odchylenie (procentowe)</option>
                  <option value="Odchylenie (offsetowe)">Odchylenie (offsetowe)</option>
                  <option value="Wskaźniki">Wskaźniki matematyczne</option>
                </select>
              </div>

              <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {config.diagnosis_type === 'Odchylenia' && (
                  <>
                    <div>
                      <label style={{ display: 'block', color: '#888', fontSize: '0.8rem' }}>Tolerancja Osie (A) [%]</label>
                      <input type="number" value={config.a_deviation_threshold} onChange={e => handleChange('a_deviation_threshold', Number(e.target.value))} style={{ width: '100%', padding: '8px', background: '#333', color: '#fff', border: '1px solid #555' }} />
                      
                      <label style={{ display: 'block', color: '#888', fontSize: '0.8rem', marginTop: '10px' }}>Strefa martwa Osie (A) [°]</label>
                      <input type="number" step="0.01" value={config.a_deadband_threshold} onChange={e => handleChange('a_deadband_threshold', Number(e.target.value))} style={{ width: '100%', padding: '8px', background: '#333', color: '#fff', border: '1px solid #555' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#888', fontSize: '0.8rem' }}>Tolerancja Prądy (Cur) [%]</label>
                      <input type="number" value={config.cur_deviation_threshold} onChange={e => handleChange('cur_deviation_threshold', Number(e.target.value))} style={{ width: '100%', padding: '8px', background: '#333', color: '#fff', border: '1px solid #555' }} />
                      
                      <label style={{ display: 'block', color: '#888', fontSize: '0.8rem', marginTop: '10px' }}>Strefa martwa Prądy (Cur) [%]</label>
                      <input type="number" step="0.1" value={config.cur_deadband_threshold} onChange={e => handleChange('cur_deadband_threshold', Number(e.target.value))} style={{ width: '100%', padding: '8px', background: '#333', color: '#fff', border: '1px solid #555' }} />
                    </div>
                  </>
                )}

                {config.diagnosis_type === 'Odchylenie (offsetowe)' && (
                  <>
                    <div>
                      <label style={{ display: 'block', color: '#888', fontSize: '0.8rem' }}>Offset Osie (A) [°]</label>
                      <input type="number" step="0.01" value={config.a_offset_threshold} onChange={e => handleChange('a_offset_threshold', Number(e.target.value))} style={{ width: '100%', padding: '8px', background: '#333', color: '#fff', border: '1px solid #555' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: '#888', fontSize: '0.8rem' }}>Offset Prądy (Cur) [%]</label>
                      <input type="number" step="0.1" value={config.cur_offset_threshold} onChange={e => handleChange('cur_offset_threshold', Number(e.target.value))} style={{ width: '100%', padding: '8px', background: '#333', color: '#fff', border: '1px solid #555' }} />
                    </div>
                  </>
                )}
              </div>
              {config.diagnosis_type === 'Wskaźniki' && (
                <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                  <div>
                    <label style={{ color: '#aaa', fontSize: '0.9rem' }}>Wskaźnik:</label>
                    <select value={config.selected_metric} onChange={e => handleChange('selected_metric', e.target.value)} style={{ marginLeft: '10px', padding: '6px', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: '4px' }}>
                      <option value="IAE">IAE (Integral Absolute Error)</option>
                      <option value="ISE">ISE (Integral Square Error)</option>
                      <option value="MAE">MAE (Mean Absolute Error)</option>
                      <option value="MSE">MSE (Mean Square Error)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ color: '#aaa', fontSize: '0.9rem' }}>Dopuszczalny błąd (%):</label>
                    <input type="number" value={config.metric_threshold} onChange={e => handleChange('metric_threshold', Number(e.target.value))} style={{ width: '80px', marginLeft: '10px', padding: '6px', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: '4px' }} />
                  </div>
                </div>
              )}
              {(config.diagnosis_type === 'Odchylenia' || config.diagnosis_type === 'Odchylenie (offsetowe)') && (
                <div style={{ marginTop: '15px', padding: '10px', background: '#333', borderRadius: '4px' }}>
                  <label style={{ color: '#aaa', fontSize: '0.85rem' }}>Dopuszczalny % próbek poza tolerancją (Próg awarii):</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
                    <input 
                      type="number" step="0.1"
                      value={config.max_violation_threshold} 
                      onChange={e => handleChange('max_violation_threshold', Number(e.target.value))} 
                      style={{ width: '80px', padding: '6px', background: '#222', color: '#fff', border: '1px solid #555', borderRadius: '4px' }} 
                    />
                    <span style={{ color: '#888', fontSize: '0.9rem' }}>% (powyżej tego progu wskaźnik będzie czerwony)</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button onClick={handleSave} disabled={isSaving} style={{ padding: '10px 25px', background: '#4caf50', color: 'white', border: 'none', borderRadius: '4px', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
            {isSaving ? 'Zapisywanie...' : '💾 Zapisz konfigurację'}
          </button>
          {status.msg && <span style={{ color: status.type === 'success' ? '#4caf50' : '#f44336', fontWeight: 'bold' }}>{status.msg}</span>}
        </div>
      </div>
    </div>
  );
};