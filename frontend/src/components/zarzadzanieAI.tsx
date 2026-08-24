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
  comment?: string;
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
  ptp: 'Rozstęp (Peak-to-Peak)',
  mean: 'Średnia kierunkowa (MEAN)'
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
  const [testProgress, setTestProgress] = useState<number>(0);
  const [testResults, setTestResults] = useState<Record<string, { chartData: any[], violationAreas: any[], anomalyPercent: number }> | null>(null);
  const [xAxisFeature, setXAxisFeature] = useState('var');
  const [yAxisFeature, setYAxisFeature] = useState('rmse');
  const [isFetching, setIsFetching] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [selectedTrainingFiles, setSelectedTrainingFiles] = useState<string[]>([]);
  const [useThermalComp, setUseThermalComp] = useState(true);
  const [autoOptimize, setAutoOptimize] = useState(false);
  const [trainingJobId, setTrainingJobId] = useState<string | null>(null);
  const [trainingProgress, setTrainingProgress] = useState<number>(0);
  const [trainingMessage, setTrainingMessage] = useState<string>('');
  const [useSimulationThermalComp, setUseSimulationThermalComp] = useState(true);
  const [normalizeIndicators, setNormalizeIndicators] = useState(false);
  const [editedComment, setEditedComment] = useState<string>('');

  const handleCommentBlur = async (groupId: string, newComment: string, oldComment: string) => {
    if (newComment === oldComment) return; // Brak zmian, oszczędzamy zapytanie do serwera

    try {
      const res = await fetch(`http://localhost:8000/api/ml/models/${groupId}/comment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment: newComment })
      });
      const data = await res.json();
      
      if (data.status === 'success') {
        emitAppLog('success', 'Zapisano komentarz do modelu.');
        
        // Aktualizacja rejestru w locie, żeby interfejs nie mrugał
        setRegistry(prev => ({
          ...prev,
          models: prev.models.map(m => m.group_id === groupId ? { ...m, comment: newComment } : m)
        }));
        if (selectedGroupToView?.group_id === groupId) {
          setSelectedGroupToView(prev => prev ? { ...prev, comment: newComment } : null);
        }
      } else {
        emitAppLog('error', `Nie udało się zapisać komentarza: ${data.message}`);
      }
    } catch (e) {
      emitAppLog('error', 'Błąd połączenia podczas zapisywania komentarza.');
    }
  };

  // Pobieranie plików CSV z wybranego folderu
  const getFilesInFolder = () => {
    if (!activeSource || !folderPath) return [];
    return activeSource.test_files.filter(f => f.startsWith(`${folderPath}/`));
  };

  useEffect(() => {
    // Gdy zmieni się folder, domyślnie zaznaczamy wszystkie jego pliki
    setSelectedTrainingFiles(getFilesInFolder());
  }, [folderPath, selectedRobot, sources]);

  const toggleTrainingFile = (file: string) => {
    setSelectedTrainingFiles(prev => 
      prev.includes(file) ? prev.filter(f => f !== file) : [...prev, file]
    );
  };

  const fetchData = async () => {
    setIsFetching(true); // Włączamy ekran ładowania
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
    } finally {
      setIsFetching(false); // Wyłączamy ekran ładowania po zakończeniu
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
    if (selectedTrainingFiles.length === 0 || !refPath) return;
    setLoading(true);
    setTrainingProgress(0);
    setTrainingMessage('Przygotowywanie danych...');

    try {
      const response = await fetch('http://localhost:8000/api/ml/train/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_name: modelName,
          robot_name: selectedRobot,
          test_files: selectedTrainingFiles,
          reference_path: refPath,
          window_size: windowSize,
          step_size: stepSize,
          algorithm: selectedAlgorithm,
          contamination: contamination,
          use_thermal: useThermalComp,
          auto_optimize: autoOptimize
        })
      });
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');
      
      if (!reader) throw new Error('Brak wsparcia strumieniowania.');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
          const data = JSON.parse(line);
          
          if (data.status === 'started' && data.job_id) {
            setTrainingJobId(data.job_id);
          } else if (data.status === 'progress') {
            setTrainingProgress(data.progress);
            setTrainingMessage(data.message);
          } else if (data.status === 'success') {
            setTrainingProgress(100);
            setTrainingMessage(data.message);
            emitAppLog('success', `Trening ukończony! Zapisano osie: ${data.axes_trained.join(', ')}.`);
            
            const regRes = await fetch('http://localhost:8000/api/ml/registry');
            if (regRes.ok) setRegistry(await regRes.json());
            
            setTimeout(() => {
                setWizardStep(1);
                setShowWizard(false);
                setLoading(false);
                setTrainingJobId(null);
            }, 2000);
          } else if (data.status === 'cancelled') {
            setTrainingMessage('Anulowano.');
            emitAppLog('warning', data.message);
            setLoading(false);
            setTrainingJobId(null);
          } else if (data.status === 'error') {
            setTrainingMessage('Wystąpił błąd!');
            emitAppLog('error', data.message);
            setLoading(false);
            setTrainingJobId(null);
          }
        }
      }
    } catch (err) {
      emitAppLog('error', 'Krytyczny błąd połączenia strumieniowego.');
      setLoading(false);
    }
  };

  const handleCancelTraining = async () => {
    if (!trainingJobId) return;
    try {
      setTrainingMessage('Wysyłanie sygnału przerwania...');
      await fetch(`http://localhost:8000/api/ml/train/cancel/${trainingJobId}`, { method: 'POST' });
    } catch (e) {
      emitAppLog('error', 'Nie udało się wysłać sygnału przerwania.');
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
    if (!selectedGroupToView || !testFilePath) {
      emitAppLog('warning', 'Wybierz plik z listy.');
      return;
    }
    
    // --- NOWOŚĆ: Automatyczne dopasowanie robota i referencji na podstawie ścieżki ---
    const targetRobotName = testFilePath.split('/')[0];
    const targetSource = sources.find(s => s.robot_name === targetRobotName);
    const targetRefPath = targetSource?.reference_files[0];

    if (!targetRefPath) {
      emitAppLog('error', `Brak pliku referencyjnego dla maszyny: ${targetRobotName}`);
      return;
    }
    
    setIsTesting(true);
    setTestProgress(0); // Reset paska
    setTestResults(null);
    emitAppLog('info', `Uruchamiam AI (${selectedGroupToView.algorithm}) dla pliku: ${testFilePath}`);
    
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
            reference_file_path: targetRefPath,             // Automatyczna referencja
            robot_name: targetRobotName,                    // Automatyczna konfiguracja termiczna
            use_thermal: useSimulationThermalComp
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

  // useEffect(() => {
  //   if (activeSource && activeSource.test_files.length > 0) {
  //     setTestFilePath(activeSource.test_files[0]);
  //   } else {
  //     setTestFilePath('');
  //   }
  // }, [selectedRobot, sources]);

  const activeSource = sources.find(s => s.robot_name === selectedRobot);

  // --- EKRAN ŁADOWANIA ---
  if (isFetching) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#00ccff' }}>
        <style>
          {`
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            .loading-spinner { border: 4px solid rgba(0, 204, 255, 0.2); border-left-color: #00ccff; border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; margin-bottom: 20px; }
          `}
        </style>
        <div className="loading-spinner"></div>
        <h3 style={{ margin: 0, letterSpacing: '1px' }}>Inicjalizacja Centrum ML...</h3>
        <p style={{ color: '#aaa', fontSize: '0.9rem' }}>Pobieranie rejestru wytrenowanych modeli i struktury plików</p>
      </div>
    );
  }

  // --- GŁÓWNY DASHBOARD ---
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', textAlign: 'left' }}>
      
      {/* NOWY NAGŁÓWEK GŁÓWNY */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', padding: '1.5rem 2rem', borderRadius: '8px', border: '1px solid #333', boxShadow: '0 4px 15px rgba(0,0,0,0.3)' }}>
        <div>
          <h2 style={{ color: '#00ccff', margin: '0 0 8px 0', fontSize: '1.6rem' }}>🧠 Centrum Dowodzenia AI</h2>
          <p style={{ color: '#aaa', fontSize: '0.95rem', margin: 0 }}>Zarządzaj wyuczonymi modelami detekcji anomalii i analizuj ich parametry.</p>
        </div>
        <button 
          onClick={() => setShowWizard(true)}
          style={{ background: '#00ccff', color: '#000', padding: '14px 28px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem', transition: '0.2s', boxShadow: '0 0 15px rgba(0, 204, 255, 0.2)' }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          ➕ Utwórz nowy model AI
        </button>
      </div>

      {/* KREATOR MODELI (WIZARD MODAL) */}
      {showWizard && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, backdropFilter: 'blur(5px)' }}>
          <div style={{ background: '#1a1a1a', padding: '30px', borderRadius: '12px', border: '1px solid #444', width: '700px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,0.8)' }}>
            
            {/* NAGŁÓWEK WIZARDA */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '15px', marginBottom: '20px' }}>
              <h2 style={{ color: '#00ccff', margin: 0, fontSize: '1.4rem' }}>🛠️ Kreator Nowego Modelu AI</h2>
              <div style={{ display: 'flex', gap: '5px' }}>
                {[1, 2, 3].map(step => (
                  <div key={step} style={{ width: '30px', height: '8px', borderRadius: '4px', background: wizardStep >= step ? '#00ccff' : '#333', transition: '0.3s' }} />
                ))}
              </div>
            </div>

            {/* ZAWARTOŚĆ SCROLLOWANA */}
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '10px' }}>
              
              {/* KROK 1: ŹRÓDŁA DANYCH */}
              {wizardStep === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <h3 style={{ color: '#fff', marginTop: 0 }}>Krok 1: Wybór Danych Treningowych</h3>
                  <p style={{ color: '#aaa', fontSize: '0.9rem', marginTop: '-10px' }}>Zaznacz poprawne przebiegi, na których system nauczy się naturalnej pracy maszyny.</p>

                  <label style={{ color: '#ff9800', fontSize: '0.9rem', fontWeight: 'bold' }}>Maszyna docelowa:
                    <select value={selectedRobot} onChange={e => handleRobotChange(e.target.value)} style={{ width: '100%', padding: '10px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px', marginTop: '5px' }}>
                      {sources.map(s => <option key={s.robot_name} value={s.robot_name}>{s.robot_name}</option>)}
                    </select>
                  </label>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    <label style={{ color: '#fff', fontSize: '0.9rem' }}>Folder uczący:
                      <select value={folderPath} onChange={e => setFolderPath(e.target.value)} style={{ width: '100%', padding: '8px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px', marginTop: '5px' }}>
                        {activeSource?.data_folders.map(folder => <option key={folder} value={folder}>📂 {folder}</option>)}
                      </select>
                    </label>
                    <label style={{ color: '#fff', fontSize: '0.9rem' }}>Przebieg referencyjny:
                      <select value={refPath} onChange={e => setRefPath(e.target.value)} style={{ width: '100%', padding: '8px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px', marginTop: '5px' }}>
                        {activeSource?.reference_files.map(file => <option key={file} value={file}>📄 {file.split('/').pop()}</option>)}
                      </select>
                    </label>
                  </div>

                  {/* WYBÓR PLIKÓW */}
                  <div style={{ background: '#111', border: '1px solid #333', borderRadius: '6px', padding: '10px', maxHeight: '200px', overflowY: 'auto', marginTop: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', borderBottom: '1px solid #222', paddingBottom: '5px' }}>
                      <span style={{ color: '#888', fontSize: '0.85rem' }}>Pliki biorące udział w treningu:</span>
                      <div style={{ gap: '10px', display: 'flex' }}>
                        <button onClick={() => setSelectedTrainingFiles(getFilesInFolder())} style={{ background: 'transparent', border: 'none', color: '#00ccff', cursor: 'pointer', fontSize: '0.8rem' }}>Zaznacz wszystkie</button>
                        <button onClick={() => setSelectedTrainingFiles([])} style={{ background: 'transparent', border: 'none', color: '#f44336', cursor: 'pointer', fontSize: '0.8rem' }}>Odznacz</button>
                      </div>
                    </div>
                    {getFilesInFolder().length === 0 ? <p style={{ color: '#555', textAlign: 'center' }}>Brak plików CSV w folderze</p> : 
                      getFilesInFolder().map(file => (
                        <label key={file} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px', cursor: 'pointer', color: selectedTrainingFiles.includes(file) ? '#fff' : '#555' }}>
                          <input type="checkbox" checked={selectedTrainingFiles.includes(file)} onChange={() => toggleTrainingFile(file)} style={{ accentColor: '#00ccff' }} />
                          <span style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}>{file.split('/').pop()}</span>
                        </label>
                      ))
                    }
                  </div>
                </div>
              )}

              {/* KROK 2: PARAMETRY SIECI I OPTYMALIZACJA */}
              {wizardStep === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <h3 style={{ color: '#fff', marginTop: 0 }}>Krok 2: Konfiguracja Architektury</h3>
                  <p style={{ color: '#aaa', fontSize: '0.9rem', marginTop: '-10px' }}>Dostosuj parametry sztucznej inteligencji. Włącz optymalizację, aby system sam dobrał najlepsze wartości.</p>

                  <label style={{ color: '#00ccff', fontSize: '0.9rem', fontWeight: 'bold' }}>Nazwa modelu w rejestrze:
                    <input type="text" value={modelName} onChange={e => setModelName(e.target.value)} style={{ width: '100%', padding: '10px', background: '#111', color: '#00ccff', border: '1px solid #444', borderRadius: '4px', marginTop: '5px' }} />
                  </label>

                  {/* ROZWIĄZANIE: Wybór algorytmu wyciągnięty na zewnątrz, zawsze dostępny! */}
                  <label style={{ color: '#fff', fontSize: '0.9rem' }}>Algorytm:
                    <select value={selectedAlgorithm} onChange={e => setSelectedAlgorithm(e.target.value)} style={{ width: '100%', padding: '8px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px', marginTop: '5px' }}>
                      <option value="Isolation Forest">Isolation Forest (Drzewa Izolacji)</option>
                      <option value="One-Class SVM">One-Class SVM (Wektory Nośne)</option>
                      <option value="LOF">LOF (Gęstość Sąsiadów)</option>
                      <option value="Autoencoder">Autoencoder(Głęboka Sieć Neuronowa)</option>
                    </select>
                  </label>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: '#222', padding: '15px', borderRadius: '6px', border: '1px solid #333' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: useThermalComp ? '#4caf50' : '#888' }}>
                      <input type="checkbox" checked={useThermalComp} onChange={e => setUseThermalComp(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: '#4caf50' }} />
                      <strong>Zastosuj kompensację termiczną przed treningiem</strong>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: autoOptimize ? '#9c27b0' : '#888', marginTop: '10px' }}>
                      <input type="checkbox" checked={autoOptimize} onChange={e => setAutoOptimize(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: '#9c27b0' }} />
                      <strong>AutoML: Automatycznie dobierz okno i zanieczyszczenie</strong>
                    </label>
                  </div>

                  {/* ZAAWANSOWANE UKRYWANE PRZY AUTO OPTYMALIZACJI */}
                  <div style={{ opacity: autoOptimize ? 0.4 : 1, pointerEvents: autoOptimize ? 'none' : 'auto', transition: '0.3s' }}>
                    <div style={{ display: 'flex', gap: '15px', marginTop: '10px' }}>
                      <label style={{ flex: 1, color: '#aaa', fontSize: '0.85rem' }}>Długość okna:
                        <input type="number" value={windowSize} onChange={e => setWindowSize(Number(e.target.value))} style={{ width: '100%', padding: '8px', background: '#111', color: '#fff', border: '1px solid #444', borderRadius: '4px', marginTop: '5px' }} />
                      </label>
                      <label style={{ flex: 1, color: '#aaa', fontSize: '0.85rem' }}>Krok okna:
                        <input type="number" value={stepSize} onChange={e => setStepSize(Number(e.target.value))} style={{ width: '100%', padding: '8px', background: '#111', color: '#fff', border: '1px solid #444', borderRadius: '4px', marginTop: '5px' }} />
                      </label>
                      <label style={{ flex: 1, color: '#aaa', fontSize: '0.85rem' }}>Czułość (Contamination):
                        <input type="number" step="0.01" value={contamination} onChange={e => setContamination(Number(e.target.value))} style={{ width: '100%', padding: '8px', background: '#111', color: '#fff', border: '1px solid #444', borderRadius: '4px', marginTop: '5px' }} />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* KROK 3: TRENING I PODSUMOWANIE */}
              {wizardStep === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', alignItems: 'center', textAlign: 'center', padding: '20px 0' }}>
                  {loading ? (
                    <div style={{ width: '100%', maxWidth: '500px' }}>
                      <div className="loading-spinner" style={{ width: '60px', height: '60px', borderWidth: '6px', margin: '0 auto 20px auto' }}></div>
                      <h3 style={{ color: '#00ccff', marginBottom: '10px' }}>Trenowanie modeli dla {selectedRobot}...</h3>
                      <p style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '15px', minHeight: '40px' }}>{trainingMessage}</p>
                      
                      {/* PASEK POSTĘPU LIVE */}
                      <div style={{ width: '100%', background: '#111', borderRadius: '10px', height: '12px', overflow: 'hidden', border: '1px solid #444', marginBottom: '20px' }}>
                        <div style={{ width: `${trainingProgress}%`, background: '#00ccff', height: '100%', transition: 'width 0.2s ease-out', boxShadow: '0 0 10px #00ccff' }}></div>
                      </div>

                      <button 
                        onClick={handleCancelTraining} 
                        style={{ background: 'transparent', color: '#f44336', border: '1px solid #f44336', padding: '8px 20px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                      >
                        ⏹️ Zatrzymaj trening
                      </button>
                    </div>
                  ) : (
                    <>
                      <h3 style={{ color: '#4caf50', fontSize: '1.5rem', margin: 0 }}>Gotowy do startu!</h3>
                      <div style={{ background: '#222', padding: '15px', borderRadius: '8px', textAlign: 'left', width: '100%', marginTop: '15px' }}>
                        <p style={{ margin: '5px 0', color: '#ccc' }}><strong>Model:</strong> {modelName}</p>
                        <p style={{ margin: '5px 0', color: '#ccc' }}><strong>Plików uczących:</strong> {selectedTrainingFiles.length}</p>
                        <p style={{ margin: '5px 0', color: '#ccc' }}><strong>Kompensacja Termiczna:</strong> {useThermalComp ? '✅ Włączona' : '❌ Wyłączona'}</p>
                        <p style={{ margin: '5px 0', color: '#ccc' }}><strong>AutoML (Optymalizacja):</strong> {autoOptimize ? '✨ Włączona' : '❌ Wyłączona'}</p>
                        {!autoOptimize && <p style={{ margin: '5px 0', color: '#888', fontSize: '0.85rem' }}>Zostaną użyte ręczne parametry: {selectedAlgorithm} (Okno: {windowSize}, Czułość: {contamination})</p>}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>


            {/* STOPKA WIZARDA - PRZYCISKI NAWIGACYJNE */}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #333', paddingTop: '20px', marginTop: '20px' }}>
              <button 
                onClick={() => { setWizardStep(1); setShowWizard(false); }} 
                disabled={loading}
                style={{ padding: '10px 20px', background: 'transparent', color: '#aaa', border: '1px solid #555', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer' }}
              >
                Anuluj
              </button>
              
              <div style={{ display: 'flex', gap: '10px' }}>
                {wizardStep > 1 && (
                  <button onClick={() => setWizardStep(prev => prev - 1)} disabled={loading} style={{ padding: '10px 20px', background: '#333', color: '#fff', border: 'none', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer' }}>
                    Wstecz
                  </button>
                )}
                
                {wizardStep < 3 ? (
                  <button onClick={() => setWizardStep(prev => prev + 1)} disabled={selectedTrainingFiles.length === 0} style={{ padding: '10px 25px', background: selectedTrainingFiles.length === 0 ? '#555' : '#00ccff', color: '#000', border: 'none', borderRadius: '6px', cursor: selectedTrainingFiles.length === 0 ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                    Dalej
                  </button>
                ) : (
                  <button onClick={handleTrain} disabled={loading} style={{ padding: '10px 25px', background: loading ? '#555' : '#4caf50', color: '#fff', border: 'none', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                    🚀 Uruchom Trening
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* SEKCJA BIBLIOTEKI (Tabela pozostaje bez zmian) */}
      <div style={{ background: '#111', padding: '2rem', borderRadius: '8px', border: '1px solid #333' }}>
        <h3 style={{ color: '#ff9800', margin: '0 0 15px 0' }}>📚 Biblioteka Modeli </h3>        
        {registry.models.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666', border: '1px dashed #444', borderRadius: '6px' }}>
            Brak modeli. Uruchom pierwszy trening.
          </div>
        ) : (
          <div style={{ maxHeight: '500px', overflowY: 'auto', overflowX: 'auto', borderRadius: '6px', border: '1px solid #333' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff', fontSize: '0.9rem' }}>
              {/* NOWOŚĆ: Sticky nagłówek, który zostaje na górze podczas scrollowania */}
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#1a1a1a' }}>
                <tr style={{ borderBottom: '2px solid #444' }}>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Grupa Modeli</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>Pliki</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>Algorytm / Czułość</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>Okno / Krok</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Dostępne osie</th>
                  <th style={{ padding: '12px', textAlign: 'left' }}>Komentarz</th> {/* <--- NOWA KOLUMNA */}
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
                      setTestResults(null);
                      setTestProgress(0);
                      setIsTesting(false);
                      setEditedComment(model.comment || '');
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
                    
                    {/* --- NOWE POLE KOMENTARZA W TABELI --- */}
                    <td style={{ padding: '12px', width: '25%' }}>
                      <input 
                        type="text"
                        defaultValue={model.comment || ''}
                        placeholder="Dodaj notatkę..."
                        onClick={(e) => e.stopPropagation()} // Zapobiega rozwijaniu całego podglądu wykresów po kliknięciu
                        onBlur={(e) => handleCommentBlur(model.group_id, e.target.value, model.comment || '')}
                        style={{ 
                          width: '100%', 
                          padding: '8px', 
                          background: '#222', 
                          color: '#fff', 
                          border: '1px solid #444', 
                          borderRadius: '4px', 
                          outline: 'none',
                          fontSize: '0.85rem'
                        }}
                      />
                    </td>
                    {/* ------------------------------------ */}

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

            {/* Animacja ładowania CSS dostosowana dla pomarańczowego koloru */}
            <style>
              {`
                @keyframes spinChart { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                .chart-spinner { border: 4px solid rgba(255, 152, 0, 0.15); border-left-color: #ff9800; border-radius: 50%; width: 40px; height: 40px; animation: spinChart 1s linear infinite; }
              `}
            </style>

            {isChartLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '400px', marginTop: '20px' }}>
                <div className="chart-spinner"></div>
                <p style={{ color: '#ff9800', marginTop: '15px', fontSize: '0.95rem' }}>Pobieranie punktów przestrzeni cech...</p>
              </div>
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                  <select 
                    value={testFilePath} 
                    onChange={e => setTestFilePath(e.target.value)}
                    style={{ flex: 1, padding: '10px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px', outline: 'none' }}
                  >
                    <option value="" disabled>-- Wybierz plik z serwera --</option>
                    {sources.map(src => (
                      <optgroup key={src.robot_name} label={`🤖 Maszyna: ${src.robot_name}`}>
                        {src.test_files.map(f => (
                          <option key={f} value={f}>📄 {f}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <button 
                    onClick={handleTestFile} 
                    disabled={isTesting || !testFilePath}
                    style={{ background: isTesting ? '#555' : '#4caf50', color: '#fff', padding: '10px 24px', border: 'none', borderRadius: '4px', cursor: isTesting ? 'wait' : 'pointer', fontWeight: 'bold', minWidth: '240px' }}
                  >
                    {isTesting ? '⏳ Analizowanie osi...' : '🔎 Uruchom Diagnozę Pełną'}
                  </button>
                </div>
                <label style={{ color: '#ccc', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', width: 'fit-content' }}>
                  <input 
                    type="checkbox" 
                    checked={useSimulationThermalComp} 
                    onChange={e => setUseSimulationThermalComp(e.target.checked)} 
                    style={{ accentColor: '#4caf50', width: '16px', height: '16px' }} 
                  />
                  🌡️ Uwzględnij wyuczoną kompensację termiczną podczas diagnozy
                </label>
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

{/* --- KASKADOWY UKŁAD WYKRESÓW (ANALIZA) --- */}
                      <div style={{ display: 'grid', gap: '20px' }}>
                        
                        {/* 1. Wykres Sygnałów Głównych */}
                        <div style={{ width: '100%', height: '250px', background: '#1a1a1a', padding: '15px', borderRadius: '8px', border: '1px solid #333' }}>
                          <h5 style={{ color: '#aaa', margin: '0 0 10px 0', fontSize: '0.85rem' }}>1. Przebiegi Sygnałów</h5>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={resultData.chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                              <XAxis dataKey="Time" stroke="#aaa" />
                              <YAxis stroke="#aaa" />
                              <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #444', color: '#fff' }} />
                              <Legend />
                              {resultData.violationAreas.map((area: any, idx: number) => (
                                <ReferenceArea key={idx} x1={area.start} x2={area.end} fill="#f44336" fillOpacity={0.25} />
                              ))}
                              <Line type="monotone" dataKey="Referencja" stroke="#4caf50" strokeWidth={2} dot={false} isAnimationActive={false} />
                              <Line type="monotone" dataKey="Badany" stroke="#ff9800" strokeWidth={2} dot={false} isAnimationActive={false} name={useSimulationThermalComp && axisName.startsWith('Cur') ? "Badany (Skompensowany)" : "Badany"} />
                              {useSimulationThermalComp && axisName.startsWith('Cur') && (
                                <Line type="monotone" dataKey="BadanyRaw" stroke="#ff9800" strokeDasharray="5 5" strokeWidth={1} dot={false} isAnimationActive={false} name="Badany (Surowy)" opacity={0.5} />
                              )}
                            </LineChart>
                          </ResponsiveContainer>
                        </div>

                        {/* 2. Wykres Uchybu (Różnicy) */}
                        <div style={{ width: '100%', height: '200px', background: '#1a1a1a', padding: '15px', borderRadius: '8px', border: '1px solid #333' }}>
                          <h5 style={{ color: '#aaa', margin: '0 0 10px 0', fontSize: '0.85rem' }}>2. Uchyb Sygnału (Różnica = Badany - Referencja)</h5>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={resultData.chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                              <XAxis dataKey="Time" stroke="#aaa" />
                              <YAxis stroke="#aaa" />
                              <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #444', color: '#fff' }} />
                              <Legend />
                              {resultData.violationAreas.map((area: any, idx: number) => (
                                <ReferenceArea key={idx} x1={area.start} x2={area.end} fill="#f44336" fillOpacity={0.25} />
                              ))}
                              <Line type="monotone" dataKey="Roznica" stroke="#e91e63" strokeWidth={2} dot={false} isAnimationActive={false} name="Uchyb (Różnica)" />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>

                        {/* 3. Wykres Wskaźników Decyzyjnych ML */}
                        <div style={{ width: '100%', height: '250px', background: '#1a1a1a', padding: '15px', borderRadius: '8px', border: '1px solid #333' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <h5 style={{ color: '#00ccff', margin: 0, fontSize: '0.85rem' }}>3. Przestrzeń Decyzyjna AI (Wskaźniki okienkowe)</h5>
                            <label style={{ color: '#ccc', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                              <input 
                                type="checkbox" 
                                checked={normalizeIndicators} 
                                onChange={e => setNormalizeIndicators(e.target.checked)} 
                                style={{ accentColor: '#00ccff', width: '16px', height: '16px' }} 
                              />
                              Znormalizuj skale do pików (0-100%)
                            </label>
                          </div>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={resultData.chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                              <XAxis dataKey="Time" stroke="#aaa" />
                              
                              {/* Dynamiczna oś Y: stałe 0-105% dla normalizacji, automatyczna dla surowych */}
                              <YAxis 
                                stroke="#aaa" 
                                domain={normalizeIndicators ? [0, 105] : ['auto', 'auto']} 
                                unit={normalizeIndicators ? "%" : ""} 
                              />
                              
                              <Tooltip 
                                contentStyle={{ backgroundColor: '#111', border: '1px solid #444', color: '#fff' }}
                                formatter={(value: any, name: any, props: any) => {
                                  if (normalizeIndicators) {
                                    // Zabezpieczenie przed undefined
                                    const safeName = String(name);
                                    const rawValue = props.payload[safeName];
                                    return [`Wartość: ${rawValue} (${Number(value).toFixed(1)}% piku)`, safeName];
                                  }
                                  return [Number(value).toFixed(4), String(name)];
                                }}
                              />
                              
                              <Legend />
                              {resultData.violationAreas.map((area: any, idx: number) => (
                                <ReferenceArea key={idx} x1={area.start} x2={area.end} fill="#f44336" fillOpacity={0.25} />
                              ))}
                              
                              {/* Dynamiczne przełączanie kolumn w zależności od checkboxa */}
                              <Line type="step" dataKey={normalizeIndicators ? "MAE_100" : "MAE"} name="MAE" stroke="#00bcd4" strokeWidth={2} dot={false} isAnimationActive={false} />
                              <Line type="step" dataKey={normalizeIndicators ? "RMSE_100" : "RMSE"} name="RMSE" stroke="#3f51b5" strokeWidth={2} dot={false} isAnimationActive={false} />
                              <Line type="step" dataKey={normalizeIndicators ? "VAR_100" : "VAR"} name="VAR" stroke="#ffeb3b" strokeWidth={2} dot={false} isAnimationActive={false} />
                              <Line type="step" dataKey={normalizeIndicators ? "PTP_100" : "PTP"} name="PTP" stroke="#009688" strokeWidth={2} dot={false} isAnimationActive={false} />
                              <Line type="step" dataKey={normalizeIndicators ? "MEAN_100" : "MEAN"} name="MEAN" stroke="#e91e63" strokeWidth={2} dot={false} isAnimationActive={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>

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