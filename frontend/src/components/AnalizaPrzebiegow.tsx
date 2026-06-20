// AnalizaPrzebiegow.tsx
import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { LineChart, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea, ReferenceLine } from 'recharts';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { getUnit, getErrorColor } from './utils';
import { emitAppLog } from './Notifications';
type Metric = 'MAE' | 'MSE' | 'IAE' | 'ISE';
const METRICS: Metric[] = ['MAE', 'MSE', 'IAE', 'ISE'];

// MINI WYKRES: Zero matematyki, przyjmuje gotowe obszary błędu z Propsów!
const MiniAnalizaChart = ({ title, data, unit, failureThreshold, showTimeMarker, violationAreas, violationPercent }: any) => {
  const getBadgeColor = () => {
      if (violationPercent === 0) return '#4caf50';
      if (violationPercent >= failureThreshold) return '#f44336';
      return '#ff9800';
  };
  return (
    <div style={{ background: '#111', padding: '10px', borderRadius: '8px', border: '1px solid #333', marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h5 style={{ margin: 0, color: '#aaa', fontSize: '0.8rem' }}>{title} [{unit}]</h5>
        <span style={{ background: getBadgeColor(), color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold' }}>
          {violationPercent > 0 ? `${violationPercent.toFixed(1)}% błędów` : 'OK'}
        </span>
      </div>
      <div style={{ height: '120px', position: 'relative' }}>
        {showTimeMarker && (
          <div className="mini-sync-line" style={{ position: 'absolute', top: 5, bottom: 5, width: '2px', backgroundColor: '#9c27b0', left: '5px', zIndex: 100, pointerEvents: 'none' }} />
        )}
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="2 2" stroke="#222" vertical={false} />
            <XAxis dataKey="Time" hide />
            <YAxis domain={['auto', 'auto']} hide />
            <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', fontSize: '10px', borderColor: '#444' }} formatter={(v: any) => [Number(v).toFixed(2), '']} />
            {violationAreas && violationAreas.map((area: any, idx: number) => <ReferenceArea key={`violation-${idx}`} x1={area.start} x2={area.end} fill="#f44336" fillOpacity={0.25} strokeOpacity={0} />)}
            <Line dataKey="UpperLimit" stroke="#9e9e9e" strokeDasharray="3 3" dot={false} strokeOpacity={0.4} isAnimationActive={false} />
            <Line dataKey="LowerLimit" stroke="#9e9e9e" strokeDasharray="3 3" dot={false} strokeOpacity={0.4} isAnimationActive={false} />
            <Line dataKey="Referencja" stroke="#4caf50" strokeWidth={1} dot={false} isAnimationActive={false} />
            <Line dataKey="Badany" stroke="#ffeb3b" strokeWidth={1} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
const PrecalculatedRobot = ({ points, isGhost = false }: { points: number[][], isGhost?: boolean }) => {
  if (!points || points.length !== 7) return null;
  const Segment = ({ p1, p2, color }: { p1: number[], p2: number[], color: string }) => {
    const v1 = new THREE.Vector3(p1[0], p1[1], p1[2]);
    const v2 = new THREE.Vector3(p2[0], p2[1], p2[2]);
    const distance = v1.distanceTo(v2);
    if (distance < 0.001) return null;
    const position = v2.clone().add(v1).divideScalar(2);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v2.clone().sub(v1).normalize());
    
    // Ustalanie koloru i przezroczystości dla ducha
    const materialColor = isGhost ? '#00bcd4' : color;
    const opacity = isGhost ? 0.25 : 1;

    return (
      <mesh position={position} quaternion={quaternion}>
        <cylinderGeometry args={[0.03, 0.03, distance, 12]} />
        <meshStandardMaterial color={materialColor} transparent={isGhost} opacity={opacity} />
      </mesh>
    );
  };
  const colors = ['#555', '#2196f3', '#4caf50', '#ff9800', '#e91e63', '#9c27b0'];
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {points.map((p, i) => (
        <Fragment key={i}>
          <mesh position={[p[0], p[1], p[2]]}>
            <sphereGeometry args={[isGhost ? 0.035 : 0.04]} />
            <meshStandardMaterial 
              color={isGhost ? '#00bcd4' : '#ffeb3b'} 
              transparent={isGhost} 
              opacity={isGhost ? 0.3 : 1} 
            />
          </mesh>
          {i < 6 && <Segment p1={p} p2={points[i + 1]} color={colors[i]} />}
        </Fragment>
      ))}
    </group>
  );
};

// --- ZOPTYMALIZOWANY ODTWARZACZ 3D Z IDEALNĄ SYNCHRONIZACJĄ CZASU ---
const RobotPlayer3D = ({ trajectory, refTrajectory, showGhost, setShowGhost, displayedData, testData, playbackIndex, setPlaybackIndex, handleLiveScrub, isTrajectoryLoading }: any) => {
  const [localIndex, setLocalIndex] = useState(playbackIndex || 0);
  const [isDocked, setIsDocked] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(isPlaying);
  
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const speedRef = useRef(playbackSpeed);

  const [dockWidth, setDockWidth] = useState(450); 
  const [dockHeight, setDockHeight] = useState(280);

  useEffect(() => {
    setLocalIndex(playbackIndex);
  }, [playbackIndex]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    speedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  // GŁÓWNA PĘTLA ANIMACJI Z CIĄGŁYM "WIRTUALNYM CZASEM"
  useEffect(() => {
    let frameId: number;
    let lastTime = performance.now();
    let currentIndex = localIndex;
    
    // Niezależny, idealnie tykający stoper odtwarzania
    let virtualTime = displayedData[currentIndex]?.Time || 0; 

    const loop = (time: number) => {
      if (!isPlayingRef.current) return;

      const deltaSec = (time - lastTime) / 1000.0;
      lastTime = time;

      if (!displayedData || displayedData.length === 0) return;

      // 1. Aktualizujemy wirtualny czas niezależnie od danych w CSV!
      virtualTime += deltaSec * speedRef.current;

      let nextIndex = currentIndex;
      
      // 2. Przesuwamy się do przodu tylko wtedy, gdy NASTĘPNA próbka jest starsza niż nasz stoper
      // (Używamy nextIndex + 1, żeby nie nadpisywać czasu i nie powodować przyspieszenia)
      while (nextIndex < displayedData.length - 1 && displayedData[nextIndex + 1].Time <= virtualTime) {
        nextIndex++;
      }

      if (nextIndex >= displayedData.length - 1) {
        setIsPlaying(false);
        setLocalIndex(displayedData.length - 1);
        setPlaybackIndex(displayedData.length - 1);
        if (handleLiveScrub) handleLiveScrub(displayedData.length - 1);
        return;
      }

      if (nextIndex !== currentIndex) {
        currentIndex = nextIndex;
        setLocalIndex(currentIndex);
        if (handleLiveScrub) handleLiveScrub(currentIndex);
      }

      frameId = requestAnimationFrame(loop);
    };

    if (isPlaying) {
      lastTime = performance.now();
      currentIndex = localIndex;
      // Przy starcie (lub wznowieniu) resetujemy wirtualny stoper do czasu wybranej klatki
      virtualTime = displayedData[currentIndex]?.Time || 0; 
      frameId = requestAnimationFrame(loop);
    }

    return () => cancelAnimationFrame(frameId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, displayedData]); 

  const currentTime = displayedData[localIndex]?.Time;
  const absoluteIndex = testData.findIndex((d: any) => d.Time === currentTime);
  const actualIndex = absoluteIndex !== -1 ? absoluteIndex : localIndex;

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault(); 
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = dockWidth;
    const startH = dockHeight;

    const onMouseMove = (eMove: MouseEvent) => {
      const newW = startW + (startX - eMove.clientX);
      const newH = startH + (startY - eMove.clientY);
      setDockWidth(Math.max(300, Math.min(newW, 1200)));
      setDockHeight(Math.max(200, Math.min(newH, 800)));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'default'; 
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'nwse-resize'; 
  };

  return (
    <div style={{ 
      marginTop: isDocked ? '0' : '3rem', padding: '1rem', 
      background: isDocked ? 'rgba(25, 25, 25, 0.98)' : '#222', backdropFilter: isDocked ? 'blur(12px)' : 'none',
      borderRadius: '8px', border: isDocked ? '2px solid #9c27b0' : '1px solid #333', 
      position: isDocked ? 'fixed' : 'relative', bottom: isDocked ? '20px' : 'auto', right: isDocked ? '20px' : 'auto',
      width: isDocked ? `${dockWidth}px` : 'auto', zIndex: isDocked ? 2000 : 1,
      boxShadow: isDocked ? '0 20px 50px rgba(0,0,0,0.9)' : 'none',
      transition: isDocked ? 'none' : 'all 0.3s ease-in-out'
    }}>
      
      {isDocked && (
        <div 
          onMouseDown={startResize} title="Złap i przeciągnij, aby zmienić rozmiar"
          style={{
            position: 'absolute', top: 0, left: 0, width: '25px', height: '25px', cursor: 'nwse-resize', zIndex: 10, borderTopLeftRadius: '6px',
            background: 'linear-gradient(135deg, rgba(156,39,176,0.8) 0%, rgba(156,39,176,0.8) 30%, transparent 30%)'
          }}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', paddingLeft: isDocked ? '15px' : '0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h3 style={{ color: '#9c27b0', margin: 0, fontSize: isDocked ? '1rem' : '1.17em', marginRight: '10px' }}></h3>
          
          <button 
            onClick={() => {
              if (!isPlaying && localIndex >= displayedData.length - 1) {
                setLocalIndex(0);
                setPlaybackIndex(0);
                if (handleLiveScrub) handleLiveScrub(0);
              }
              if (isPlaying) setPlaybackIndex(localIndex); 
              setIsPlaying(!isPlaying);
            }}
            style={{
              background: isPlaying ? '#ff9800' : '#4caf50', color: 'white', 
              border: 'none', borderRadius: '4px', padding: '4px 10px', 
              fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold'
            }}
          >
            {isPlaying ? '⏸ Pauza' : '▶ Play'}
          </button>

          <select 
            value={playbackSpeed} onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
            style={{
              background: '#333', color: 'white', border: '1px solid #555', 
              borderRadius: '4px', padding: '3px 5px', fontSize: '0.75rem', cursor: 'pointer', outline: 'none'
            }}
          >
            <option value={0.1}>0.1x</option>
            <option value={0.25}>0.25x</option>
            <option value={0.5}>0.5x</option>
            <option value={1.0}>1.0x</option>
            <option value={2.0}>2.0x</option>
            <option value={5.0}>5.0x</option>
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h3 style={{ color: '#9c27b0', margin: 0, fontSize: isDocked ? '1rem' : '1.17em', marginRight: '10px' }}></h3>
            
            {/* Istniejące przyciski Play, Select, Dock... */}
            
            <label style={{ color: '#00bcd4', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', marginLeft: '10px' }}>
              <input 
                type="checkbox" 
                checked={showGhost} 
                onChange={(e) => setShowGhost(e.target.checked)} 
                style={{ accentColor: '#00bcd4' }}
              />
              Pokaż ducha referencji
            </label>
          </div>
          <button 
            onClick={() => setIsDocked(!isDocked)}
            style={{
              background: isDocked ? '#e91e63' : '#444', color: 'white', 
              border: 'none', borderRadius: '4px', padding: '4px 10px', 
              fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold', marginLeft: '5px'
            }}
          >
            {isDocked ? '🔓 Odepnij' : '📌 Przypnij'}
          </button>
        </div>

        <span style={{ color: '#aaa', background: '#111', padding: '3px 10px', borderRadius: '4px', fontSize: '0.8rem', border: '1px solid #444' }}>
          <strong>{currentTime?.toFixed(3) || 0} s</strong>
        </span>
      </div>

      <input 
        type="range" min={0} max={Math.max(displayedData.length - 1, 0)} value={localIndex} 
        onChange={(e) => {
            const newIdx = Number(e.target.value);
            setLocalIndex(newIdx); 
            if (handleLiveScrub) handleLiveScrub(newIdx); 
        }}
        onMouseUp={() => setPlaybackIndex(localIndex)} 
        onMouseDown={() => {
          setIsPlaying(false);
          setPlaybackIndex(localIndex); 
        }} 
        style={{ width: '100%', marginBottom: '10px', cursor: 'pointer' }} 
      />

      <div style={{ 
        height: isDocked ? `${dockHeight}px` : '500px', background: '#111', borderRadius: '6px', border: '1px solid #444', overflow: 'hidden', position: 'relative'
      }}>
        {isTrajectoryLoading ? (
          <div style={{ padding: '1rem', color: '#00bcd4', textAlign: 'center' }}>
            <p style={{ fontSize: '0.9rem', marginTop: isDocked ? '20%' : '100px' }}>⏳ Obliczanie macierzy...</p>
          </div>
        ) : (
          <Canvas camera={{ position: [2, 1.5, 2], fov: 45 }}>
            <color attach="background" args={['#1a1a1a']} />
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} intensity={1} />
            <Grid infiniteGrid fadeDistance={10} sectionColor="#444" cellColor="#222" />
            {trajectory && trajectory.length > 0 && (
              <PrecalculatedRobot points={trajectory[actualIndex]} />
            )}
            {showGhost && refTrajectory && refTrajectory.length > 0 && refTrajectory[actualIndex] && (
              <PrecalculatedRobot points={refTrajectory[actualIndex]} isGhost={true} />
            )}
            <OrbitControls makeDefault />
          </Canvas>
        )}
      </div>
    </div>
  );
};

const paramStyle: React.CSSProperties = {
  background: '#1a1a1a', padding: '6px 10px', borderRadius: '4px', 
  border: '1px solid #333', fontSize: '0.8rem', color: '#bbb'
};

const SignalStatsTable = ({ title, stats, unit, color }: any) => {
  if (!stats) return null;
  const rowStyle = { borderBottom: '1px solid #333', fontSize: '0.85rem' };
  const labelStyle = { padding: '6px', color: '#aaa', textAlign: 'left' as const };
  const valStyle = { padding: '6px', textAlign: 'right' as const, fontWeight: 'bold', color: '#fff' };

  return (
    <div style={{ background: '#111', borderRadius: '8px', padding: '10px', border: `1px solid ${color}44` }}>
      <h5 style={{ margin: '0 0 10px 0', color: color, borderBottom: `1px solid ${color}66`, paddingBottom: '5px' }}>{title}</h5>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr style={rowStyle}><td style={labelStyle}>Minimum:</td><td style={valStyle}>{stats.min.toFixed(4)} {unit}</td></tr>
          <tr style={rowStyle}><td style={labelStyle}>Maximum:</td><td style={valStyle}>{stats.max.toFixed(4)} {unit}</td></tr>
          <tr style={rowStyle}><td style={labelStyle}>Peak-to-Peak:</td><td style={valStyle}>{stats.peak_to_peak.toFixed(4)} {unit}</td></tr>
          <tr style={rowStyle}><td style={labelStyle}>Średnia (Mean):</td><td style={valStyle}>{stats.mean.toFixed(4)} {unit}</td></tr>
          <tr style={rowStyle}><td style={labelStyle}>Wartość RMS:</td><td style={valStyle}>{stats.rms.toFixed(4)} {unit}</td></tr>
          <tr style={{ ...rowStyle, border: 'none' }}><td style={labelStyle}>Odch. standardowe:</td><td style={valStyle}>{stats.std.toFixed(4)}</td></tr>
        </tbody>
      </table>
    </div>
  );
};

const ParamBox = ({ label, value, color }: { label: string, value: any, color: string }) => (
  <div style={{ background: '#1a1a1a', padding: '8px 12px', borderRadius: '6px', border: '1px solid #333' }}>
    <span style={{ color: '#888', fontSize: '0.75rem', display: 'block', marginBottom: '2px' }}>{label}</span>
    <strong style={{ color: color, fontSize: '1.1rem' }}>{value ?? '-'}</strong>
  </div>
);

export const AnalizaPrzebiegow = ({ selectedFilePath }: { selectedFilePath: string | null }) => {
  const [robotInfo, setRobotInfo] = useState<any>(null);
  
  // NOWY GŁÓWNY STAN: Wynik obliczeń z Backendu!
  const [diagnosis, setDiagnosis] = useState<any>(null);
  const [testData, setTestData] = useState<any[]>([]); // Tylko po to, by mieć surowy czas dla 3D
  const [showParamsModal, setShowParamsModal] = useState(false);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [selectedColumn, setSelectedColumn] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'detailed' | 'combined' | 'batch'>('detailed');
  const [refAreaLeft, setRefAreaLeft] = useState<number | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<number | null>(null);
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);
  const [playbackIndex, setPlaybackIndex] = useState<number>(0);
  const [trajectory, setTrajectory] = useState<any[]>([]);
  const [refTrajectory, setRefTrajectory] = useState<any[]>([]); // <--- NOWE
  const [showGhost, setShowGhost] = useState<boolean>(true); // <--- NOWE
  const [isTrajectoryLoading, setIsTrajectoryLoading] = useState(false);
  const [showTimeMarker, setShowTimeMarker] = useState<boolean>(true);
  const [isAutoDiagnosing, setIsAutoDiagnosing] = useState(false);
  const mainChartLineRef = useRef<HTMLDivElement>(null);
  const diffChartLineRef = useRef<HTMLDivElement>(null);
  const [overrideConfig, setOverrideConfig] = useState<any>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [batchResults, setBatchResults] = useState<any[] | null>(null);
  const [isBatchLoading, setIsBatchLoading] = useState(false);
  const [batchTrendSelection, setBatchTrendSelection] = useState<string>('Ogólny');
  const robotName = selectedFilePath ? selectedFilePath.split(/[/\\]/)[1] : '';
  const isFile = selectedFilePath ? selectedFilePath.endsWith('.csv') : false;

  // Funkcja pomocnicza do aktualizacji pojedynczego parametru w symulacji
  const updateOverride = (key: string, value: any) => {
    setOverrideConfig((prev: any) => ({
        ...(prev || diagnosis?.usedConfig || {}),
        [key]: value
    }));
  };

  // Niezależne wywołanie przeliczenia algorytmów (bez pobierania plików od zera)
  const handleRecalculate = async (configToUse = overrideConfig) => {
    setIsLoading(true);
    emitAppLog('info', 'Uruchomiono przeliczanie analizy z nowymi parametrami (Symulacja)...');
    try {
      const resDiag = await fetch('http://127.0.0.1:8000/api/diagnose', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
           robot_name: robotName, 
           test_file_path: selectedFilePath,
           override_config: configToUse // Wysyłamy nadpisane parametry!
        })
      });
      if (resDiag.ok) {
        const diagData = await resDiag.json();
        if (!diagData.error) {
          setDiagnosis(diagData);
          setAvailableColumns(diagData.columns);
          if (!selectedColumn) setSelectedColumn(diagData.columns[0]);
          emitAppLog('success', 'Zakończono przeliczanie. Wykresy i limity zostały zaktualizowane.');
        } else {
          emitAppLog('error', `Błąd diagnozy: ${diagData.error}`);
        }
      }
    } catch (e) { 
      emitAppLog('error', 'Błąd komunikacji z serwerem podczas przeliczania.');
    }
    setIsLoading(false);
  };

  
  // --- FUNKCJA: Analiza Grupowa (Folder) ---
  const handleBatchAnalysis = async () => {
    if (!selectedFilePath) return;
    
    // NAPRAWA BŁĘDU WINDOWS: Normalizujemy ukośniki przed cięciem tekstu!
    const normalizedPath = selectedFilePath.replace(/\\/g, '/');
    const folderPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));
    
    setIsBatchLoading(true);
    emitAppLog('info', `Rozpoczęto grupową analizę folderu: ${folderPath.split('/').pop()}...`);
    
    try {
      const res = await fetch('http://127.0.0.1:8000/api/diagnose/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          robot_name: robotName,
          folder_path: folderPath,
          override_config: overrideConfig
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.error) {
          emitAppLog('error', `Błąd analizy grupowej: ${data.error}`);
        } else {
          setBatchResults(data.batch_results);
          emitAppLog('success', `Ukończono analizę. Przetworzono ${data.batch_results.length} przejazdów.`);
        }
      }
    } catch (err) {
      emitAppLog('error', 'Błąd komunikacji podczas analizy grupowej.');
    } finally {
      setIsBatchLoading(false);
    }
  };

  // --- FUNKCJA: Eksport tabeli do CSV ---
  const exportBatchToCSV = () => {
    if (!batchResults || batchResults.length === 0) return;
    
    // Pobieramy aktywny próg
    const activeThreshold = overrideConfig?.max_violation_threshold || diagnosis?.usedConfig?.max_violation_threshold || 5.0;

    let csvContent = "Sygnal / Parametr,";
    csvContent += batchResults.map((r: any) => r.file_name.replace('.csv', '')).join(",") + "\n";

    csvContent += "Label Manualny,";
    csvContent += batchResults.map((r: any) => r.manual_label).join(",") + "\n";

    csvContent += "Label Systemu,";
    csvContent += batchResults.map((r: any) => r.auto_label).join(",") + "\n";

    availableColumns.forEach(col => {
      csvContent += `${col},`;
      csvContent += batchResults.map((r: any) => {
        const val = r.violation_percents[col] || 0;
        return val.toFixed(2);
      }).join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Analiza_Wielokrotna_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    emitAppLog('success', 'Pobrano plik CSV z wynikami analizy.');
  };

  const handleTriggerAutoDiagnosis = async () => {
          if (!robotName || !selectedFilePath) return;
          setIsAutoDiagnosing(true);
          try {
            const res = await fetch('http://127.0.0.1:8000/api/file/save-auto-diagnosis', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ robot_name: robotName, test_file_path: selectedFilePath })
            });
            if (res.ok) {
              const data = await res.json();
              emitAppLog('success', `Zakończono auto-diagnostykę. Werdykt zapisany do pliku: ${data.auto_label}`);
              
              // Wyzwolenie globalnego eventu do odświeżenia Sidebaru
              window.dispatchEvent(new CustomEvent('refreshFileTree'));
              
              // Odświeżenie obecnego widoku wykresów
              const resDiag = await fetch('http://127.0.0.1:8000/api/diagnose', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ robot_name: robotName, test_file_path: selectedFilePath })
              });
              if (resDiag.ok) setDiagnosis(await resDiag.json());
            }
          } catch (err) {
            console.error(err);
          } finally {
            setIsAutoDiagnosing(false);
          }
        };

  // 1. GŁÓWNY EFEKT: Pobieranie przeliczonych danych z Pythona
  useEffect(() => {
    if (!robotName || !isFile || !selectedFilePath) return;
    
    const fetchAllData = async () => {
      setIsLoading(true);
      // CZYSZCZENIE STANÓW PRZED NOWYM ZAPYTANIEM
      
      setDiagnosis(null);
      //setTestData([]);
      setRobotInfo(null);
      
      try {
        // Pobierz info o robocie
        const resInfo = await fetch('http://127.0.0.1:8000/api/robot-info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ robot_name: robotName }) });
        if (resInfo.ok) setRobotInfo(await resInfo.json());

        // Surowe dane do mapowania czasu 3D
        const resTest = await fetch('http://127.0.0.1:8000/api/file-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: selectedFilePath }) });
        if (resTest.ok) setTestData(await resTest.json());

        // GŁÓWNE ZAPYTANIE: Analiza Diagnostyczna
        const resDiag = await fetch('http://127.0.0.1:8000/api/diagnose', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ robot_name: robotName, test_file_path: selectedFilePath, override_config: overrideConfig })
        });
        
        if (resDiag.ok) {
          const diagData = await resDiag.json();
          // WYSYŁAMY BŁĄD DO ROBACZKA 🐛
          if (diagData.error) {
            emitAppLog('error', diagData.error);
            setDiagnosis(null); // Czyscimy wykresy
          } else {
            setDiagnosis(diagData);
            setAvailableColumns(diagData.columns);
            if (!selectedColumn) setSelectedColumn(diagData.columns[0]);
            setZoomRange(null);
          }
        }
      } catch (e) { 
        console.error(e); 
        emitAppLog('error', "Wystąpił problem z połączeniem z serwerem diagnostycznym.");
      }
      setIsLoading(false);
    };
    fetchAllData();
  }, [robotName, selectedFilePath]);

  // Pobieranie trajektorii 3D
