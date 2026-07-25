// PodgladDanych.tsx
import { useState, useEffect, useRef, Fragment } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea } from 'recharts';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { COLORS, getUnit } from './utils';

// --- PROFESJONALNY MODEL WIZUALNY ROBOTA ---
const ImprovedRobot = ({ points }: { points: number[][] }) => {
  if (!points || points.length !== 7) return null;
  
  const Segment = ({ p1, p2, isLast }: { p1: number[], p2: number[], isLast?: boolean }) => {
    const v1 = new THREE.Vector3(p1[0], p1[1], p1[2]);
    const v2 = new THREE.Vector3(p2[0], p2[1], p2[2]);
    const distance = v1.distanceTo(v2);
    if (distance < 0.001) return null;
    const position = v2.clone().add(v1).divideScalar(2);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v2.clone().sub(v1).normalize());
    
    return (
      <mesh position={position} quaternion={quaternion} castShadow receiveShadow>
        <cylinderGeometry args={[0.035, 0.045, distance, 32]} />
        <meshStandardMaterial color="#FF8C00" metalness={0.4} roughness={0.4} />
      </mesh>
    );
  };

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {/* Podstawa robota (Baza) */}
      <mesh position={[0, 0, -0.05]} rotation={[Math.PI / 2, 0, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[0.15, 0.18, 0.1, 32]} />
        <meshStandardMaterial color="#222" metalness={0.8} roughness={0.2} />
      </mesh>
      
      {/* Przeguby i ramiona */}
      {points.map((p, i) => (
        <Fragment key={i}>
          {/* Kulisty przegub silnika - Poprawione argumenty dla Three.js */}
          <mesh position={[p[0], p[1], p[2]]} castShadow receiveShadow>
            <sphereGeometry args={[0.055, 32, 32]} />
            <meshStandardMaterial color="#333" metalness={0.7} roughness={0.2} />
          </mesh>
          {i < 6 && <Segment p1={p} p2={points[i + 1]} isLast={i === 5} />}
        </Fragment>
      ))}
      
      {/* Chwytak (End-effector) na końcu ostatniej osi */}
      {(() => {
        const p = points[6];
        const prev = points[5];
        const v1 = new THREE.Vector3(prev[0], prev[1], prev[2]);
        const v2 = new THREE.Vector3(p[0], p[1], p[2]);
        const dir = v2.clone().sub(v1).normalize();
        const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        
        return (
          <group position={[p[0], p[1], p[2]]} quaternion={quaternion}>
            <mesh position={[0, 0.02, 0]} castShadow>
              <boxGeometry args={[0.08, 0.04, 0.04]} />
              <meshStandardMaterial color="#555" metalness={0.8} roughness={0.2} />
            </mesh>
            <mesh position={[-0.03, 0.06, 0]} castShadow>
              <boxGeometry args={[0.015, 0.08, 0.03]} />
              <meshStandardMaterial color="#bbb" metalness={0.9} roughness={0.1} />
            </mesh>
            <mesh position={[0.03, 0.06, 0]} castShadow>
              <boxGeometry args={[0.015, 0.08, 0.03]} />
              <meshStandardMaterial color="#bbb" metalness={0.9} roughness={0.1} />
            </mesh>
          </group>
        );
      })()}
    </group>
  );
};

