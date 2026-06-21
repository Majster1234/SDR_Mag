import { useState, useEffect } from 'react';
import { emitAppLog } from './Notifications';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, ReferenceArea, Legend } from 'recharts';

interface MLModelEntry {
  group_id: string;
  name: string;
  algorithm: string;
  contamination: number;
  created_at: string;
  files_used_count: number;
  window_size: number;
  step_size: number;
  axes_trained: string[];
}

interface MLSource {
  robot_name: string;
  data_folders: string[];
  reference_files: string[];
  test_files: string[];
}

const FEATURE_LABELS: Record<string, string> = {
  mae: 'Średni Uchyb (MAE)',
  rmse: 'Błąd Średniokwadratowy (RMSE)',
  var: 'Wariancja uchybu (VAR)',
  ptp: 'Rozstęp (Peak-to-Peak)'
};

export const ZarzadzanieAI = () => {
  const [sources, setSources] = useState<MLSource[]>([]);
  const [selectedRobot, setSelectedRobot] = useState<string>('');

  const [modelName, setModelName] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [refPath, setRefPath] = useState('');
  const [windowSize, setWindowSize] = useState(50); 
  const [stepSize, setStepSize] = useState(10);    
  const [selectedAlgorithm, setSelectedAlgorithm] = useState('Isolation Forest');
  const [contamination, setContamination] = useState(0.03);
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ status: string; message: string; axes_trained?: string[] } | null>(null);
  const [registry, setRegistry] = useState<{ active_model_group_id: string | null; models: MLModelEntry[] }>({
    active_model_group_id: null,
    models: []
  });

  const [selectedGroupToView, setSelectedGroupToView] = useState<MLModelEntry | null>(null);
  const [selectedAxisToView, setSelectedAxisToView] = useState<string>('');
  
  const [allChartData, setAllChartData] = useState<Record<string, any[]>>({});
  const [chartData, setChartData] = useState<any[]>([]);
  const [isChartLoading, setIsChartLoading] = useState(false);

  const [modelToDelete, setModelToDelete] = useState<MLModelEntry | null>(null);

  const [testFilePath, setTestFilePath] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  // --- NOWOŚĆ: STAN PASKA POSTĘPU ---
  const [testProgress, setTestProgress] = useState<number>(0);
  const [testResults, setTestResults] = useState<Record<string, { chartData: any[], violationAreas: any[], anomalyPercent: number }> | null>(null);

  const [xAxisFeature, setXAxisFeature] = useState('var');
  const [yAxisFeature, setYAxisFeature] = useState('rmse');

  const fetchData = async () => {
    try {
      const regRes = await fetch('http://localhost:8000/api/ml/registry');
      if (regRes.ok) setRegistry(await regRes.json());

      const srcRes = await fetch('http://localhost:8000/api/ml/sources');
      if (srcRes.ok) {
        const data = await srcRes.json();
        setSources(data.sources);
        if (data.sources.length > 0) {
          handleRobotChange(data.sources[0].robot_name, data.sources);
        }
      }
    } catch (err) {
      emitAppLog('error', 'Nie udało się pobrać danych struktury katalogów z serwera.');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const fetchAllChartData = async () => {
      if (!selectedGroupToView) return;
      setIsChartLoading(true);
      try {
        const res = await fetch(`http://localhost:8000/api/ml/model-data-all/${selectedGroupToView.group_id}`);
        const data = await res.json();
        
        if (data.status === 'success') {
          setAllChartData(data.data); 
          const firstAxis = selectedGroupToView.axes_trained[0];
          setSelectedAxisToView(firstAxis);
          setChartData(data.data[firstAxis] || []);
        } else {
          emitAppLog('error', `Błąd ładowania danych wykresu: ${data.error}`);
        }
      } catch (err) {
        emitAppLog('error', 'Błąd sieci podczas pobierania punktów wykresu.');
      } finally {
        setIsChartLoading(false);
      }
    };
    fetchAllChartData();
  }, [selectedGroupToView]);

  useEffect(() => {
    if (selectedAxisToView && allChartData[selectedAxisToView]) {
      setChartData(allChartData[selectedAxisToView]);
    }
  }, [selectedAxisToView, allChartData]);

  const handleRobotChange = (robotName: string, availableSources = sources) => {
    setSelectedRobot(robotName);
    const source = availableSources.find(s => s.robot_name === robotName);
    if (source) {
      setFolderPath(source.data_folders[0] || '');
      setRefPath(source.reference_files[0] || '');
      setModelName(`Model_${robotName.replace(/\s+/g, '_')}_Bazowy`);
    }
  };

  const handleTrain = async () => {
    if (!folderPath || !refPath) return;
    setLoading(true);
    setMessage(null);
    emitAppLog('info', `Rozpoczynam trening modelu ML: ${modelName}...`);

    try {
      const response = await fetch('http://localhost:8000/api/ml/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_name: modelName,
          folder_path: folderPath,
          reference_path: refPath,
          window_size: windowSize,
          step_size: stepSize,
          algorithm: selectedAlgorithm,
          contamination: contamination
        })
      });
      
      const data = await response.json();
      if (data.status === 'success') {
        emitAppLog('success', `Trening ukończony! Zapisano osie: ${data.axes_trained.join(', ')}.`);
        setMessage(data);
        const regRes = await fetch('http://localhost:8000/api/ml/registry');
        if (regRes.ok) setRegistry(await regRes.json());
      } else {
        emitAppLog('error', `Błąd uczenia ML: ${data.message}`);
        setMessage(data);
      }
    } catch (err) {
      emitAppLog('error', 'Krytyczny błąd API podczas treningu.');
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!modelToDelete) return;
    try {
      const res = await fetch(`http://localhost:8000/api/ml/models/${modelToDelete.group_id}`, { method: 'DELETE' });
      const data = await res.json();
      
      if (data.status === 'success') {
        emitAppLog('success', `Usunięto bazę modelu: ${modelToDelete.name}`);
        const regRes = await fetch('http://localhost:8000/api/ml/registry');
        if (regRes.ok) setRegistry(await regRes.json());
        
        if (selectedGroupToView?.group_id === modelToDelete.group_id) {
          setSelectedGroupToView(null);
          setChartData([]);
        }
      } else {
        emitAppLog('error', `Błąd usuwania modelu: ${data.message}`);
      }
    } catch (err) {
      emitAppLog('error', 'Krytyczny błąd API podczas usuwania modelu.');
    } finally {
      setModelToDelete(null); 
    }
  };

  const handleTestFile = async () => {
    if (!selectedGroupToView || !testFilePath || !refPath) {
      emitAppLog('warning', 'Wybierz plik z listy oraz upewnij się, że wybrano referencję.');
      return;
    }
    
    setIsTesting(true);
    setTestProgress(0); // Reset paska
    setTestResults(null);
    emitAppLog('info', `Uruchamiam AI (${selectedGroupToView.algorithm}) dla wszystkich osi pliku: ${testFilePath}`);
    
    // Zmienne pomocnicze do obliczania postępu
    const totalAxes = selectedGroupToView.axes_trained.length;
    let completedCount = 0;

    try {
      const fetchPromises = selectedGroupToView.axes_trained.map(async (ax) => {
        const response = await fetch('http://localhost:8000/api/ml/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            group_id: selectedGroupToView.group_id,
            axis: ax,
            test_file_path: testFilePath,
            reference_file_path: refPath
          })
        });
        const data = await response.json();
        
        // --- NOWOŚĆ: Po każdym udanym pobraniu osi podbijamy pasek postępu ---
        completedCount++;
        setTestProgress(Math.round((completedCount / totalAxes) * 100));

        return { axis: ax, data };
      });

      const resultsArray = await Promise.all(fetchPromises);
      const resultsObj: Record<string, any> = {};
      let maxAnomaly = 0;
      let anySuccess = false;

      resultsArray.forEach(({ axis, data }) => {
        if (data.status === 'success') {
          resultsObj[axis] = data;
          if (data.anomalyPercent > maxAnomaly) maxAnomaly = data.anomalyPercent;
          anySuccess = true;
        } else {
          emitAppLog('error', `Błąd testu dla osi ${axis}: ${data.message}`);
        }
      });

      if (anySuccess) {
        setTestResults(resultsObj);
        emitAppLog(maxAnomaly > 0 ? 'warning' : 'success', `Zakończono weryfikację. Maksymalna anomalia: ${maxAnomaly}%`);
      }

    } catch (err) {
      emitAppLog('error', 'Krytyczny błąd sieci podczas weryfikacji pliku.');
    } finally {
      setIsTesting(false);
      // Małe opóźnienie przed wyzerowaniem, by użytkownik zobaczył "100%"
      setTimeout(() => setTestProgress(0), 1000);
    }
  };

  useEffect(() => {
    if (activeSource && activeSource.test_files.length > 0) {
      setTestFilePath(activeSource.test_files[0]);
    } else {
      setTestFilePath('');
    }
  }, [selectedRobot, sources]);

  const activeSource = sources.find(s => s.robot_name === selectedRobot);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', textAlign: 'left' }}>
      
      <div style={{ background: '#111', padding: '2rem', borderRadius: '8px', border: '1px solid #333' }}>
        <h2 style={{ color: '#00ccff', margin: '0 0 5px 0' }}>🧠 Kreator Modeli Anomalii ML</h2>
        <p style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '25px' }}>Wybierz robota z listy, a system automatycznie wczyta dostępne pakiety danych.</p>

        <div style={{ display: 'grid', gap: '15px', maxWidth: '600px', marginBottom: '25px' }}>
          <label style={{ color: '#ff9800', fontSize: '0.9rem', fontWeight: 'bold' }}>1. Wybierz robota:
            <select value={selectedRobot} onChange={e => handleRobotChange(e.target.value)} style={{ width: '100%', padding: '10px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px', marginTop: '5px', boxSizing: 'border-box' }}>
              {sources.map(s => <option key={s.robot_name} value={s.robot_name}>{s.robot_name}</option>)}
            </select>
          </label>

          <label style={{ color: '#fff', fontSize: '0.9rem' }}>2. Wybierz folder uczący (np. Archiwum):
            <select value={folderPath} onChange={e => setFolderPath(e.target.value)} style={{ width: '100%', padding: '8px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px', marginTop: '5px', boxSizing: 'border-box' }}>
              {activeSource?.data_folders.map(folder => <option key={folder} value={folder}>📂 {folder}</option>)}
            </select>
          </label>
          
          <label style={{ color: '#fff', fontSize: '0.9rem' }}>3. Przebieg referencyjny:
            <select value={refPath} onChange={e => setRefPath(e.target.value)} style={{ width: '100%', padding: '8px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px', marginTop: '5px', boxSizing: 'border-box' }}>
              {activeSource?.reference_files.map(file => <option key={file} value={file}>📄 {file}</option>)}
            </select>
          </label>

          <label style={{ color: '#fff', fontSize: '0.9rem', marginTop: '10px' }}>4. Nazwa grupy modeli:
            <input type="text" value={modelName} onChange={e => setModelName(e.target.value)} style={{ width: '100%', padding: '8px', background: '#1a1a1a', color: '#00ccff', border: '1px solid #444', borderRadius: '4px', marginTop: '5px', boxSizing: 'border-box', fontWeight: 'bold' }} />
          </label>
          
          <label style={{ color: '#fff', fontSize: '0.9rem', marginTop: '10px' }}>5. Metoda / Silnik Sztucznej Inteligencji:
            <select 
              value={selectedAlgorithm} 
              onChange={e => setSelectedAlgorithm(e.target.value)} 
              style={{ width: '100%', padding: '8px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px', marginTop: '5px', boxSizing: 'border-box', outline: 'none' }}
            >
              <option value="Isolation Forest">Isolation Forest (Las Izolacji)</option>
              <option value="One-Class SVM">One-Class SVM (Wektory Nośne)</option>
              <option value="LOF">LOF (Analiza Gęstości Sąsiadów)</option>
            </select>
          </label>

          <div style={{ display: 'flex', gap: '15px', background: '#1a1a1a', padding: '15px', borderRadius: '6px', border: '1px dashed #444', marginTop: '10px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ color: '#aaa', fontSize: '0.85rem' }}>Długość okna:
                <input type="number" value={windowSize} onChange={e => setWindowSize(Number(e.target.value))} style={{ width: '100%', padding: '8px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px', marginTop: '5px', boxSizing: 'border-box' }} />
              </label>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ color: '#aaa', fontSize: '0.85rem' }}>Krok:
                <input type="number" value={stepSize} onChange={e => setStepSize(Number(e.target.value))} style={{ width: '100%', padding: '8px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px', marginTop: '5px', boxSizing: 'border-box' }} />
              </label>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ color: '#aaa', fontSize: '0.85rem' }}>Czułość (0.01 - 0.20):
                <input 
                  type="number" 
                  step="0.01" 
                  min="0.01" 
                  max="0.30" 
                  value={contamination} 
                  onChange={e => setContamination(Number(e.target.value))} 
                  style={{ width: '100%', padding: '8px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px', marginTop: '5px', boxSizing: 'border-box' }} 
                />
              </label>
            </div>
          </div>
        </div>

        <button onClick={handleTrain} disabled={loading || !folderPath || !refPath} style={{ background: (!folderPath || !refPath) ? '#555' : '#00ccff', color: '#000', padding: '12px 24px', border: 'none', borderRadius: '4px', cursor: (loading || !folderPath) ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '1rem', transition: '0.2s' }}>
          {loading ? '⏳ Trwa trening ML...' : '🚀 Rozpocznij Trening Modeli'}
        </button>
      </div>

      <div style={{ background: '#111', padding: '2rem', borderRadius: '8px', border: '1px solid #333' }}>
        <h3 style={{ color: '#ff9800', margin: '0 0 5px 0' }}>📚 Biblioteka (Kliknij wiersz aby pokazać wykres)</h3>
        
        {registry.models.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666', border: '1px dashed #444', borderRadius: '6px' }}>
            Brak modeli. Uruchom pierwszy trening.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', borderRadius: '6px', border: '1px solid #333' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#1a1a1a', borderBottom: '2px solid #444' }}>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Grupa Modeli</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>Pliki</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>Algorytm / Czułość</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>Okno / Krok</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Dostępne osie</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>Akcje</th>
                </tr>
              </thead>
              <tbody>
                {registry.models.map((model) => (
                  <tr 
                    key={model.group_id} 
                    onClick={() => {
                      setSelectedGroupToView(model);
                      setSelectedAxisToView(model.axes_trained[0]); 
                    }}
                    style={{ 
                      borderBottom: '1px solid #222', 
                      background: selectedGroupToView?.group_id === model.group_id ? '#00ccff1a' : 'transparent',
                      cursor: 'pointer',
                      transition: 'background 0.2s'
                    }}
                  >
                    <td style={{ padding: '12px', fontWeight: 'bold', color: selectedGroupToView?.group_id === model.group_id ? '#00ccff' : '#ccc' }}>{model.name}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>{model.files_used_count}</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontSize: '0.8rem' }}>
                      <span style={{ color: '#4caf50' }}>{model.algorithm}</span><br />
                      <span style={{ color: '#888' }}>({(model.contamination * 100).toFixed(0)}%)</span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {model.window_size} / {model.step_size}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        {model.axes_trained.map(ax => (
                          <span key={ax} style={{ background: '#222', border: '1px solid #444', padding: '2px 6px', borderRadius: '3px', fontSize: '0.8rem', color: '#ff9800' }}>{ax}</span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <button 
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          setModelToDelete(model); 
                        }} 
                        style={{ background: '#f4433622', color: '#f44336', border: '1px solid #f44336', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        🗑️ Usuń
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selectedGroupToView && (
          <div style={{ marginTop: '30px', padding: '20px', background: '#1a1a1a', borderRadius: '8px', border: '1px dashed #444' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ color: '#00ccff', margin: 0 }}>📊 Mapa przestrzeni cech</h3>
              <select 
                value={selectedAxisToView} 
                onChange={(e) => setSelectedAxisToView(e.target.value)}
                style={{ padding: '8px 15px', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: '4px', outline: 'none' }}
              >
                {selectedGroupToView.axes_trained.map(ax => <option key={ax} value={ax}>Podgląd osi: {ax}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', background: '#222', padding: '15px', borderRadius: '6px', border: '1px solid #333' }}>
              <div style={{ flex: 1 }}>
                <label style={{ color: '#ccc', fontSize: '0.85rem' }}>Eksploruj na osi X:
                  <select 
                    value={xAxisFeature} 
                    onChange={(e) => setXAxisFeature(e.target.value)}
                    style={{ width: '100%', padding: '8px', background: '#111', color: '#00ccff', border: '1px solid #444', borderRadius: '4px', marginTop: '5px', outline: 'none' }}
                  >
                    {Object.entries(FEATURE_LABELS).map(([key, label]) => (
                      <option key={`x-${key}`} value={key}>{label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ color: '#ccc', fontSize: '0.85rem' }}>Eksploruj na osi Y:
                  <select 
                    value={yAxisFeature} 
                    onChange={(e) => setYAxisFeature(e.target.value)}
                    style={{ width: '100%', padding: '8px', background: '#111', color: '#00ccff', border: '1px solid #444', borderRadius: '4px', marginTop: '5px', outline: 'none' }}
                  >
                    {Object.entries(FEATURE_LABELS).map(([key, label]) => (
                      <option key={`y-${key}`} value={key}>{label}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {isChartLoading ? (
              <p style={{ color: '#ff9800', textAlign: 'center', marginTop: '40px' }}>⏳ Pobieranie pełnej paczki punktów (pre-fetching)...</p>
            ) : chartData.length > 0 ? (
              <div style={{ width: '100%', height: '400px', marginTop: '20px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    
                    <XAxis 
                      type="number" 
                      dataKey={xAxisFeature} 
                      name={FEATURE_LABELS[xAxisFeature]} 
                      stroke="#888" 
                      tick={{ fill: '#888' }} 
                      label={{ value: `${FEATURE_LABELS[xAxisFeature]} (Oś X)`, position: 'bottom', offset: 10, fill: '#aaa' }} 
                    />
                    <YAxis 
                      type="number" 
                      dataKey={yAxisFeature} 
                      name={FEATURE_LABELS[yAxisFeature]} 
                      stroke="#888" 
                      tick={{ fill: '#888' }} 
                      label={{ value: `${FEATURE_LABELS[yAxisFeature]} (Oś Y)`, angle: -90, position: 'insideLeft', offset: -20, fill: '#aaa' }} 
                    />
                    
                    <Tooltip cursor={false} contentStyle={{ backgroundColor: '#222', borderColor: '#444', color: '#fff' }} formatter={(value: any, name: any) => {
                        if (name === "prediction") return [value === 1 ? 'Norma (OK)' : 'Anomalia (Awaria)', 'Status'];
                        return [Number(value).toFixed(4), name];
                      }} />
                    <Scatter name="Punkty okienkowe" data={chartData} fill="#8884d8" isAnimationActive={false}>
                      {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.prediction === 1 ? '#4caf50' : '#f44336'} />)}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p style={{ color: '#ff9800', textAlign: 'center', marginTop: '40px' }}>Brak punktów do wyświetlenia.</p>
            )}

            <div style={{ marginTop: '40px', paddingTop: '30px', borderTop: '2px solid #333' }}>
              <h3 style={{ color: '#4caf50', margin: '0 0 10px 0' }}>🧪 Symulacja Diagnozy (Pełny Przegląd Osi)</h3>
              <p style={{ color: '#aaa', fontSize: '0.85rem', marginBottom: '20px' }}>
                Wybierz plik awaryjny z listy, aby przetestować go przy użyciu algorytmu <strong>{selectedGroupToView.algorithm}</strong> na wszystkich wytrenowanych osiach robota jednocześnie.
              </p>

              <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                <select 
                  value={testFilePath} 
                  onChange={e => setTestFilePath(e.target.value)}
                  style={{ flex: 1, padding: '10px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px', outline: 'none' }}
                >
                  {activeSource?.test_files.map(f => <option key={f} value={f}>📄 {f}</option>)}
                </select>
                <button 
                  onClick={handleTestFile} 
                  disabled={isTesting || !testFilePath}
                  style={{ background: isTesting ? '#555' : '#4caf50', color: '#fff', padding: '10px 24px', border: 'none', borderRadius: '4px', cursor: isTesting ? 'wait' : 'pointer', fontWeight: 'bold' }}
                >
                  {isTesting ? '⏳ Analizowanie osi...' : '🔎 Uruchom Diagnozę Pełną'}
                </button>
              </div>

              {/* --- NOWOŚĆ: PASEK POSTĘPU WIDOCZNY W TRAKCIE TESTOWANIA --- */}
              {isTesting && (
                <div style={{ marginTop: '20px', background: '#1a1a1a', borderRadius: '6px', padding: '15px', border: '1px solid #444' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ color: '#aaa', fontSize: '0.85rem' }}>Przetwarzanie zapytań ML w chmurze (Promise.all)...</span>
                    <span style={{ color: '#4caf50', fontWeight: 'bold', fontSize: '0.85rem' }}>{testProgress}%</span>
                  </div>
                  <div style={{ width: '100%', background: '#111', borderRadius: '10px', height: '8px', overflow: 'hidden' }}>
                    <div style={{ width: `${testProgress}%`, background: '#4caf50', height: '100%', transition: 'width 0.4s ease-out' }}></div>
                  </div>
                </div>
              )}

              {testResults && Object.keys(testResults).length > 0 && !isTesting && (
                <div style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <h4 style={{ color: '#fff', borderBottom: '1px solid #333', paddingBottom: '10px', margin: 0 }}>
                    Wyniki weryfikacji pliku dla poszczególnych osi:
                  </h4>
                  
                  {Object.entries(testResults).map(([axisName, resultData]) => (
                    <div key={axisName} style={{ background: '#111', padding: '15px', borderRadius: '8px', border: '1px solid #333' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                        <h4 style={{ color: '#00ccff', margin: 0 }}>Oś: {axisName}</h4>
                        <span style={{ 
                          background: resultData.anomalyPercent > 0 ? '#f4433622' : '#4caf5022', 
                          color: resultData.anomalyPercent > 0 ? '#f44336' : '#4caf50', 
                          padding: '5px 12px', borderRadius: '15px', fontWeight: 'bold', fontSize: '0.85rem'
                        }}>
                          {resultData.anomalyPercent === 0 ? '✅ Idealna praca' : `⚠️ Wykryto Anomalię (${resultData.anomalyPercent}%)`}
                        </span>
                      </div>

                      <div style={{ width: '100%', height: '220px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={resultData.chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                            <XAxis dataKey="Time" stroke="#aaa" />
                            <YAxis stroke="#aaa" />
                            <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #444', color: '#fff' }} />
                            <Legend />
                            {resultData.violationAreas.map((area: any, idx: number) => (
                              <ReferenceArea key={idx} x1={area.start} x2={area.end} fill="#f44336" fillOpacity={0.25} />
                            ))}
                            <Line type="monotone" dataKey="Referencja" stroke="#4caf50" strokeWidth={2} dot={false} isAnimationActive={false} />
                            <Line type="monotone" dataKey="Badany" stroke="#ff9800" strokeWidth={2} dot={false} isAnimationActive={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {modelToDelete && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, backdropFilter: 'blur(3px)' }}>
          <div style={{ background: '#1a1a1a', padding: '30px', borderRadius: '12px', border: '1px solid #444', maxWidth: '450px', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.8)' }}>
            <h2 style={{ color: '#f44336', marginTop: 0, fontSize: '1.8rem' }}>⚠️ Uwaga!</h2>
            <p style={{ color: '#ddd', fontSize: '1.05rem', lineHeight: '1.5' }}>
              Czy na pewno chcesz bezpowrotnie usunąć wyuczony model:<br/>
              <strong style={{ color: '#00ccff', display: 'block', margin: '15px 0', fontSize: '1.2rem' }}>{modelToDelete.name}</strong>
            </p>
            <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', marginTop: '30px' }}>
              <button onClick={() => setModelToDelete(null)} style={{ padding: '12px 25px', background: '#333', color: '#fff', border: '1px solid #555', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem', transition: '0.2s' }}>Cofnij</button>
              <button onClick={confirmDelete} style={{ padding: '12px 25px', background: '#f44336', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem', boxShadow: '0 4px 15px rgba(244,67,54,0.4)', transition: '0.2s' }}>🗑️ Usuń model</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};