useEffect(() => {
  if (!selectedFilePath) return;
  const fetchKinematics = async () => {
    setIsTrajectoryLoading(true);
    //setTrajectory([]);
    //setRefTrajectory([]);
    try {
      // 1. Pobierz trajektorię badaną
      const res = await fetch('http://127.0.0.1:8000/api/kinematics', { 
        method: 'POST', headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ path: selectedFilePath }) 
      });
      if (res.ok) {
        const data = await res.json();
        if (data.trajectory) setTrajectory(data.trajectory);
      }

      // 2. Pobierz trajektorię referencyjną (ducha)
      if (robotInfo?.ref_file_info?.path) {
        const resRef = await fetch('http://127.0.0.1:8000/api/kinematics', { 
          method: 'POST', headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ path: robotInfo.ref_file_info.path }) 
        });
        if (resRef.ok) {
          const refData = await resRef.json();
          if (refData.trajectory) setRefTrajectory(refData.trajectory);
        }
      }
    } catch (e) { console.error(e); }
    setIsTrajectoryLoading(false);
  };
  fetchKinematics();
}, [selectedFilePath, robotInfo]); // Zależność od robotInfo, bo stamtąd mamy ścieżkę


  // =====================================================================
  // CIENKI KLIENT - CAŁA MATEMATYKA ZNIKNĘŁA! Po prostu mapujemy z JSONa.
  // =====================================================================
  const combinedData = diagnosis?.chartData?.[selectedColumn] || [];
  
  // Aplikowanie zooma na gotowe dane
  const displayedData = useMemo(() => {
    return zoomRange ? combinedData.filter((d: any) => d.Time >= zoomRange[0] && d.Time <= zoomRange[1]) : combinedData;
  }, [combinedData, zoomRange]);

  const statsData = diagnosis?.statsData;
  const globalDiagnosis = diagnosis?.globalDiagnosis;
  const violationAreas = diagnosis?.violationAreas?.[selectedColumn] || [];
  const violationPercent = diagnosis?.statsData?.violationPercents?.[selectedColumn] || 0;

  // Płynny suwak
  const handleLiveScrub = (index: number) => {
    if (!combinedData || combinedData.length < 2) return;
    const percent = index / (combinedData.length - 1);
    
    // IDEALNIE WYMERZONE MARGINESY:
    // Start wykresu to 90px (10px margines lewy + 80px szerokość YAxis)
    // Prawy margines to 30px. Więc szerokość siatki to 100% - 120px.
    const mainCssCalc = `calc(90px + (100% - 120px) * ${percent})`;
    
    if (mainChartLineRef.current) mainChartLineRef.current.style.left = mainCssCalc;
    if (diffChartLineRef.current) diffChartLineRef.current.style.left = mainCssCalc;

    const miniCssCalc = `calc(5px + (100% - 10px) * ${percent})`;
    document.querySelectorAll<HTMLElement>('.mini-sync-line').forEach(line => line.style.left = miniCssCalc);
  };

  const handleZoom = () => {
    if (refAreaLeft === refAreaRight || refAreaLeft === null || refAreaRight === null) { setRefAreaLeft(null); setRefAreaRight(null); return; }
    let [left, right] = [refAreaLeft, refAreaRight];
    if (left > right) [left, right] = [right, left];
    setZoomRange([left, right]); setRefAreaLeft(null); setRefAreaRight(null);
  };

  const unit = getUnit(selectedColumn);

  return (
    
    <div style={{ textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ color: '#e91e63', margin: 0 }}>📈 Analiza przebiegów</h2>
        {selectedFilePath && isFile && (
            <button
              onClick={handleTriggerAutoDiagnosis}
              disabled={isAutoDiagnosing}
              style={{
                padding: '8px 16px',
                background: '#9c27b0',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 'bold',
                cursor: isAutoDiagnosing ? 'not-allowed' : 'pointer',
                boxShadow: '0 0 10px rgba(156, 39, 176, 0.5)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              {isAutoDiagnosing ? '⏳ Analizowanie...' : '🧠 Uruchom Auto-Diagnostykę'}
            </button>
          )}
        
      </div>
      
      {robotName ? (
        <div style={{ marginTop: '1rem', padding: '1.5rem', border: '1px solid #444', borderRadius: '8px', backgroundColor: '#1a1a1a' }}>
          
          

          {/* NAGŁÓWEK RAPORTU: 2 KOLUMNY */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            
            {/* KOLUMNA 1: Informacje o przebiegu (Maszyna + Pliki) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ background: '#2a2a2a', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #00bcd4' }}>
                <h4 style={{ margin: '0 0 5px 0', color: '#00bcd4' }}>🤖 Maszyna i Lokalizacja</h4>
                <p style={{ margin: '5px 0', color: '#aaa', fontSize: '0.9rem' }}>Model: <strong style={{ color: '#fff' }}>{robotInfo?.config?.model || 'Nieokreślony'}</strong></p>
                <p style={{ margin: '5px 0', color: '#aaa', fontSize: '0.9rem' }}>Lokalizacja: <strong style={{ color: '#fff' }}>{robotInfo?.config?.location || 'Nieokreślona'}</strong></p>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ background: '#2a2a2a', padding: '10px', borderRadius: '8px', borderLeft: '4px solid #4caf50' }}>
                  <h4 style={{ margin: '0 0 5px 0', color: '#4caf50', fontSize: '0.85rem' }}>🟢 Referencja</h4>
                  <p style={{ margin: '0', color: '#aaa', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {robotInfo?.ref_file_info?.name || 'Brak pliku'}
                  </p>
                </div>
                <div style={{ background: '#2a2a2a', padding: '10px', borderRadius: '8px', borderLeft: '4px solid #ffeb3b' }}>
                  <h4 style={{ margin: '0 0 5px 0', color: '#ffeb3b', fontSize: '0.85rem' }}>🟡 Badanie</h4>
                  <p style={{ margin: '0', color: '#aaa', fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {selectedFilePath?.split(/[/\\]/).pop()}
                  </p>
                </div>
              </div>
            </div>

{/* KOLUMNA 2: Konfiguracja i Typ Diagnostyki (SYMULACJA) */}
            <div style={{ background: '#222', padding: '1.5rem', borderRadius: '8px', border: overrideConfig ? '2px solid #ff9800' : '1px solid #9c27b0', display: 'flex', flexDirection: 'column', transition: 'all 0.3s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
                <h4 style={{ margin: 0, color: overrideConfig ? '#ff9800' : '#9c27b0' }}>
                  {overrideConfig ? '⚠️ Parametry SYMULACJI' : '⚙️ Parametry aktywnej diagnozy'}
                </h4>
                
                <div style={{ display: 'flex', gap: '8px' }}>
                  {overrideConfig && (
                    <button 
                      onClick={() => { setOverrideConfig(null); setIsSimulating(false); handleRecalculate(null); emitAppLog('warning', 'Zresetowano do parametrów domyślnych robota.'); }}
                      style={{ background: '#f44336', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 10px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                      ✕ Resetuj
                    </button>
                  )}
                  <button 
                    onClick={() => { 
                      if (isSimulating) handleRecalculate(); 
                      setIsSimulating(!isSimulating); 
                    }}
                    style={{ background: isSimulating ? '#4caf50' : '#333', color: 'white', border: isSimulating ? 'none' : '1px solid #555', borderRadius: '4px', padding: '4px 10px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    {isSimulating ? '▶ Przelicz zmiany' : '🔧 Modyfikuj (What-If)'}
                  </button>
                </div>
              </div>

{diagnosis?.usedConfig ? (
                (() => {
                  const activeCfg = overrideConfig || diagnosis.usedConfig;
                  const inputStyle = { background: '#111', color: '#fff', border: '1px solid #444', padding: '4px 8px', width: '80px', borderRadius: '4px', fontSize: '0.9rem' };
                  
                  return (
                    <>
                      <div style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ color: '#aaa', fontSize: '0.85rem' }}>Wybrany rodzaj: </span>
                        {isSimulating ? (
                          <select 
                            value={activeCfg.diagnosis_type || 'Odchylenia'} 
                            onChange={(e) => updateOverride('diagnosis_type', e.target.value)}
                            style={{ background: '#111', color: '#fff', border: '1px solid #ff9800', padding: '6px', borderRadius: '4px', flex: 1, outline: 'none' }}
                          >
                            <option value="Odchylenia">Odchylenia (Tunel %)</option>
                            <option value="Odchylenie (offsetowe)">Odchylenia (Offset staly)</option>
                            <option value="Wskaźniki">Wskaźniki (MAE, ISE...)</option>
                            <option value="Statystyka">Statystyka (k-Sigma)</option>
                          </select>
                        ) : (
                          <strong style={{ color: overrideConfig ? '#ff9800' : '#e91e63', fontSize: '1rem', textTransform: 'uppercase' }}>
                            {activeCfg.diagnosis_type || 'Nieznany'}
                          </strong>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {activeCfg.diagnosis_type === 'Statystyka' ? (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...paramStyle }}>
                              <span>Mnożnik k-Sigma (σ):</span>
                              {isSimulating ? <input type="number" step="0.1" value={activeCfg.sigma_multiplier ?? 3.0} onChange={e => updateOverride('sigma_multiplier', parseFloat(e.target.value))} style={inputStyle} /> : <strong>{activeCfg.sigma_multiplier} x</strong>}
                            </div>
                            {diagnosis?.statsData?.calculatedStats?.[selectedColumn] && (
                              <div style={{ background: '#111', padding: '10px', borderRadius: '6px', border: '1px dashed #444' }}>
                                <span style={{ fontSize: '0.8rem', color: '#888' }}>Obliczono dla {selectedColumn}:</span>
                                <div style={{ marginTop: '5px' }}>
                                  <div style={{ color: '#aaa', fontSize: '0.85rem' }}>Sigma (σ): <strong>{diagnosis.statsData.calculatedStats[selectedColumn].sigma.toFixed(5)}</strong></div>
                                  <div style={{ color: '#ffeb3b', fontSize: '0.85rem' }}>Limit tunelu: <strong>± {diagnosis.statsData.calculatedStats[selectedColumn].limit.toFixed(5)}</strong></div>
                                </div>
                              </div>
                            )}
                          </>
                        ) : activeCfg.diagnosis_type === 'Wskaźniki' ? (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            {['mae', 'mse', 'iae', 'ise'].map(metric => (
                              <div key={metric} style={{ display: 'flex', flexDirection: 'column', ...paramStyle }}>
                                <span style={{ fontSize: '0.75rem' }}>Skalar {metric.toUpperCase()}:</span>
                                {isSimulating ? <input type="number" step="0.1" value={activeCfg[`${metric}_threshold`] ?? 1.0} onChange={e => updateOverride(`${metric}_threshold`, parseFloat(e.target.value))} style={{ ...inputStyle, width: '100%', marginTop: '4px' }} /> : <strong style={{ marginTop: '4px' }}>{activeCfg[`${metric}_threshold`]}x</strong>}
                              </div>
                            ))}
                          </div>
                        ) : activeCfg.diagnosis_type === 'Odchylenie (offsetowe)' ? (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...paramStyle }}><span>Offset Kątowy (A):</span>{isSimulating ? <input type="number" step="0.05" value={activeCfg.a_offset_threshold ?? 0.1} onChange={e => updateOverride('a_offset_threshold', parseFloat(e.target.value))} style={inputStyle} /> : <strong>{activeCfg.a_offset_threshold} °</strong>}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...paramStyle }}><span>Offset Prądowy (Cur):</span>{isSimulating ? <input type="number" step="0.5" value={activeCfg.cur_offset_threshold ?? 5.0} onChange={e => updateOverride('cur_offset_threshold', parseFloat(e.target.value))} style={inputStyle} /> : <strong>{activeCfg.cur_offset_threshold} %</strong>}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...paramStyle, border: '1px solid #f44336' }}><span>Max udział błędów:</span>{isSimulating ? <input type="number" step="1" value={activeCfg.max_violation_threshold ?? 5.0} onChange={e => updateOverride('max_violation_threshold', parseFloat(e.target.value))} style={inputStyle} /> : <strong style={{ color: '#f44336' }}>{activeCfg.max_violation_threshold} %</strong>}</div>
                          </>
                        ) : (
                          <>
                            {/* --- DODANO: Wybór metody tuningu dla opcji "Odchylenia" --- */}
                            <div style={{ marginBottom: '10px' }}>
                              <span style={{ color: '#aaa', fontSize: '0.75rem' }}>Metoda tuningu tunelu:</span>
                              {isSimulating ? (
                                <select 
                                  value={activeCfg.tuning_mode ?? 'okno'}
                                  onChange={e => updateOverride('tuning_mode', e.target.value)}
                                  style={{ width: '100%', background: '#111', color: '#fff', border: '1px solid #444', padding: '6px', marginTop: '4px', borderRadius: '4px' }}
                                >
                                  <option value="chwilowy">1. Zwykły procent (Punkt w punkt)</option>
                                  <option value="okno">2. Procent z okna (Koperta 11-próbek)</option>
                                  <option value="srednia">3. Procent ze średniej (Globalny tunel)</option>
                                </select>
                              ) : (
                                <strong style={{ display: 'block', marginTop: '4px', color: '#fff' }}>
                                  {activeCfg.tuning_mode === 'srednia' ? 'Procent ze średniej globalnej' : 
                                   activeCfg.tuning_mode === 'chwilowy' ? 'Zwykły procent (Punkt w punkt)' : 'Procent z okna (Koperta)'}
                                </strong>
                              )}
                            </div>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...paramStyle }}><span>Tol. Kątowa (A):</span>{isSimulating ? <input type="number" step="0.5" value={activeCfg.a_deviation_threshold ?? 2.0} onChange={e => updateOverride('a_deviation_threshold', parseFloat(e.target.value))} style={inputStyle} /> : <strong>{activeCfg.a_deviation_threshold} %</strong>}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...paramStyle }}><span>Tol. Prądowa (Cur):</span>{isSimulating ? <input type="number" step="0.5" value={activeCfg.cur_deviation_threshold ?? 2.0} onChange={e => updateOverride('cur_deviation_threshold', parseFloat(e.target.value))} style={inputStyle} /> : <strong>{activeCfg.cur_deviation_threshold} %</strong>}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...paramStyle }}><span>Deadband Kątowy:</span>{isSimulating ? <input type="number" step="0.01" value={activeCfg.a_deadband_threshold ?? 0.05} onChange={e => updateOverride('a_deadband_threshold', parseFloat(e.target.value))} style={inputStyle} /> : <strong>{activeCfg.a_deadband_threshold} °</strong>}</div>
                          </>
                        )}
                      </div>
                    </>
                  );
                })()
              ) : (
                <p style={{ color: '#555', fontStyle: 'italic', fontSize: '0.85rem' }}>Czekam na dane obliczeniowe...</p>
              )}
            </div>
          </div>
          {combinedData.length > 0 && isFile && (
            <>
              {statsData && (
                <div style={{ marginBottom: '2rem' }}>
                  <h3 style={{ color: '#00bcd4', marginBottom: '0.5rem', borderBottom: '1px solid #444', paddingBottom: '5px' }}>Wskaźniki Błędów: MAE, IAE, ISE</h3>
                  <div style={{ background: '#111', padding: '1rem', borderRadius: '8px', border: '1px solid #333', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', color: '#fff', fontSize: '0.9rem' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '8px', borderBottom: '1px solid #555', borderRight: '1px solid #444' }}></th>
                          <th colSpan={statsData.aCols.length} style={{ padding: '8px', borderBottom: '1px solid #555', borderRight: '1px solid #444', color: '#aaa' }}>Odchylenia Kątowe [°]</th>
                          <th colSpan={statsData.curCols.length} style={{ padding: '8px', borderBottom: '1px solid #555', color: '#aaa' }}>Odchylenia Prądowe [%]</th>
                        </tr>
                        <tr>
                          <th style={{ padding: '8px', borderBottom: '1px solid #444', borderRight: '1px solid #444', color: '#888', textAlign: 'left' }}>Wskaźnik</th>
                          {statsData?.aCols?.map((c: string) => <th key={c} style={{ padding: '8px', borderBottom: '1px solid #444', borderRight: c === statsData.aCols[statsData.aCols.length - 1] ? '1px solid #444' : 'none', color: '#bbb' }}>{c}</th>)}
                          {statsData?.curCols?.map((c: string) => <th key={c} style={{ padding: '8px', borderBottom: '1px solid #444', color: '#bbb' }}>{c}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {METRICS.map(metric => {
                          return (
                            <tr key={metric}>
                            <td style={{ padding: '8px', borderBottom: '1px solid #333', borderRight: '1px solid #444', textAlign: 'left', fontWeight: 'bold', color: '#00bcd4' }}>{metric}</td>
                            
                            {/* Kolumny dla Osi (A) */}
                            {statsData.aCols.map((c: any) => { 
                                const val = statsData.errors[metric][c]; 
                                const bgColor = getErrorColor(val, statsData.maxes.A[metric]); 
                                const lightBg = bgColor.replace('hsl', 'hsla').replace(')', ', 0.15)');
                                const isExceeded = statsData.exceededLimits?.[metric]?.[c] || false;
                                
                                // POBIERAMY PRÓG Z ZASADY 3-SIGM WYLICZONY NA BACKENDZIE
                                const threshold = statsData.calculatedThresholds?.[metric]?.[c];

                                return (
                                <td key={c} style={{ padding: '8px', borderBottom: '1px solid #333', borderRight: c === statsData.aCols[statsData.aCols.length - 1] ? '1px solid #444' : 'none' }}>
                                    <div style={{ background: `linear-gradient(180deg, #222 0%, ${lightBg} 100%)`, borderBottom: `4px solid ${bgColor}`, padding: '4px', borderRadius: '4px', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}>
                                      <span>{val.toFixed(5)}</span>
                                      
                                      {isExceeded && (
                                        <span 
                                          title={`Przekroczono wyliczony limit 3σ: ${threshold?.toFixed(4)}`} 
                                          style={{ cursor: 'help', fontSize: '1.1rem', filter: 'drop-shadow(0 0 5px rgba(255, 235, 59, 0.8))' }}
                                        >
                                          ⚠️
                                        </span>
                                      )}
                                    </div>
                                </td>
                                ); 
                            })}

                            {statsData.curCols.map((c: any) => { 
                                const val = statsData.errors[metric][c]; 
                                const bgColor = getErrorColor(val, statsData.maxes.A[metric]); 
                                const lightBg = bgColor.replace('hsl', 'hsla').replace(')', ', 0.15)');
                                const isExceeded = statsData.exceededLimits?.[metric]?.[c] || false;
                                
                                // POBIERAMY PRÓG Z ZASADY 3-SIGM WYLICZONY NA BACKENDZIE
                                const threshold = statsData.calculatedThresholds?.[metric]?.[c];

                                return (
                                <td key={c} style={{ padding: '8px', borderBottom: '1px solid #333', borderRight: c === statsData.aCols[statsData.aCols.length - 1] ? '1px solid #444' : 'none' }}>
                                    <div style={{ background: `linear-gradient(180deg, #222 0%, ${lightBg} 100%)`, borderBottom: `4px solid ${bgColor}`, padding: '4px', borderRadius: '4px', fontWeight: 'bold', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}>
                                      <span>{val.toFixed(5)}</span>
                                      
                                      {isExceeded && (
                                        <span 
                                          title={`Przekroczono wyliczony limit 3σ: ${threshold?.toFixed(4)}`} 
                                          style={{ cursor: 'help', fontSize: '1.1rem', filter: 'drop-shadow(0 0 5px rgba(255, 235, 59, 0.8))' }}
                                        >
                                          ⚠️
                                        </span>
                                      )}
                                    </div>
                                </td>
                                ); 
                            })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#222', padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '15px' }}>
          <button onClick={() => setViewMode('detailed')} style={{ padding: '8px 20px', background: viewMode === 'detailed' ? '#646cff' : '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', transition: '0.3s' }}>
            🔍 Pojedynczy Przejazd
          </button>
          <button onClick={() => setViewMode('combined')} style={{ padding: '8px 20px', background: viewMode === 'combined' ? '#646cff' : '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', transition: '0.3s' }}>
            📊 Widok Wspólny
          </button>
          <button 
            onClick={() => { setViewMode('batch'); if (!batchResults) handleBatchAnalysis(); }} 
            style={{ padding: '8px 20px', background: viewMode === 'batch' ? '#e91e63' : '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', transition: '0.3s' }}
          >
            📑 Analiza Folderu (Batch)
          </button>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button 
            onClick={() => setShowParamsModal(true)}
            style={{ padding: '5px 12px', background: '#2196f3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
          >
            📊 Parametry sygnału
          </button>
          {/* Istniejący wskaźnik udziału błędów... */}
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '10px' }}>
          <label style={{ color: '#aaa', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div onClick={() => setShowTimeMarker(!showTimeMarker)} style={{ width: '40px', height: '20px', background: showTimeMarker ? '#9c27b0' : '#444', borderRadius: '10px', position: 'relative', transition: '0.3s', cursor: 'pointer' }}>
              <div style={{ width: '16px', height: '16px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: showTimeMarker ? '22px' : '2px', transition: '0.3s' }} />
            </div>
            Synchronizacja 3D
          </label>
        </div>
        
        {viewMode === 'detailed' && zoomRange && (
          <button onClick={() => setZoomRange(null)} style={{ padding: '8px 16px', background: '#444', color: 'white', border: '1px solid #555', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
            🔄 Reset Zoom
          </button>
        )}
      </div>

          {/* WIDOK: ANALIZA BATCH (TABELA) */}
          {viewMode === 'batch' ? (
            <div style={{ background: '#111', padding: '1.5rem', borderRadius: '8px', border: '1px solid #333', width: '100%', boxSizing: 'border-box', minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ color: '#e91e63', margin: 0 }}>Zestawienie Zbiorcze Przejazdów</h3>
                  <span style={{ color: '#888', fontSize: '0.85rem' }}>Bazuje na limitach z sekcji konfiguracyjnej powyżej</span>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {batchResults && (
                    <button onClick={exportBatchToCSV} style={{ background: '#2196f3', color: 'white', padding: '8px 15px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                      📥 Eksport do CSV
                    </button>
                  )}
                  <button onClick={handleBatchAnalysis} disabled={isBatchLoading} style={{ background: '#4caf50', color: 'white', padding: '8px 15px', border: 'none', borderRadius: '4px', cursor: isBatchLoading ? 'wait' : 'pointer', fontWeight: 'bold' }}>
                    {isBatchLoading ? '⏳ Przeliczanie...' : '🔄 Odśwież Tabelę'}
                  </button>
                </div>
              </div>

              {batchResults ? (
                <div style={{ width: '100%', overflowX: 'auto', borderRadius: '6px', border: '1px solid #444', paddingBottom: '10px' }}>
                  <table style={{ borderCollapse: 'collapse', color: '#fff', fontSize: '0.65rem', whiteSpace: 'nowrap' }}>
                    {/* PRZYWRÓCONE NAGŁÓWKI Z NAZWAMI PLIKÓW */}
                    <thead>
                      <tr>
                        <th style={{ padding: '12px', borderBottom: '2px solid #555', borderRight: '2px solid #555', background: '#222', textAlign: 'left', minWidth: '180px', position: 'sticky', left: 0, zIndex: 2 }}>
                          Sygnał / Parametr
                        </th>
                        {batchResults.map((res: any, idx: number) => (
                          <th key={idx} style={{ padding: '12px', borderBottom: '2px solid #555', borderRight: '1px solid #333', background: '#1a1a1a', textAlign: 'center' }}>
                            {res.file_name.replace('.csv', '')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Wiersz: Label Manualny */}
                      <tr>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid #444', borderRight: '2px solid #555', background: '#1a1a1a', fontWeight: 'bold', position: 'sticky', left: 0, zIndex: 1 }}>
                          👤 Label Manualny
                        </td>
                        {batchResults.map((res: any, idx: number) => (
                          <td key={`man-${idx}`} style={{ padding: '10px 12px', borderBottom: '1px solid #444', borderRight: '1px solid #333', textAlign: 'center', color: res.manual_label === 'OK' ? '#4caf50' : res.manual_label === 'AWARIA' ? '#f44336' : '#aaa', background: '#111' }}>
                            {res.manual_label}
                          </td>
                        ))}
                      </tr>
                      {/* Wiersz: Label Auto */}
                      <tr>
                        <td style={{ padding: '10px 12px', borderBottom: '2px solid #555', borderRight: '2px solid #555', background: '#1a1a1a', fontWeight: 'bold', position: 'sticky', left: 0, zIndex: 1 }}>
                          🤖 Label Systemu
                        </td>
                        {batchResults.map((res: any, idx: number) => (
                          <td key={`auto-${idx}`} style={{ padding: '10px 12px', borderBottom: '2px solid #555', borderRight: '1px solid #333', textAlign: 'center', color: res.auto_label === 'OK' ? '#4caf50' : res.auto_label === 'AWARIA' ? '#f44336' : '#aaa', background: '#111' }}>
                            {res.auto_label}
                          </td>
                        ))}
                      </tr>

                      {/* Wiersze: Poszczególne Sygnały Z GRADIENTEM */}
                      {availableColumns.map((colName) => {
                        const activeThreshold = overrideConfig?.max_violation_threshold || diagnosis?.usedConfig?.max_violation_threshold || 5.0;
                        return (
                          <tr key={colName}>
                            <td style={{ padding: '8px 12px', borderBottom: '1px solid #333', borderRight: '2px solid #555', background: '#1a1a1a', position: 'sticky', left: 0, zIndex: 1 }}>
                              {colName}
                            </td>
                            {batchResults.map((res: any, idx: number) => {
                              const val = res.violation_percents[colName] || 0;
                              const isError = val >= activeThreshold;
                              
                              const ratio = Math.min(val / activeThreshold, 1.0);
                              const bgColor = val === 0 ? '#111' : `rgba(244, 67, 54, ${ratio * 0.8})`;

                              return (
                                <td key={`${colName}-${idx}`} style={{ padding: '8px 12px', borderBottom: '1px solid #333', borderRight: '1px solid #333', textAlign: 'center', color: isError ? '#fff' : '#e0e0e0', fontWeight: isError ? 'bold' : 'normal', background: bgColor }}>
                                  {val.toFixed(2)}%
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {/* --- WYKRES TRENDU (POD TABELĄ) --- */}
              {batchResults && batchResults.length > 0 && (
                <div style={{ marginTop: '30px', background: '#1a1a1a', padding: '15px', borderRadius: '6px', border: '1px solid #444' }}>
                  
                  {/* NOWOŚĆ: Dedykowany wybór trendu */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h4 style={{ color: '#ffeb3b', margin: 0 }}>📈 Trend degradacji</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ color: '#aaa', fontSize: '0.85rem' }}>Wyświetl dla:</span>
                      <select 
                        value={batchTrendSelection} 
                        onChange={e => setBatchTrendSelection(e.target.value)}
                        style={{ background: '#222', color: '#fff', border: '1px solid #555', padding: '6px', borderRadius: '4px', outline: 'none' }}
                      >
                        <option value="Ogólny">∑ Trend Ogólny </option>
                        {availableColumns.map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ height: '300px', width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={batchResults.map((res: any) => {
                          let wartosc = 0;
                          
                          // NOWOŚĆ: Matematyka dla trendu ogólnego (średnia z błędów > 0)
                          if (batchTrendSelection === 'Ogólny') {
                            const violationValues = Object.values(res.violation_percents || {}) as number[];
                            const nonZeroValues = violationValues.filter(v => typeof v === 'number' && v > 0);
                            wartosc = nonZeroValues.length > 0 
                              ? nonZeroValues.reduce((sum, val) => sum + val, 0) / nonZeroValues.length 
                              : 0;
                          } else {
                            // Konkretny sygnał
                            wartosc = res.violation_percents[batchTrendSelection] || 0;
                          }

                          return {
                            name: res.file_name.replace('przejazd_', 'P').replace('.csv', ''),
                            wartosc: parseFloat(wartosc.toFixed(2)),
                            limit: overrideConfig?.max_violation_threshold || diagnosis?.usedConfig?.max_violation_threshold || 5.0
                          };
                        })}
                        margin={{ top: 10, right: 30, left: 0, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="name" stroke="#888" angle={-45} textAnchor="end" height={60} fontSize={12} />
                        <YAxis stroke="#888" unit="%" />
                        <Tooltip contentStyle={{ backgroundColor: '#222', border: '1px solid #555' }} />
                        <Legend />
                        <ReferenceLine 
                          y={overrideConfig?.max_violation_threshold || diagnosis?.usedConfig?.max_violation_threshold || 5.0} 
                          label={{ position: 'top', value: 'Próg Awarii', fill: '#f44336', fontSize: 12 }} 
                          stroke="#f44336" 
                          strokeDasharray="3 3" 
                        />
                        <Line 
                          type="monotone" 
                          name={batchTrendSelection === 'Ogólny' ? 'Średni udział odchyłek (>0)' : `Odchylenia ${batchTrendSelection}`} 
                          dataKey="wartosc" 
                          stroke="#ff9800" 
                          strokeWidth={3} 
                          dot={{ r: 4, fill: '#ff9800' }} 
                          activeDot={{ r: 8 }} 
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          ) : viewMode === 'detailed' ? (
            <>
              {/* Sekcja wyboru sygnału i podsumowania błędów */}
              <div style={{ marginBottom: '1.5rem', background: '#222', padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ color: '#aaa', marginRight: '15px' }}>Sygnał do analizy szczegółowej:</span>
                  <select value={selectedColumn} onChange={(e) => setSelectedColumn(e.target.value)} style={{ padding: '5px 10px', borderRadius: '4px', background: '#333', color: 'white', border: '1px solid #555', cursor: 'pointer' }}>
                    {availableColumns.map(col => (<option key={col} value={col}>{col} {getUnit(col) ? `[${getUnit(col)}]` : ''}</option>))}
                  </select>
                </div>
                {(() => {
                  const failureThreshold = robotInfo?.config?.max_violation_threshold || 5.0;
                  const badgeColor = violationPercent === 0 ? '#4caf50' : violationPercent >= failureThreshold ? '#f44336' : '#ff9800';
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ color: '#aaa', fontSize: '0.9rem' }}>Udział błędów:</span>
                      <span style={{ background: badgeColor, color: '#fff', padding: '4px 10px', borderRadius: '4px', fontWeight: 'bold', fontSize: '1rem', transition: 'background 0.3s' }}>{violationPercent === 0 ? '0.00%' : `${violationPercent.toFixed(2)}%`}</span>
                    </div>
                  );
                })()}
              </div>

              {/* GÓRNY WYKRES: Porównanie z referencją */}
              <h3 style={{ color: '#fff', marginBottom: '0.5rem', borderBottom: '1px solid #444', paddingBottom: '5px' }}>Porównanie z referencją {unit ? `[${unit}]` : ''}</h3>
              <div style={{ height: '300px', background: '#111', padding: '1rem', borderRadius: '8px', border: '1px solid #333', marginBottom: '2.5rem', position: 'relative' }}>
                
                
                {showTimeMarker && (
                    <div 
                      ref={mainChartLineRef}
                      style={{
                          position: 'absolute', top: 15, bottom: 25, width: '2px', backgroundColor: '#9c27b0',
                          left: '90px', zIndex: 100, pointerEvents: 'none', transition: 'none'
                      }}
                    >
                      <div style={{ position: 'absolute', top: -15, left: -25, color: '#9c27b0', fontSize: '10px', fontWeight: 'bold', width: '60px', textAlign: 'center' }}>POZ. 3D</div>
                    </div>
                )}

                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={displayedData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }} onMouseDown={(e) => e && setRefAreaLeft(e.activeLabel as number)} onMouseMove={(e) => refAreaLeft && e && setRefAreaRight(e.activeLabel as number)} onMouseUp={handleZoom} style={{ userSelect: 'none', cursor: 'crosshair' }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="Time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => v.toFixed(1) + 's'} stroke="#888" hide />
                    
                    
                    <YAxis width={62} domain={['auto', 'auto']} stroke="#888" label={{ value: unit, angle: -90, position: 'insideLeft', fill: '#888' }} />
                    
                    <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#444' }} labelFormatter={(l) => `Czas: ${Number(l).toFixed(3)}s`} formatter={(v: any, name: any) => { if (Array.isArray(v)) return [`od ${v[0].toFixed(2)} do ${v[1].toFixed(2)} ${unit}`, name]; return [`${Number(v).toFixed(2)} ${unit}`, name]; }} />
                    <Legend verticalAlign="top" height={36} />
                    
                    {violationAreas?.map((area: any, idx: any) => (<ReferenceArea key={`violation-${idx}`} x1={area.start} x2={area.end} fill="#f44336" fillOpacity={0.25} strokeOpacity={0} />))}
                    <Line name="Górny limit" type="monotone" dataKey="UpperLimit" stroke="#9e9e9e" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                    <Line name="Dolny limit" type="monotone" dataKey="LowerLimit" stroke="#9e9e9e" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                    <Line name="Referencja" type="monotone" dataKey="Referencja" stroke="#4caf50" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line name="Badany" type="monotone" dataKey="Badany" stroke="#ffeb3b" strokeWidth={2} dot={false} isAnimationActive={false} />
                    
                    {refAreaLeft !== null && refAreaRight !== null && <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill="#e91e63" fillOpacity={0.3} />}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* POPUP: PARAMETRY SYGNAŁU */}
              {showParamsModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', zIndex: 3000, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  {/* ... pozostaw wnętrze modalu bez zmian ... */}
                  <div style={{ background: '#222', width: '600px', borderRadius: '12px', border: '1px solid #444', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
                      <div style={{ padding: '1rem 1.5rem', background: '#333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #444' }}>
                        <h3 style={{ margin: 0, color: '#2196f3' }}>📉 Statystyki sygnału: {selectedColumn}</h3>
                        <button onClick={() => setShowParamsModal(false)} style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '1.5rem' }}>✕</button>
                      </div>
                      <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <SignalStatsTable title="Sygnał Badany (Surowy)" stats={diagnosis?.statsData?.signalParams?.[selectedColumn]?.raw} unit={unit} color="#ffeb3b" />
                        <SignalStatsTable title="Różnica (Badany - Referencja)" stats={diagnosis?.statsData?.signalParams?.[selectedColumn]?.diff} unit={unit} color="#ff5722" />
                      </div>
                      <div style={{ padding: '1rem', textAlign: 'right', background: '#1a1a1a' }}>
                        <button onClick={() => setShowParamsModal(false)} style={{ padding: '8px 20px', background: '#444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Zamknij</button>
                      </div>
                    </div>
                </div>
              )}

              {/* DOLNY WYKRES: Różnica sygnałów */}
              <h3 style={{ color: '#ff5722', marginBottom: '0.5rem', borderBottom: '1px solid #444', paddingBottom: '5px' }}>Obliczona różnica sygnałów {unit ? `[${unit}]` : ''}</h3>
              <div style={{ height: '220px', background: '#111', padding: '1rem', borderRadius: '8px', border: '1px solid #333', position: 'relative' }}>
                
                {/* DIV Z NACZNIKIEM DLA DOLNEGO WYKRESU */}
                {showTimeMarker && (
                    <div 
                      ref={diffChartLineRef}
                      style={{
                          position: 'absolute', top: 15, bottom: 25, width: '2px', backgroundColor: '#9c27b0',
                          left: '90px', zIndex: 100, pointerEvents: 'none', transition: 'none'
                      }}
                    >
                      <div style={{ position: 'absolute', top: -15, left: -25, color: '#9c27b0', fontSize: '10px', fontWeight: 'bold', width: '60px', textAlign: 'center' }}>POZ. 3D</div>
                    </div>
                )}

                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={displayedData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }} onMouseDown={(e) => e && setRefAreaLeft(e.activeLabel as number)} onMouseMove={(e) => refAreaLeft && e && setRefAreaRight(e.activeLabel as number)} onMouseUp={handleZoom} style={{ userSelect: 'none', cursor: 'crosshair' }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="Time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => v.toFixed(1) + 's'} stroke="#888" label={{ value: 'Czas nagrania [s]', position: 'insideBottom', offset: -10, fill: '#aaa' }} />
                    
                    {/* KLUCZOWE: width={80} - sztywna szerokość osi Y */}
                    <YAxis width={62} domain={['auto', 'auto']} stroke="#888" label={{ value: unit, angle: -90, position: 'insideLeft', fill: '#888' }} />
                    
                    <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#444' }} labelFormatter={(l) => `Czas: ${Number(l).toFixed(3)}s`} formatter={(v: any) => [`${Number(v).toFixed(2)} ${unit}`, 'Δ Różnica']} />
                    {violationAreas?.map((area: any, idx: any) => (<ReferenceArea key={`diff-violation-${idx}`} x1={area.start} x2={area.end} fill="#f44336" fillOpacity={0.25} strokeOpacity={0} />))}
                    <Line name="Δ Odchylenie (Badany - Ref)" type="monotone" dataKey="Roznica" stroke="#ff5722" strokeWidth={2} dot={false} isAnimationActive={false} />
                    {refAreaLeft !== null && refAreaRight !== null && <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill="#e91e63" fillOpacity={0.3} />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '1rem' }}>
            
            {/* KOLUMNA 1: OSIE KĄTOWE (A) */}
            <div>
              <h4 style={{ color: '#00bcd4', textAlign: 'center', borderBottom: '1px solid #333', paddingBottom: '5px', marginTop: 0 }}>
                Osie Kątowe (A)
              </h4>
              {statsData?.aCols?.map((col: string) => (
                <MiniAnalizaChart 
                  key={col} 
                  title={col} 
                  unit="°" 
                  data={diagnosis?.chartData?.[col] || []} 
                  failureThreshold={robotInfo?.config?.max_violation_threshold || 5.0} 
                  showTimeMarker={showTimeMarker} 
                  violationAreas={diagnosis?.violationAreas?.[col]} 
                  violationPercent={diagnosis?.statsData?.violationPercents?.[col] || 0} 
                />
              ))}
            </div>

            {/* KOLUMNA 2: PRĄDY SILNIKÓW (Cur) */}
            <div>
              <h4 style={{ color: '#ffeb3b', textAlign: 'center', borderBottom: '1px solid #333', paddingBottom: '5px', marginTop: 0 }}>
                Prądy Silników (Cur)
              </h4>
              {statsData?.curCols?.map((col: string) => (
                <MiniAnalizaChart 
                  key={col} 
                  title={col} 
                  unit="%" 
                  data={diagnosis?.chartData?.[col] || []} 
                  failureThreshold={robotInfo?.config?.max_violation_threshold || 5.0} 
                  showTimeMarker={showTimeMarker} 
                  violationAreas={diagnosis?.violationAreas?.[col]} 
                  violationPercent={diagnosis?.statsData?.violationPercents?.[col] || 0} 
                />
              ))}
            </div>

          </div>
          )}
            </>
          )}
        </div>
      ) : ( <div style={{ marginTop: '2rem', padding: '3rem', border: '2px dashed #444', borderRadius: '8px', color: '#aaa', textAlign: 'center' }}>Wybierz robota...</div> )}
  
{/* ========================================================= */}
      {/* SEKCJA 3D: CYFROWY BLIŹNIAK */}
      {/* ========================================================= */}
      {displayedData.length > 0 && isFile && (
        <RobotPlayer3D 
          trajectory={trajectory}
          refTrajectory={refTrajectory}
          showGhost={showGhost}
          setShowGhost={setShowGhost}
          displayedData={displayedData}
          testData={testData}
          playbackIndex={playbackIndex}
          setPlaybackIndex={setPlaybackIndex}
          handleLiveScrub={handleLiveScrub}
          isTrajectoryLoading={isTrajectoryLoading}
        />
      )}
    </div> // Zamknięcie głównego diva AnalizaPrzebiegow
  );
};