import { useState, useEffect } from 'react';
import { emitAppLog } from './Notifications';

const KUKA_MODELS = [
  'Nieokreślony',
  'KR AGILUS (małe obciążenia)',
  'KR CYBERTECH (średnie obciążenia)',
  'KR QUANTEC (duże obciążenia)',
  'KR FORTEC (bardzo duże obc.)',
  'LBR iiwa (Cobot)',
  'KUKA KR C4 (Kontroler)',
  'KUKA KR C5 (Kontroler)'
];

const DIAGNOSIS_METHODS = [
  { id: 'Odchylenia', label: 'Klasyczna: Odchylenia (Tunel %)' },
  { id: 'Odchylenie (offsetowe)', label: 'Klasyczna: Odchylenia (Offset stały)' },
  { id: 'Wskaźniki', label: 'Klasyczna: Wskaźniki matematyczne (MAE, ISE...)' },
  { id: 'Statystyka', label: 'Klasyczna: Analiza Statystyczna (k-Sigma)' },
  { id: 'AI', label: 'Sztuczna Inteligencja: Detekcja Anomalii (ML)' }
];

export const KonfiguracjaRobota = ({ selectedFilePath }: { selectedFilePath: string | null }) => {
  // --- DANE SYSTEMOWE ---
  const [availableRobots, setAvailableRobots] = useState<string[]>([]);
  const [availableAiModels, setAvailableAiModels] = useState<any[]>([]);
  
  // --- AKTYWNY ROBOT ---
  const [selectedRobot, setSelectedRobot] = useState<string>('');

  // --- STANY FORMULARZA ---
  const [newFolderName, setNewFolderName] = useState('');
  const [robotModel, setRobotModel] = useState('Nieokreślony');
  const [location, setLocation] = useState('');
  const [diagnosisType, setDiagnosisType] = useState('Odchylenia');
  const [selectedAiModel, setSelectedAiModel] = useState('');

  // Parametry analityczne
  const [maxViolation, setMaxViolation] = useState(5.0);
  const [aDeviation, setADeviation] = useState(2.0);
  const [curDeviation, setCurDeviation] = useState(2.0);
  const [aDeadband, setADeadband] = useState(0.05);
  const [curDeadband, setCurDeadband] = useState(0.05);
  const [tuningMode, setTuningMode] = useState('okno');
  const [aOffset, setAOffset] = useState(0.1);
  const [curOffset, setCurOffset] = useState(5.0);
  const [sigmaMultiplier, setSigmaMultiplier] = useState(3.0);
  const [maeThresh, setMaeThresh] = useState(1.0);
  const [mseThresh, setMseThresh] = useState(1.0);
  const [iaeThresh, setIaeThresh] = useState(50.0);
  const [iseThresh, setIseThresh] = useState(100.0);

  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // 1. Inicjalne pobieranie list (Roboty i modele AI)
  useEffect(() => {
    const fetchGlobalData = async () => {
      try {
        const resRobots = await fetch('http://127.0.0.1:8000/api/ml/sources');
        if (resRobots.ok) {
          const data = await resRobots.json();
          setAvailableRobots(data.sources.map((s: any) => s.robot_name));
        }

        const resAi = await fetch('http://127.0.0.1:8000/api/ml/registry');
        if (resAi.ok) {
          const aiData = await resAi.json();
          setAvailableAiModels(aiData.models || []);
        }
      } catch (e) {
        emitAppLog('error', 'Błąd podczas pobierania danych początkowych (Roboty / Modele AI).');
      }
    };
    fetchGlobalData();
  }, []);

  // 2. Reakcja na kliknięcie w drzewko (Sidebar)
  useEffect(() => {
    if (selectedFilePath) {
      const robotFromPath = selectedFilePath.split(/[/\\]/)[0];
      if (robotFromPath && robotFromPath !== selectedRobot) {
        setSelectedRobot(robotFromPath);
      }
    }
  }, [selectedFilePath]);

  // 3. Pobieranie konfiguracji po zmianie wybranego robota
  useEffect(() => {
    if (!selectedRobot) return;

    const fetchConfig = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('http://127.0.0.1:8000/api/robot-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ robot_name: selectedRobot })
        });
        
        if (res.ok) {
          const data = await res.json();
          const cfg = data.config || {};
          
          setNewFolderName(selectedRobot); // Domyślnie obecna nazwa
          setRobotModel(cfg.model || 'Nieokreślony');
          setLocation(cfg.location || '');
          setDiagnosisType(cfg.diagnosis_type || 'Odchylenia');
          setSelectedAiModel(cfg.ai_model_id || '');
          
          setMaxViolation(cfg.max_violation_threshold ?? 5.0);
          setADeviation(cfg.a_deviation_threshold ?? 2.0);
          setCurDeviation(cfg.cur_deviation_threshold ?? 2.0);
          setADeadband(cfg.a_deadband_threshold ?? 0.05);
          setCurDeadband(cfg.cur_deadband_threshold ?? 0.05);
          setTuningMode(cfg.tuning_mode || 'okno');
          setAOffset(cfg.a_offset_threshold ?? 0.1);
          setCurOffset(cfg.cur_offset_threshold ?? 5.0);
          setSigmaMultiplier(cfg.sigma_multiplier ?? 3.0);
          setMaeThresh(cfg.mae_threshold ?? 1.0);
          setMseThresh(cfg.mse_threshold ?? 1.0);
          setIaeThresh(cfg.iae_threshold ?? 50.0);
          setIseThresh(cfg.ise_threshold ?? 100.0);
        }
      } catch (e) {
        emitAppLog('error', `Błąd pobierania konfiguracji dla: ${selectedRobot}`);
      }
      setIsLoading(false);
    };

    fetchConfig();
  }, [selectedRobot]);

  // 4. Zapis konfiguracji do backendu (Z Zaimplementowaną zmianą nazwy)
  const handleSave = async () => {
    if (!selectedRobot) return;
    setIsSaving(true);
    
    const configPayload = {
      new_robot_name: newFolderName, // <-- Kluczowe! To idzie do Python API
      model: robotModel,
      location: location,
      diagnosis_type: diagnosisType,
      ai_model_id: selectedAiModel,
      max_violation_threshold: maxViolation,
      a_deviation_threshold: aDeviation,
      cur_deviation_threshold: curDeviation,
      a_deadband_threshold: aDeadband,
      cur_deadband_threshold: curDeadband,
      tuning_mode: tuningMode,
      a_offset_threshold: aOffset,
      cur_offset_threshold: curOffset,
      sigma_multiplier: sigmaMultiplier,
      mae_threshold: maeThresh,
      mse_threshold: mseThresh,
      iae_threshold: iaeThresh,
      ise_threshold: iseThresh,
    };

    try {
      const res = await fetch(`http://127.0.0.1:8000/api/robot-config/${selectedRobot}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configPayload)
      });

      if (res.ok) {
        const data = await res.json();
        emitAppLog('success', `Zapisano parametry dla robota: ${data.new_robot_name}`);
        
        // Jeśli nazwa została zmieniona, uaktualniamy stany w React i wymuszamy refresh bocznego paska
        if (data.new_robot_name !== selectedRobot) {
          setSelectedRobot(data.new_robot_name);
          setAvailableRobots(prev => prev.map(r => r === selectedRobot ? data.new_robot_name : r));
          window.dispatchEvent(new CustomEvent('refreshFileTree'));
        }
      } else {
        const errData = await res.json();
        emitAppLog('error', `Błąd zapisu: ${errData.detail || 'Wystąpił problem na serwerze.'}`);
      }
    } catch (e) {
      emitAppLog('error', 'Błąd sieci: Nie można zapisać danych.');
    }
    
    setIsSaving(false);
  };

  // --- STYLE ERGONOMICZNE ---
  const sectionStyle: React.CSSProperties = {
    background: '#1a1a1a', border: '1px solid #333', borderRadius: '6px', padding: '20px', marginBottom: '20px'
  };
  const labelStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: '6px', color: '#aaa', fontSize: '0.8rem', fontWeight: 'bold'
  };
  const inputStyle: React.CSSProperties = {
    background: '#222', color: '#fff', border: '1px solid #444', padding: '8px 10px', borderRadius: '4px', fontSize: '0.85rem', outline: 'none'
  };

  return (
    <div style={{ textAlign: 'left', maxWidth: '1000px', margin: '0 auto', paddingBottom: '40px' }}>
      
      {/* NAGŁÓWEK I WYBÓR ROBOTA */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #333', paddingBottom: '15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <h2 style={{ color: '#fff', margin: 0, fontSize: '1.4rem' }}>⚙️ Konfiguracja Docelowa</h2>
          
          <select 
            value={selectedRobot} 
            onChange={(e) => setSelectedRobot(e.target.value)}
            style={{ background: '#222', color: '#fff', border: '1px solid #555', padding: '8px 15px', borderRadius: '4px', fontSize: '1rem', fontWeight: 'bold', outline: 'none', cursor: 'pointer' }}
          >
            <option value="" disabled>-- Wybierz robota z floty --</option>
            {availableRobots.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <button 
          onClick={handleSave} 
          disabled={isSaving || !selectedRobot || isLoading}
          style={{ background: isSaving ? '#444' : '#2196f3', color: '#fff', border: 'none', padding: '8px 25px', borderRadius: '4px', fontWeight: 'bold', cursor: isSaving ? 'wait' : 'pointer', transition: 'background 0.2s' }}
        >
          {isSaving ? 'Zapisywanie...' : '💾 Zapisz konfigurację'}
        </button>
      </div>

      {isLoading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Pobieranie ustawień...</div>
      ) : !selectedRobot ? (
        <div style={{ padding: '60px', textAlign: 'center', border: '2px dashed #333', borderRadius: '8px', color: '#666' }}>
          Wybierz robota z listy powyżej lub kliknij folder w drzewku po lewej, aby edytować parametry.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          
          {/* SEKCJA 1: IDENTYFIKACJA */}
          <div style={sectionStyle}>
            <h3 style={{ margin: '0 0 15px 0', color: '#2196f3', fontSize: '1.05rem' }}>Identyfikacja fizyczna</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
              <label style={labelStyle}>
                Nazwa Folderu (Identyfikator)
                <input type="text" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} style={{ ...inputStyle, borderColor: newFolderName !== selectedRobot ? '#ff9800' : '#444' }} />
                {newFolderName !== selectedRobot && <span style={{ color: '#ff9800', fontSize: '0.7rem', fontWeight: 'normal' }}>⚠️ Uwaga: Zmiana wpłynie na strukturę katalogów na dysku.</span>}
              </label>
              <label style={labelStyle}>
                Model KUKA
                <select value={robotModel} onChange={e => setRobotModel(e.target.value)} style={inputStyle}>
                  {KUKA_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <label style={labelStyle}>
                Lokalizacja robota
                <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="np. Hala główna" style={inputStyle} />
              </label>
            </div>
          </div>

          {/* SEKCJA 2: METODA I MODELE AI */}
          <div style={sectionStyle}>
            <h3 style={{ margin: '0 0 15px 0', color: '#4caf50', fontSize: '1.05rem' }}>Domyślna Strategia Diagnostyczna</h3>
            
            <label style={{ ...labelStyle, marginBottom: '15px' }}>
              Zarządca diagnozy (używany automatycznie m.in. przez analizę grupową)
              <select value={diagnosisType} onChange={e => setDiagnosisType(e.target.value)} style={{ ...inputStyle, width: '100%', maxWidth: '400px' }}>
                {DIAGNOSIS_METHODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>

            {/* KONTROLER: AI */}
            {diagnosisType === 'AI' && (
              <div style={{ background: '#222', borderLeft: '4px solid #4caf50', padding: '15px', borderRadius: '4px' }}>
                <label style={labelStyle}>
                  Wybierz wytrenowany model sztucznej inteligencji
                  <select value={selectedAiModel} onChange={e => setSelectedAiModel(e.target.value)} style={{ ...inputStyle, maxWidth: '600px' }}>
                    <option value="">-- Wybierz z biblioteki ML --</option>
                    {availableAiModels.map(ai => (
                      <option key={ai.group_id} value={ai.group_id}>
                        {ai.name} ({ai.algorithm} | Osie: {ai.axes_trained.join(', ')})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {/* KONTROLER: ODCHYLENIA */}
            {diagnosisType === 'Odchylenia' && (
              <div style={{ background: '#222', padding: '15px', borderRadius: '4px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                  <label style={labelStyle}>Tryb wyliczania tunelu
                    <select value={tuningMode} onChange={e => setTuningMode(e.target.value)} style={inputStyle}>
                      <option value="chwilowy">Punkt w punkt</option>
                      <option value="okno">Koperta (Okno kroczące)</option>
                      <option value="srednia">Względem średniej przejazdu</option>
                    </select>
                  </label>
                  <label style={labelStyle}>Max. udział awarii (%)
                    <input type="number" step="1" value={maxViolation} onChange={e => setMaxViolation(Number(e.target.value))} style={inputStyle} />
                  </label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '15px' }}>
                  <label style={labelStyle}>Tol. Kątowa (%)<input type="number" step="0.5" value={aDeviation} onChange={e => setADeviation(Number(e.target.value))} style={inputStyle} /></label>
                  <label style={labelStyle}>Tol. Prądowa (%)<input type="number" step="0.5" value={curDeviation} onChange={e => setCurDeviation(Number(e.target.value))} style={inputStyle} /></label>
                  <label style={labelStyle}>Deadband Kąt. (°)<input type="number" step="0.01" value={aDeadband} onChange={e => setADeadband(Number(e.target.value))} style={inputStyle} /></label>
                  <label style={labelStyle}>Deadband Prąd. (%)<input type="number" step="0.01" value={curDeadband} onChange={e => setCurDeadband(Number(e.target.value))} style={inputStyle} /></label>
                </div>
              </div>
            )}

            {/* KONTROLER: ODCHYLENIA OFFSETOWE */}
            {diagnosisType === 'Odchylenie (offsetowe)' && (
              <div style={{ background: '#222', padding: '15px', borderRadius: '4px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
                  <label style={labelStyle}>Max. udział awarii (%)<input type="number" step="1" value={maxViolation} onChange={e => setMaxViolation(Number(e.target.value))} style={inputStyle} /></label>
                  <label style={labelStyle}>Stały offset kątowy (°)<input type="number" step="0.05" value={aOffset} onChange={e => setAOffset(Number(e.target.value))} style={inputStyle} /></label>
                  <label style={labelStyle}>Stały offset prądowy (%)<input type="number" step="0.5" value={curOffset} onChange={e => setCurOffset(Number(e.target.value))} style={inputStyle} /></label>
                </div>
              </div>
            )}

            {/* KONTROLER: WSKAŹNIKI */}
            {diagnosisType === 'Wskaźniki' && (
              <div style={{ background: '#222', padding: '15px', borderRadius: '4px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '15px' }}>
                  <label style={labelStyle}>Próg MAE (Kalibracja)<input type="number" step="0.5" value={maeThresh} onChange={e => setMaeThresh(Number(e.target.value))} style={inputStyle} /></label>
                  <label style={labelStyle}>Próg MSE (Drgania)<input type="number" step="0.5" value={mseThresh} onChange={e => setMseThresh(Number(e.target.value))} style={inputStyle} /></label>
                  <label style={labelStyle}>Próg IAE (Zużycie)<input type="number" step="5" value={iaeThresh} onChange={e => setIaeThresh(Number(e.target.value))} style={inputStyle} /></label>
                  <label style={labelStyle}>Próg ISE (Kolizje)<input type="number" step="5" value={iseThresh} onChange={e => setIseThresh(Number(e.target.value))} style={inputStyle} /></label>
                </div>
              </div>
            )}

            {/* KONTROLER: STATYSTYKA */}
            {diagnosisType === 'Statystyka' && (
              <div style={{ background: '#222', padding: '15px', borderRadius: '4px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', maxWidth: '500px' }}>
                  <label style={labelStyle}>Mnożnik k-Sigma (σ)<input type="number" step="0.1" value={sigmaMultiplier} onChange={e => setSigmaMultiplier(Number(e.target.value))} style={inputStyle} /></label>
                  <label style={labelStyle}>Max. udział awarii (%)<input type="number" step="1" value={maxViolation} onChange={e => setMaxViolation(Number(e.target.value))} style={inputStyle} /></label>
                </div>
              </div>
            )}
          </div>

          {/* SEKCJA 3: MLOps / UCZENIE - ZAŚLEPKA */}
          <div style={{ ...sectionStyle, opacity: 0.8 }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#e91e63', fontSize: '1.05rem' }}>Zarządzanie Przestrzenią Uczącą (Zamrożone)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
              <label style={labelStyle}>Katalog treningowy<input type="text" defaultValue="Archiwum" disabled style={{ ...inputStyle, opacity: 0.5 }} /></label>
              <label style={labelStyle}>Domyślne Okno<input type="number" defaultValue={50} disabled style={{ ...inputStyle, opacity: 0.5 }} /></label>
              <label style={labelStyle}>Domyślny Krok<input type="number" defaultValue={10} disabled style={{ ...inputStyle, opacity: 0.5 }} /></label>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};