// --- ODTWARZACZ 3D PRZYSTOSOWANY DO PODGLĄDU DANYCH ---
const RobotPlayer3D = ({ trajectory, displayedData, playbackIndex, setPlaybackIndex, handleLiveScrub, isTrajectoryLoading }: any) => {
  const [localIndex, setLocalIndex] = useState(playbackIndex || 0);
  const [isDocked, setIsDocked] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(isPlaying);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const speedRef = useRef(playbackSpeed);
  const [dockWidth, setDockWidth] = useState(450); 
  const [dockHeight, setDockHeight] = useState(280);

  useEffect(() => { setLocalIndex(playbackIndex); }, [playbackIndex]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { speedRef.current = playbackSpeed; }, [playbackSpeed]);

  useEffect(() => {
    let frameId: number;
    let lastTime = performance.now();
    let currentIndex = localIndex;
    let virtualTime = displayedData[currentIndex]?.Time || 0; 

    const loop = (time: number) => {
      if (!isPlayingRef.current) return;
      const deltaSec = (time - lastTime) / 1000.0;
      lastTime = time;
      if (!displayedData || displayedData.length === 0) return;
      virtualTime += deltaSec * speedRef.current;
      let nextIndex = currentIndex;
      
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
      virtualTime = displayedData[currentIndex]?.Time || 0; 
      frameId = requestAnimationFrame(loop);
    }
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, displayedData]); 

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault(); 
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = dockWidth;
    const startH = dockHeight;
    const onMouseMove = (eMove: MouseEvent) => {
      setDockWidth(Math.max(300, Math.min(startW + (startX - eMove.clientX), 1200)));
      setDockHeight(Math.max(200, Math.min(startH + (startY - eMove.clientY), 800)));
    };
    const onMouseUp = () => { document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp); document.body.style.cursor = 'default'; };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'nwse-resize'; 
  };

  return (
    <div style={{ 
      marginTop: isDocked ? '0' : '1.5rem', padding: '1rem', 
      background: isDocked ? 'rgba(25, 25, 25, 0.98)' : '#141414', backdropFilter: isDocked ? 'blur(12px)' : 'none',
      borderRadius: '8px', border: isDocked ? '2px solid #2196f3' : '1px solid #2a2a2a', 
      position: isDocked ? 'fixed' : 'relative', bottom: isDocked ? '20px' : 'auto', right: isDocked ? '20px' : 'auto',
      width: isDocked ? `${dockWidth}px` : 'auto', zIndex: isDocked ? 2000 : 1,
      boxShadow: isDocked ? '0 20px 50px rgba(0,0,0,0.9)' : 'none',
      transition: isDocked ? 'none' : 'all 0.3s ease-in-out'
    }}>
      {isDocked && <div onMouseDown={startResize} style={{ position: 'absolute', top: 0, left: 0, width: '25px', height: '25px', cursor: 'nwse-resize', zIndex: 10, borderTopLeftRadius: '6px', background: 'linear-gradient(135deg, rgba(33,150,243,0.8) 0%, rgba(33,150,243,0.8) 30%, transparent 30%)' }} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', paddingLeft: isDocked ? '15px' : '0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button 
            onClick={() => {
              if (!isPlaying && localIndex >= displayedData.length - 1) { setLocalIndex(0); setPlaybackIndex(0); if (handleLiveScrub) handleLiveScrub(0); }
              if (isPlaying) setPlaybackIndex(localIndex); 
              setIsPlaying(!isPlaying);
            }}
            style={{ background: isPlaying ? '#ff9800' : '#4caf50', color: 'white', border: 'none', borderRadius: '4px', padding: '4px 12px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold' }}
          >
            {isPlaying ? '⏸ Pauza' : '▶ Odtwórz przejazd'}
          </button>
          <select 
            value={playbackSpeed} onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
            style={{ background: '#222', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '3px 8px', fontSize: '0.8rem', cursor: 'pointer', outline: 'none' }}
          >
            <option value={0.25}>0.25x</option><option value={0.5}>0.5x</option><option value={1.0}>1.0x</option><option value={2.0}>2.0x</option><option value={5.0}>5.0x</option>
          </select>
          <button 
            onClick={() => setIsDocked(!isDocked)}
            style={{ background: isDocked ? '#e91e63' : '#333', color: 'white', border: isDocked ? 'none' : '1px solid #555', borderRadius: '4px', padding: '4px 10px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold', marginLeft: '10px' }}
          >
            {isDocked ? '🔓 Odepnij do okna' : '📌 Przypnij (Mini-Player)'}
          </button>
        </div>
        <span style={{ color: '#aaa', background: '#222', padding: '3px 10px', borderRadius: '4px', fontSize: '0.8rem', border: '1px solid #444' }}>
          T: <strong>{displayedData[localIndex]?.Time?.toFixed(3) || 0} s</strong>
        </span>
      </div>

      <input 
        type="range" min={0} max={Math.max(displayedData.length - 1, 0)} value={localIndex} 
        onChange={(e) => { const newIdx = Number(e.target.value); setLocalIndex(newIdx); if (handleLiveScrub) handleLiveScrub(newIdx); }}
        onMouseUp={() => setPlaybackIndex(localIndex)} 
        onMouseDown={() => { setIsPlaying(false); setPlaybackIndex(localIndex); }} 
        style={{ width: '100%', marginBottom: '10px', cursor: 'pointer', accentColor: '#2196f3' }} 
      />

      <div style={{ height: isDocked ? `${dockHeight}px` : '400px', background: '#0a0a0a', borderRadius: '6px', border: '1px solid #2a2a2a', overflow: 'hidden', position: 'relative' }}>
        {isTrajectoryLoading ? (
          <div style={{ padding: '1rem', color: '#2196f3', textAlign: 'center', marginTop: isDocked ? '20%' : '150px' }}>⏳ Obliczanie macierzy kinematyki dla 3D...</div>
        ) : (
          <Canvas camera={{ position: [2, 1.5, 2], fov: 45 }} shadows={{ type: THREE.PCFShadowMap }}>
            <color attach="background" args={['#0f0f0f']} />
            <ambientLight intensity={0.6} />
            <directionalLight position={[5, 10, 5]} intensity={1.5} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
            <Grid infiniteGrid fadeDistance={8} sectionColor="#444" cellColor="#222" />
            {trajectory && trajectory.length > 0 && <ImprovedRobot points={trajectory[localIndex]} />}
            <OrbitControls makeDefault />
          </Canvas>
        )}
      </div>
    </div>
  );
};


