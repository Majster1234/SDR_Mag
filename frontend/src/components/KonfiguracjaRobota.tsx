import { useState, useEffect } from 'react';
import { emitAppLog } from './Notifications';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts';

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
  const [aMaeThresh, setAMaeThresh] = useState(1.0);
  const [aMseThresh, setAMseThresh] = useState(1.0);
  const [aIaeThresh, setAIaeThresh] = useState(1.0);
  const [aIseThresh, setAIseThresh] = useState(1.0);

  const [curMaeThresh, setCurMaeThresh] = useState(1.0);
  const [curMseThresh, setCurMseThresh] = useState(1.0);
  const [curIaeThresh, setCurIaeThresh] = useState(1.0);
  const [curIseThresh, setCurIseThresh] = useState(1.0);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // --- STANY DLA KREATORA KOMPENSACJI ---
  const [showCalibModal, setShowCalibModal] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibData, setCalibData] = useState<any>(null);

  // --- STAN DLA KOMPENSACJI TERMICZNEJ ---
  const [thermalConfig, setThermalConfig] = useState<any>({});

  // --- ZMIANA: Zapisujemy pełne dane z API ---
  const [availableSources, setAvailableSources] = useState<any[]>([]);

  // --- STANY DLA AUTOKALIBRACJI WSKAŹNIKÓW ---
  const [showMetricsModal, setShowMetricsModal] = useState(false);
  const [metricsFiles, setMetricsFiles] = useState<string[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [isMetricsCalibrating, setIsMetricsCalibrating] = useState(false);

  // 1. Inicjalne pobieranie list (Roboty i modele AI)
  useEffect(() => {
    const fetchGlobalData = async () => {
      try {
        const resRobots = await fetch('http://127.0.0.1:8000/api/ml/sources');
        if (resRobots.ok) {
          const data = await resRobots.json();
          setAvailableSources(data.sources); // <--- NOWE
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

  const openMetricsCalibration = async () => {
    setShowMetricsModal(true);
    setMetricsFiles([]);
    setSelectedMetrics([]);
    setIsMetricsCalibrating(true); // Używamy tego stanu jako flagi ładowania na czas pobierania

    try {
      // Pobieramy świeżą listę bezpośrednio w momencie otwarcia okienka
      const res = await fetch('http://127.0.0.1:8000/api/ml/sources');
      if (res.ok) {
        const data = await res.json();
        const robotData = data.sources.find((s: any) => s.robot_name === selectedRobot);
        
        if (robotData && robotData.test_files && robotData.test_files.length > 0) {
            setMetricsFiles(robotData.test_files);
            setSelectedMetrics(robotData.test_files); // Domyślnie zaznaczamy wszystkie
        } else {
            emitAppLog('warning', 'Nie znaleziono żadnych plików testowych CSV w folderze tego robota.');
        }
      }
    } catch (e) {
      emitAppLog('error', 'Błąd podczas pobierania listy plików do kalibracji.');
    }
    
    setIsMetricsCalibrating(false);
  };

  const toggleMetricFile = (file: string) => {
    setSelectedMetrics(prev => prev.includes(file) ? prev.filter(f => f !== file) : [...prev, file]);
  };

  const runMetricsCalibration = async () => {
    if (selectedMetrics.length === 0) return alert("Wybierz przynajmniej jeden plik!");
    setIsMetricsCalibrating(true);
    try {
      const res = await fetch('http://127.0.0.1:8000/api/metrics-calibration', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ robot_name: selectedRobot, test_files: selectedMetrics })
      });
      const data = await res.json();
     if (data.status === 'success') {
         setAMaeThresh(data.suggested_thresholds_a.MAE);
         setAMseThresh(data.suggested_thresholds_a.MSE);
         setAIaeThresh(data.suggested_thresholds_a.IAE);
         setAIseThresh(data.suggested_thresholds_a.ISE);

         setCurMaeThresh(data.suggested_thresholds_cur.MAE);
         setCurMseThresh(data.suggested_thresholds_cur.MSE);
         setCurIaeThresh(data.suggested_thresholds_cur.IAE);
         setCurIseThresh(data.suggested_thresholds_cur.ISE);
         
         setShowMetricsModal(false);
         emitAppLog('success', 'Limity zostały dobrane automatycznie dla Kątów i Prądów!');
      } else {
         emitAppLog('error', data.error || 'Błąd autokalibracji');
      }
    } catch(e) {
      emitAppLog('error', 'Błąd połączenia z serwerem');
    }
    setIsMetricsCalibrating(false);
  };

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
      
      // NAPRAWA: Zawsze ustawiamy nazwę na wybranego robota, by pole nie było puste!
      setNewFolderName(selectedRobot); 
      
      try {
        const res = await fetch('http://127.0.0.1:8000/api/robot-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ robot_name: selectedRobot })
        });
        
        if (res.ok) {
          const data = await res.json();
          const cfg = data.config || {};
          
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
          setAMaeThresh(cfg.a_mae_threshold ?? 1.0);
          setAMseThresh(cfg.a_mse_threshold ?? 1.0);
          setAIaeThresh(cfg.a_iae_threshold ?? 1.0);
          setAIseThresh(cfg.a_ise_threshold ?? 1.0);

          setCurMaeThresh(cfg.cur_mae_threshold ?? 1.0);
          setCurMseThresh(cfg.cur_mse_threshold ?? 1.0);
          setCurIaeThresh(cfg.cur_iae_threshold ?? 1.0);
          setCurIseThresh(cfg.cur_ise_threshold ?? 1.0);
          setThermalConfig(cfg.thermal_config || {});
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
      a_mae_threshold: aMaeThresh,
      a_mse_threshold: aMseThresh,
      a_iae_threshold: aIaeThresh,
      a_ise_threshold: aIseThresh,
      cur_mae_threshold: curMaeThresh,
      cur_mse_threshold: curMseThresh,
      cur_iae_threshold: curIaeThresh,
      cur_ise_threshold: curIseThresh,
      thermal_config: thermalConfig,
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

  // --- LOGIKA KREATORA KOMPENSACJI ---
  const runCalibration = async () => {
    if (!selectedRobot) return;
    setShowCalibModal(true);
    setIsCalibrating(true);
    setCalibData(null);
    try {
      const res = await fetch('http://127.0.0.1:8000/api/thermal-calibration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ robot_path: selectedRobot })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setCalibData(data.calibration);
      } else {
        alert("Błąd kalibracji: " + data.error);
        setShowCalibModal(false);
      }
    } catch (err) {
      console.error(err);
      alert("Błąd połączenia z backendem.");
      setShowCalibModal(false);
    } finally {
      setIsCalibrating(false);
    }
  };

  const generateCurveData = (axisData: any) => {
    const data = [];
    const { a, b, c } = axisData.coeffs;
    const minT = Math.floor(axisData.t_min - 5);
    const maxT = Math.ceil(axisData.t_ref + 5);
    
    for (let t = minT; t <= maxT; t += 1) {
      const k = a * Math.log(t) + b;
      data.push({ T: t, k: k });
    }
    return data;
  };

  const applyCalibration = () => {
    const newThermal: any = { ...thermalConfig };
    
    // Nadpisujemy współczynniki dla każdej obliczonej osi
    Object.keys(calibData).forEach(axis => {
      newThermal[axis] = calibData[axis].coeffs;
    });

    setThermalConfig(newThermal);
    setShowCalibModal(false);
    emitAppLog('success', 'Współczynniki wyliczone! Pamiętaj aby zapisać konfigurację (Guzik "Zapisz konfigurację").');
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

        <div style={{ display: 'flex', gap: '15px' }}>
          <button 
            onClick={runCalibration}
            disabled={isSaving || !selectedRobot || isLoading}
            style={{ background: '#ff9800', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '4px', cursor: (!selectedRobot) ? 'not-allowed' : 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <span>🌡️</span> Kreator Kompensacji
          </button>
          
          <button 
            onClick={handleSave} 
            disabled={isSaving || !selectedRobot || isLoading}
            style={{ background: isSaving ? '#444' : '#2196f3', color: '#fff', border: 'none', padding: '8px 25px', borderRadius: '4px', fontWeight: 'bold', cursor: isSaving ? 'wait' : 'pointer', transition: 'background 0.2s' }}
          >
            {isSaving ? 'Zapisywanie...' : '💾 Zapisz konfigurację'}
          </button>
        </div>
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
                  <label style={labelStyle}>
                    Tryb obliczania marginesu
                    <select value={tuningMode} onChange={e => setTuningMode(e.target.value)} style={inputStyle}>
                      <option value="okno">Lokalne Okno (Zalecane - Proporcjonalne)</option>
                      <option value="srednia">Średnia globalna sygnału (Proporcjonalne)</option>
                      <option value="chwilowy">Wartość chwilowa (Sztywne stopnie/%)</option>
                    </select>
                  </label>
                  
                  {/* DYNAMICZNE ETYKIETY W ZALEŻNOŚCI OD TRYBU */}
                  <label style={labelStyle}>
                    Tolerancja Kąta (A) 
                    <span style={{color: '#2196f3', fontSize: '0.75rem', marginLeft: '5px'}}>
                      {tuningMode === 'chwilowy' ? '[Sztywne Stopnie °]' : '[% amplitudy ruchu]'}
                    </span>
                    <input type="number" step="0.1" value={aDeviation} onChange={e => setADeviation(Number(e.target.value))} style={inputStyle} />
                  </label>
                  
                  <label style={labelStyle}>
                    Tolerancja Prądu (Cur) 
                    <span style={{color: '#ffeb3b', fontSize: '0.75rem', marginLeft: '5px'}}>
                      {tuningMode === 'chwilowy' ? '[Sztywne % prądu]' : '[% amplitudy ruchu]'}
                    </span>
                    <input type="number" step="0.1" value={curDeviation} onChange={e => setCurDeviation(Number(e.target.value))} style={inputStyle} />
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <label style={labelStyle}>
                    Martwa strefa szumu Kąta (Min. tolerancja) [°]
                    <input type="number" step="0.01" value={aDeadband} onChange={e => setADeadband(Number(e.target.value))} style={inputStyle} />
                  </label>
                  <label style={labelStyle}>
                    Martwa strefa szumu Prądu (Min. tolerancja) [%]
                    <input type="number" step="0.1" value={curDeadband} onChange={e => setCurDeadband(Number(e.target.value))} style={inputStyle} />
                  </label>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <span style={{ color: '#aaa', fontSize: '0.85rem' }}>Mnożniki graniczne dopuszczalnego błędu w stosunku do bazowego tunelu:</span>
                    <button 
                      onClick={openMetricsCalibration}
                      style={{ background: '#9c27b0', color: '#fff', border: 'none', padding: '6px 15px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <span>🛠️</span> Autokalibracja Limitów
                    </button>
                </div>
                
                {/* SEKCJA KĄTÓW */}
                <h5 style={{ margin: '0 0 10px 0', color: '#00bcd4' }}>Kąty - Pozycje (A)</h5>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '15px', marginBottom: '15px', borderBottom: '1px solid #333', paddingBottom: '15px' }}>
                  <label style={labelStyle}>Próg MAE (A)<input type="number" step="0.1" value={aMaeThresh} onChange={e => setAMaeThresh(Number(e.target.value))} style={inputStyle} /></label>
                  <label style={labelStyle}>Próg MSE (A)<input type="number" step="0.1" value={aMseThresh} onChange={e => setAMseThresh(Number(e.target.value))} style={inputStyle} /></label>
                  <label style={labelStyle}>Próg IAE (A)<input type="number" step="0.1" value={aIaeThresh} onChange={e => setAIaeThresh(Number(e.target.value))} style={inputStyle} /></label>
                  <label style={labelStyle}>Próg ISE (A)<input type="number" step="0.1" value={aIseThresh} onChange={e => setAIseThresh(Number(e.target.value))} style={inputStyle} /></label>
                </div>

                {/* SEKCJA PRĄDÓW */}
                <h5 style={{ margin: '0 0 10px 0', color: '#ffeb3b' }}>Prądy Silników (Cur)</h5>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '15px' }}>
                  <label style={labelStyle}>Próg MAE (Cur)<input type="number" step="0.1" value={curMaeThresh} onChange={e => setCurMaeThresh(Number(e.target.value))} style={inputStyle} /></label>
                  <label style={labelStyle}>Próg MSE (Cur)<input type="number" step="0.1" value={curMseThresh} onChange={e => setCurMseThresh(Number(e.target.value))} style={inputStyle} /></label>
                  <label style={labelStyle}>Próg IAE (Cur)<input type="number" step="0.1" value={curIaeThresh} onChange={e => setCurIaeThresh(Number(e.target.value))} style={inputStyle} /></label>
                  <label style={labelStyle}>Próg ISE (Cur)<input type="number" step="0.1" value={curIseThresh} onChange={e => setCurIseThresh(Number(e.target.value))} style={inputStyle} /></label>
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
          {/* MODAL KATORA KOMPENSACJI */}
          {showCalibModal && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <div style={{ background: '#1e1e1e', padding: '30px', borderRadius: '12px', width: '90%', maxWidth: '1000px', maxHeight: '90vh', overflowY: 'auto', border: '1px solid #333', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '15px', marginBottom: '20px' }}>
                  <h2 style={{ margin: 0, color: '#ff9800', fontSize: '1.5rem' }}>🌡️ Kalibracja Termiczna (Metoda Najmniejszych Kwadratów)</h2>
                  <button onClick={() => setShowCalibModal(false)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.8rem', cursor: 'pointer' }}>×</button>
                </div>

                {isCalibrating ? (
                  <div style={{ textAlign: 'center', padding: '50px 0', color: '#aaa' }}>
                    <h3 style={{ color: '#2196f3', marginBottom: '10px' }}>Skanowanie archiwum i optymalizacja współczynników...</h3>
                    <p>Proszę czekać, algorytm przeszukuje preambuły i analizuje przebiegi.</p>
                  </div>
                ) : calibData ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                      {Object.keys(calibData).map(axis => (
                        <div key={axis} style={{ background: '#141414', padding: '15px', borderRadius: '8px', border: '1px solid #2a2a2a' }}>
                          <h4 style={{ margin: '0 0 10px 0', color: '#00bcd4', textAlign: 'center' }}>Oś {axis}</h4>
                          <div style={{ height: '180px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={generateCurveData(calibData[axis])} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                                <XAxis dataKey="T" stroke="#555" tick={{ fill: '#888', fontSize: 10 }} />
                                <YAxis domain={['auto', 'auto']} stroke="#555" tick={{ fill: '#888', fontSize: 10 }} />
                                <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '4px' }} formatter={(v: any) => Number(v).toFixed(4)} labelFormatter={(l) => `Temp: ${l}°C`} />
                                
                                <Line type="monotone" dataKey="k" stroke="#ffeb3b" strokeWidth={2} dot={false} isAnimationActive={false} name="Wsp. kompensacji (k)" />
                                
                                <ReferenceDot x={calibData[axis].t_min} y={calibData[axis].k_min} r={5} fill="#2196f3" stroke="none" />
                                <ReferenceDot x={calibData[axis].t_mid} y={calibData[axis].k_mid} r={5} fill="#4caf50" stroke="none" />
                                <ReferenceDot x={calibData[axis].t_ref} y={calibData[axis].k_ref} r={5} fill="#f44336" stroke="none" />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '10px', textAlign: 'center' }}>
                            <span style={{color: '#2196f3'}}>Zimny: {calibData[axis].t_min}°C (k={calibData[axis].k_min})</span> | 
                            <span style={{color: '#f44336', marginLeft: '5px'}}>Ref: {calibData[axis].t_ref}°C (k={calibData[axis].k_ref})</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', marginTop: '30px' }}>
                      <button onClick={() => setShowCalibModal(false)} style={{ padding: '10px 20px', background: 'transparent', border: '1px solid #555', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}>Anuluj</button>
                      <button onClick={applyCalibration} style={{ padding: '10px 20px', background: '#4caf50', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Zaakceptuj krzywe</button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          )}
          {/* MODAL AUTOKALIBRACJI WSKAŹNIKÓW */}
          {showMetricsModal && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)' }}>
              <div style={{ background: '#1e1e1e', padding: '30px', borderRadius: '12px', width: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', border: '1px solid #333', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '15px', marginBottom: '20px' }}>
                  <h2 style={{ margin: 0, color: '#9c27b0', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>🛠️ Kalibrator Wskaźników Błędu</h2>
                  <button onClick={() => setShowMetricsModal(false)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.8rem', cursor: 'pointer' }}>×</button>
                </div>

                <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '15px' }}>Zaznacz prawidłowe przejazdy (tzw. Złote Próbki), na podstawie których system automatycznie dopasuje limity MAE/MSE/IAE/ISE, tak by uniknąć fałszywych alarmów.</p>

                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                    <button onClick={() => setSelectedMetrics(metricsFiles)} style={{ background: '#333', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}>Zaznacz wszystkie</button>
                    <button onClick={() => setSelectedMetrics([])} style={{ background: '#333', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}>Odznacz wszystkie</button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', background: '#141414', border: '1px solid #2a2a2a', borderRadius: '6px', padding: '10px' }}>
                    {metricsFiles.length === 0 ? <p style={{ color: '#666', textAlign: 'center' }}>Brak plików w folderach robota.</p> : 
                      metricsFiles.map(file => (
                        <label key={file} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', borderBottom: '1px solid #222', cursor: 'pointer', color: selectedMetrics.includes(file) ? '#fff' : '#666' }}>
                          <input type="checkbox" checked={selectedMetrics.includes(file)} onChange={() => toggleMetricFile(file)} style={{ accentColor: '#9c27b0', width: '16px', height: '16px' }} />
                          <span style={{ fontSize: '0.85rem' }}>{file.split('/').pop()}</span>
                        </label>
                      ))
                    }
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', marginTop: '20px' }}>
                  <button onClick={() => setShowMetricsModal(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #555', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}>Anuluj</button>
                  <button 
                    onClick={runMetricsCalibration} 
                    disabled={isMetricsCalibrating || selectedMetrics.length === 0}
                    style={{ padding: '8px 16px', background: '#9c27b0', border: 'none', color: '#fff', borderRadius: '4px', cursor: isMetricsCalibrating ? 'wait' : 'pointer', fontWeight: 'bold' }}
                  >
                    {isMetricsCalibrating ? 'Kalibracja w toku...' : 'Rozpocznij Kalibrację'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
    
  );
  
};