export const PodgladDanych = ({ selectedFilePath }: { selectedFilePath: string | null }) => {
  const [fileInfo, setFileInfo] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeColumns, setActiveColumns] = useState<string[]>([]);
  
  const [refAreaLeft, setRefAreaLeft] = useState<number | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<number | null>(null);
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);

  // --- STANY 3D ---
  const [trajectory, setTrajectory] = useState<any[]>([]);
  const [isTrajectoryLoading, setIsTrajectoryLoading] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState<number>(0);
  const chartLineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedFilePath) {
      setFileInfo(null); setChartData([]); setActiveColumns([]); setZoomRange(null); setTrajectory([]);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const infoRes = await fetch('http://127.0.0.1:8000/api/file-info', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: selectedFilePath })
        });
        
        if (infoRes.ok) {
          const infoData = await infoRes.json();
          setFileInfo(infoData);
          
          const dataColumns = infoData.columns.filter((c: string) => c !== 'Time' && c !== 'Label');
          if (dataColumns.length > 0) setActiveColumns([dataColumns[0]]);

          if (infoData.is_valid) {
            const dataRes = await fetch('http://127.0.0.1:8000/api/file-data', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: selectedFilePath })
            });
            if (dataRes.ok) {
              setChartData(await dataRes.json());
              setZoomRange(null);
            }

            // Pobieranie kinematyki dla robota 3D
            setIsTrajectoryLoading(true);
            try {
              const kinRes = await fetch('http://127.0.0.1:8000/api/kinematics', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: selectedFilePath })
              });
              if (kinRes.ok) {
                const kinData = await kinRes.json();
                if (kinData.trajectory) setTrajectory(kinData.trajectory);
              }
            } catch (e) { console.error(e); } finally { setIsTrajectoryLoading(false); }
          }
        }
      } catch (error) { console.error("Błąd:", error); } finally { setIsLoading(false); }
    };
    fetchData();
  }, [selectedFilePath]);

  const toggleColumn = (colName: string) => setActiveColumns(prev => prev.includes(colName) ? prev.filter(c => c !== colName) : [...prev, colName]);

  const handleZoom = () => {
    if (refAreaLeft === refAreaRight || refAreaLeft === null || refAreaRight === null) {
      setRefAreaLeft(null); setRefAreaRight(null); return;
    }
    let [left, right] = [refAreaLeft, refAreaRight];
    if (left > right) [left, right] = [right, left];
    setZoomRange([left, right]);
    setRefAreaLeft(null); setRefAreaRight(null);
  };

  const displayedData = zoomRange ? chartData.filter(d => d.Time >= zoomRange[0] && d.Time <= zoomRange[1]) : chartData;
  const singleUnit = activeColumns.length === 1 && activeColumns[0] !== 'Label' ? getUnit(activeColumns[0]) : '';

  // --- ZMIANA: IDEALNA SYNCHRONIZACJA (Taka jak w Analizie Przebiegów) ---
  const handleLiveScrub = (index: number) => {
    if (!displayedData || displayedData.length < 2) return;
    const percent = index / (displayedData.length - 1);
    
    // Używamy tych samych proporcji co w module Analizy Przebiegów, 
    // gdzie wyliczona matematyka zgrywa się idealnie z szerokością osi.
    const cssCalc = `calc(90px + (100% - 120px) * ${percent})`;
    if (chartLineRef.current) chartLineRef.current.style.left = cssCalc;
  };

  const MetricCard = ({ title, value, valueColor = '#fff' }: { title: string, value: React.ReactNode, valueColor?: string }) => (
    <div style={{ background: '#1a1a1a', padding: '16px', borderRadius: '8px', border: '1px solid #2a2a2a', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <span style={{ color: '#777', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold' }}>{title}</span>
      <span style={{ color: valueColor, fontSize: '1.25rem', fontWeight: '600' }}>{value}</span>
    </div>
  );

  return (
    <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#2196f3', margin: '0 0 8px 0', fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          📊 Eksplorator Danych 3D
        </h2>
        <p style={{ color: '#888', margin: 0, fontSize: '0.9rem' }}>
          {selectedFilePath ? `Podgląd i weryfikacja wizualna pliku: ${selectedFilePath.split('/').pop()}` : 'Wybierz plik z drzewa, aby wyświetlić metryki i wizualizację przestrzenią.'}
        </p>
      </div>
      
      {selectedFilePath ? (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          {isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#666', border: '1px dashed #333', borderRadius: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '30px', height: '30px', border: '3px solid #333', borderTopColor: '#2196f3', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <p>Ładowanie struktury pliku...</p>
                <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
              </div>
            </div>
          ) : fileInfo && fileInfo.is_valid ? (
            <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                <MetricCard title="Format pliku" value="Poprawny CSV" valueColor="#4caf50" />
                <MetricCard title="Liczba próbek" value={fileInfo.rows_count.toLocaleString('pl-PL')} />
                <MetricCard title="Data modyfikacji" value={fileInfo.record_date} />
                <MetricCard title="Czas nagrania" value={fileInfo.duration !== null ? `${fileInfo.duration.toFixed(2)} s` : 'Brak danych'} valueColor="#00bcd4" />
              </div>

              {/* NOWY BLOK: WYŚWIETLANIE TEMPERATUR */}
              {fileInfo.temperatures && Object.keys(fileInfo.temperatures).length > 0 && (
                <div style={{ background: '#111', borderRadius: '8px', border: '1px solid #2a2a2a', padding: '12px 16px', marginBottom: '20px' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#ff9800', fontSize: '0.85rem' }}>🌡️ Temperatury silników (z preambuły)</h4>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {Object.entries(fileInfo.temperatures).map(([axis, temp]) => (
                      <span key={axis} style={{ background: '#1a1a1a', border: '1px solid #333', color: '#ddd', fontSize: '0.75rem', padding: '4px 10px', borderRadius: '4px' }}>
                        {axis}: <strong style={{color: '#ff9800'}}>{String(temp)}°C</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ background: '#141414', borderRadius: '8px', border: '1px solid #2a2a2a', padding: '16px', marginBottom: '20px' }}>
                <span style={{ color: '#888', fontSize: '0.8rem', display: 'block', marginBottom: '12px', fontWeight: 'bold' }}>AKTYWNE SYGNAŁY (WARSTWY WYKRESU):</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {fileInfo.columns.filter((c: string) => c !== 'Time').map((col: string, idx: number) => {
                      const isSelected = activeColumns.includes(col);
                      const colColor = col === 'Label' ? '#ffeb3b' : COLORS[idx % COLORS.length];
                      return (
                        <div 
                          key={col} 
                          onClick={() => toggleColumn(col)} 
                          style={{ 
                            display: 'flex', alignItems: 'center', gap: '6px', background: isSelected ? `${colColor}15` : 'transparent', 
                            padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', border: `1px solid ${isSelected ? colColor : '#333'}`, 
                            transition: 'all 0.15s ease', color: isSelected ? '#fff' : '#666', fontSize: '0.85rem'
                          }}
                        >
                          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isSelected ? colColor : '#333' }} />
                          {col} {getUnit(col) && <span style={{ opacity: 0.6 }}>[{getUnit(col)}]</span>}
                        </div>
                      );
                  })}
                </div>
              </div>

              {chartData.length > 0 && (
                // ZMIANA: Skopiowano padding kontenera z Analizy Przebiegów ('1rem' zamiast '20px 15px')
                <div style={{ flex: 1, minHeight: '400px', background: '#141414', padding: '1rem', borderRadius: '8px', border: '1px solid #2a2a2a', position: 'relative', display: 'flex', flexDirection: 'column' }}>
                  
                  {/* ZMIANA: Pasek synchronizacji startuje sztywno z left: 90px */}
                  <div 
                    ref={chartLineRef}
                    style={{
                        position: 'absolute', top: 20, bottom: 20, width: '2px', backgroundColor: '#2196f3',
                        left: '90px', zIndex: 100, pointerEvents: 'none', transition: 'none', boxShadow: '0 0 8px rgba(33,150,243,0.8)'
                    }}
                  >
                    <div style={{ position: 'absolute', top: -15, left: -14, color: '#2196f3', fontSize: '10px', fontWeight: 'bold' }}>POZ. 3D</div>
                  </div>

                  <div style={{ position: 'absolute', top: '12px', right: '20px', zIndex: 10, display: 'flex', gap: '10px' }}>
                    {zoomRange && (
                      <button 
                        onClick={() => setZoomRange(null)} 
                        style={{ padding: '6px 12px', background: 'rgba(233, 30, 99, 0.15)', color: '#e91e63', border: '1px solid rgba(233, 30, 99, 0.4)', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', backdropFilter: 'blur(4px)', transition: 'all 0.2s' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(233, 30, 99, 0.25)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(233, 30, 99, 0.15)' }}
                      >
                        ✕ Zakończ przybliżenie
                      </button>
                    )}
                  </div>

                  <ResponsiveContainer width="100%" height="100%">
                    {/* ZMIANA: Skopiowano idealne marginesy wykresu z Analizy Przebiegów */}
                    <LineChart data={displayedData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }} onMouseDown={(e) => e && setRefAreaLeft(e.activeLabel as number)} onMouseMove={(e) => refAreaLeft && e && setRefAreaRight(e.activeLabel as number)} onMouseUp={handleZoom} style={{ userSelect: 'none', cursor: 'crosshair' }}>
                      <CartesianGrid strokeDasharray="2 2" stroke="#222" vertical={false} />
                      <XAxis dataKey="Time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(val) => val.toFixed(1) + 's'} stroke="#555" tick={{ fontSize: 12 }} minTickGap={30} />
                      
                      {/* ZMIANA: Zablokowano szerokość osi Y na 62px */}
                      <YAxis width={62} domain={['auto', 'auto']} stroke="#555" tick={{ fontSize: 12 }} label={{ value: singleUnit, angle: -90, position: 'insideLeft', fill: '#555', fontSize: 12 }} />
                      
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'rgba(20, 20, 20, 0.95)', borderColor: '#333', borderRadius: '6px', backdropFilter: 'blur(8px)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }} 
                        itemStyle={{ fontWeight: '600', fontSize: '0.85rem' }} 
                        labelStyle={{ color: '#888', marginBottom: '6px', fontSize: '0.8rem' }}
                        labelFormatter={(label) => `Sekunda nagrania: ${Number(label).toFixed(3)}s`} 
                        formatter={(value: any, name: any) => { const unit = getUnit(String(name)); return [`${Number(value).toFixed(4)}${unit ? ' ' + unit : ''}`, name]; }} 
                      />
                      
                      <Legend verticalAlign="top" height={40} wrapperStyle={{ fontSize: '0.85rem', color: '#888' }} iconType="circle" iconSize={8} />
                      
                      {fileInfo.columns.filter((c: string) => c !== 'Time').map((col: string, idx: number) => {
                          const isSelected = activeColumns.includes(col);
                          const isLabel = col === 'Label';
                          if (!isSelected) return null;
                          return (
                            <Line 
                              key={col} type={isLabel ? "stepAfter" : "monotone"} dataKey={col} 
                              stroke={isLabel ? "#ffeb3b" : COLORS[idx % COLORS.length]} 
                              strokeWidth={isLabel ? 3 : 2} dot={false} isAnimationActive={false} name={isLabel ? "Label (Status)" : col} 
                            />
                          );
                      })}
                      
                      {refAreaLeft !== null && refAreaRight !== null && <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0} fill="#2196f3" fillOpacity={0.2} />}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* SEKCJA 3D DO PODGLĄDU TRAJEKTORII */}
              {displayedData.length > 0 && (
                <RobotPlayer3D 
                  trajectory={trajectory}
                  displayedData={displayedData}
                  playbackIndex={playbackIndex}
                  setPlaybackIndex={setPlaybackIndex}
                  handleLiveScrub={handleLiveScrub}
                  isTrajectoryLoading={isTrajectoryLoading}
                />
              )}
            </>
          ) : (
            <div style={{ background: 'rgba(244, 67, 54, 0.1)', border: '1px solid rgba(244, 67, 54, 0.3)', padding: '20px', borderRadius: '8px', color: '#f44336' }}>
              <h4 style={{ margin: '0 0 10px 0' }}>Błąd odczytu pliku</h4>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>{fileInfo?.error_msg}</p>
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #2a2a2a', borderRadius: '12px', backgroundColor: '#141414', minHeight: '60vh' }}>
          <div style={{ background: '#1e1e1e', padding: '20px', borderRadius: '50%', marginBottom: '20px' }}>
            <span style={{ fontSize: '2.5rem', filter: 'grayscale(100%)', opacity: 0.5 }}>📈</span>
          </div>
          <h3 style={{ color: '#aaa', margin: '0 0 10px 0' }}>Brak wybranych danych</h3>
          <p style={{ color: '#666', margin: 0, fontSize: '0.95rem', maxWidth: '300px', textAlign: 'center', lineHeight: '1.5' }}>
            Rozwiń strukturę robota w lewym panelu i wybierz plik <code style={{ background: '#222', padding: '2px 6px', borderRadius: '4px', color: '#888' }}>.csv</code>, aby rozpocząć eksplorację przebiegu.
          </p>
        </div>
      )}
    </div>
  );
};