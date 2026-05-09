// AnalizaPrzebiegow.tsx
import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { LineChart, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea } from 'recharts';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { getUnit, getErrorColor } from './utils';

type Metric = 'MAE' | 'IAE' | 'ISE';
const METRICS: Metric[] = ['MAE', 'IAE', 'ISE'];

const MiniAnalizaChart = ({ title, data, unit, failureThreshold, showTimeMarker }: any) => {
  const { areas: violationAreas, violationPercent } = useMemo(() => {
    if (!data || data.length === 0) return { areas: [], violationPercent: 0 };
    const areas: { start: number, end: number }[] = [];
    let violationStart: number | null = null;
    let violationCount = 0;
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const isOut = d.Badany !== null && d.UpperLimit !== null && d.LowerLimit !== null && (d.Badany > d.UpperLimit || d.Badany < d.LowerLimit);
      if (isOut) { violationCount++; if (violationStart === null) violationStart = d.Time; } 
      else if (!isOut && violationStart !== null) { areas.push({ start: violationStart, end: d.Time }); violationStart = null; }
    }
    if (violationStart !== null) areas.push({ start: violationStart, end: data[data.length - 1].Time });
    return { areas, violationPercent: (violationCount / data.length) * 100 };
  }, [data]);
  
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
      
      {/* Dodaliśmy position: 'relative' */}
      <div style={{ height: '120px', position: 'relative' }}>
        
        {/* NASZA SUPERSZYBKA LINIA DLA MINI WYKRESU */}
        {showTimeMarker && (
          <div 
            className="mini-sync-line" // Używamy klasy zamiast Refa!
            style={{ 
              position: 'absolute', top: 5, bottom: 5, width: '2px', backgroundColor: '#9c27b0', 
              left: '5px', zIndex: 100, pointerEvents: 'none', transition: 'none' 
            }} 
          />
        )}

        <ResponsiveContainer width="100%" height="100%">
          {/* Usztywniliśmy marginesy na 5px */}
          <ComposedChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="2 2" stroke="#222" vertical={false} />
            <XAxis dataKey="Time" hide />
            <YAxis domain={['auto', 'auto']} hide />
            <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', fontSize: '10px', borderColor: '#444' }} formatter={(v: any) => [Number(v).toFixed(2), '']} />
            {violationAreas.map((area, idx) => <ReferenceArea key={`violation-${idx}`} x1={area.start} x2={area.end} fill="#f44336" fillOpacity={0.25} strokeOpacity={0} />)}
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
const PrecalculatedRobot = ({ points }: { points: number[][] }) => {
  if (!points || points.length !== 7) return null;
  const Segment = ({ p1, p2, color }: { p1: number[], p2: number[], color: string }) => {
    const v1 = new THREE.Vector3(p1[0], p1[1], p1[2]);
    const v2 = new THREE.Vector3(p2[0], p2[1], p2[2]);
    const distance = v1.distanceTo(v2);
    if (distance < 0.001) return null;
    const position = v2.clone().add(v1).divideScalar(2);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v2.clone().sub(v1).normalize());
    return (
      <mesh position={position} quaternion={quaternion}>
        <cylinderGeometry args={[0.03, 0.03, distance, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>
    );
  };
  const colors = ['#555', '#2196f3', '#4caf50', '#ff9800', '#e91e63', '#9c27b0'];
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {points.map((p, i) => (
        <Fragment key={i}>
          <mesh position={[p[0], p[1], p[2]]}><sphereGeometry args={[0.04]} /><meshStandardMaterial color="#ffeb3b" /></mesh>
          {i < 6 && <Segment p1={p} p2={points[i + 1]} color={colors[i]} />}
        </Fragment>
      ))}
    </group>
  );
};

// --- ODTWARZACZ 3D Z PRZECIĄGANYM NAROŻNIKIEM (DRAG TO RESIZE) ---
const RobotPlayer3D = ({ trajectory, displayedData, testData, playbackIndex, setPlaybackIndex, handleLiveScrub, isTrajectoryLoading }: any) => {
  const [localIndex, setLocalIndex] = useState(playbackIndex || 0);
  const [isDocked, setIsDocked] = useState(false);

  // Wymiary okna w trybie przypiętym
  const [dockWidth, setDockWidth] = useState(450); 
  const [dockHeight, setDockHeight] = useState(280);

  useEffect(() => {
    setLocalIndex(playbackIndex);
  }, [playbackIndex]);

  const currentTime = displayedData[localIndex]?.Time;
  const absoluteIndex = testData.findIndex((d: any) => d.Time === currentTime);
  const actualIndex = absoluteIndex !== -1 ? absoluteIndex : localIndex;

  // FUNKCJA OBSŁUGUJĄCA ZMIANĘ ROZMIARU OKNA (DRAG & DROP)
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault(); // Zapobiega zaznaczaniu tekstu podczas ciągnięcia
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = dockWidth;
    const startH = dockHeight;

    const onMouseMove = (eMove: MouseEvent) => {
      // Okno jest przypięte do prawego dołu. 
      // Ruch w lewo (mniejszy X) ZWIĘKSZA szerokość. Ruch w górę (mniejszy Y) ZWIĘKSZA wysokość.
      const newW = startW + (startX - eMove.clientX);
      const newH = startH + (startY - eMove.clientY);

      // Limity rozmiarów okna (min 300x200, max 1200x800)
      setDockWidth(Math.max(300, Math.min(newW, 1200)));
      setDockHeight(Math.max(200, Math.min(newH, 800)));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'default'; // Reset kursora
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'nwse-resize'; // Utrzymuje kursor zmiany rozmiaru wszędzie
  };

  return (
    <div style={{ 
      marginTop: isDocked ? '0' : '3rem', 
      padding: '1rem', 
      background: isDocked ? 'rgba(25, 25, 25, 0.98)' : '#222', 
      backdropFilter: isDocked ? 'blur(12px)' : 'none',
      borderRadius: '8px', 
      border: isDocked ? '2px solid #9c27b0' : '1px solid #333', 
      
      // Dynamiczna pozycja i szerokość
      position: isDocked ? 'fixed' : 'relative',
      bottom: isDocked ? '20px' : 'auto', 
      right: isDocked ? '20px' : 'auto',
      width: isDocked ? `${dockWidth}px` : 'auto',
      
      zIndex: isDocked ? 2000 : 1,
      boxShadow: isDocked ? '0 20px 50px rgba(0,0,0,0.9)' : 'none',
      // Płynne wejście w tryb dock, ale brak animacji podczas zmiany rozmiaru (żeby kursor nie uciekał)
      transition: isDocked ? 'none' : 'all 0.3s ease-in-out'
    }}>
      
      {/* NAROŻNIK DO ZMIANY ROZMIARU (Pojawia się tylko gdy przypięto) */}
      {isDocked && (
        <div 
          onMouseDown={startResize}
          title="Złap i przeciągnij, aby zmienić rozmiar"
          style={{
            position: 'absolute',
            top: 0, 
            left: 0,
            width: '25px', 
            height: '25px',
            cursor: 'nwse-resize',
            zIndex: 10,
            borderTopLeftRadius: '6px',
            // Rysuje dyskretny fioletowy trójkącik w lewym górnym rogu
            background: 'linear-gradient(135deg, rgba(156,39,176,0.8) 0%, rgba(156,39,176,0.8) 30%, transparent 30%)'
          }}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', paddingLeft: isDocked ? '15px' : '0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <h3 style={{ color: '#9c27b0', margin: 0, fontSize: isDocked ? '1rem' : '1.17em' }}>🤖 Bliźniak 3D</h3>
          <button 
            onClick={() => setIsDocked(!isDocked)}
            style={{
              background: isDocked ? '#e91e63' : '#444', color: 'white', 
              border: 'none', borderRadius: '4px', padding: '4px 10px', 
              fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold'
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
        type="range" 
        min={0} 
        max={Math.max(displayedData.length - 1, 0)} 
        value={localIndex} 
        onChange={(e) => {
            const newIdx = Number(e.target.value);
            setLocalIndex(newIdx); 
            if (handleLiveScrub) handleLiveScrub(newIdx); 
        }}
        onMouseUp={() => setPlaybackIndex(localIndex)} 
        style={{ width: '100%', marginBottom: '10px', cursor: 'pointer' }} 
      />

      <div style={{ 
        height: isDocked ? `${dockHeight}px` : '500px', // Zależne od stanu drag & drop
        background: '#111', borderRadius: '6px', border: '1px solid #444', overflow: 'hidden', position: 'relative'
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
            <OrbitControls makeDefault />
          </Canvas>
        )}
      </div>
    </div>
  );
};

export const AnalizaPrzebiegow = ({ selectedFilePath }: { selectedFilePath: string | null }) => {
  const [robotInfo, setRobotInfo] = useState<any>(null);
  const [refData, setRefData] = useState<any[]>([]);
  const [testData, setTestData] = useState<any[]>([]);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [selectedColumn, setSelectedColumn] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'detailed' | 'overview'>('detailed');
  const [refAreaLeft, setRefAreaLeft] = useState<number | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<number | null>(null);
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);
  const [playbackIndex, setPlaybackIndex] = useState<number>(0);
  const [trajectory, setTrajectory] = useState<any[]>([]);
  const [isTrajectoryLoading, setIsTrajectoryLoading] = useState(false);
  const robotName = selectedFilePath ? selectedFilePath.split(/[/\\]/)[1] : '';
  const isFile = selectedFilePath ? selectedFilePath.endsWith('.csv') : false;
  const [showTimeMarker, setShowTimeMarker] = useState<boolean>(true);
  const mainChartLineRef = useRef<HTMLDivElement>(null);
  const diffChartLineRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!robotName) return;
    const fetchRef = async () => {
      setIsLoading(true);
      try {
        const resInfo = await fetch('http://127.0.0.1:8000/api/robot-info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ robot_name: robotName }) });
        if (resInfo.ok) {
          const info = await resInfo.json();
          setRobotInfo(info);
          if (info.ref_file_info) {
            const refPath = `Roboty/${robotName}/Przebieg_referencyjny/${info.ref_file_info.name}`;
            const resData = await fetch('http://127.0.0.1:8000/api/file-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: refPath }) });
            if (resData.ok) {
              const data = await resData.json();
              setRefData(data);
              if (data.length > 0) {
                 const cols = Object.keys(data[0]).filter(c => c !== 'Time' && c !== 'Label');
                 setAvailableColumns(cols);
                 if (!selectedColumn) setSelectedColumn(cols[0]);
              }
            }
          } else { setRefData([]); }
        }
      } catch (e) { console.error(e); }
      setIsLoading(false);
    };
    fetchRef();
  }, [robotName]);

  useEffect(() => {
    if (!isFile || !selectedFilePath) { setTestData([]); return; }
    const fetchTest = async () => {
      try {
        const resData = await fetch('http://127.0.0.1:8000/api/file-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: selectedFilePath }) });
        if (resData.ok) { setTestData(await resData.json()); setZoomRange(null); }
      } catch (e) { console.error(e); }
    };
    fetchTest();
  }, [selectedFilePath, isFile]);

  useEffect(() => {
    if (!selectedFilePath) return;
    const fetchKinematics = async () => {
      setIsTrajectoryLoading(true);
      try {
        const res = await fetch('http://127.0.0.1:8000/api/kinematics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: selectedFilePath }) });
        if (res.ok) {
          const data = await res.json();
          if (data.trajectory) setTrajectory(data.trajectory);
        }
      } catch (e) { console.error(e); }
      setIsTrajectoryLoading(false);
    };
    fetchKinematics();
  }, [selectedFilePath]);

  const prepareColumnData = (colName: string) => {
    if (!colName || refData.length === 0 || testData.length === 0) return [];
    const maxLen = Math.max(refData.length, testData.length);
    const config = robotInfo?.config || {};
    const isA = colName.startsWith('A');
    const devThr = isA ? (config.a_deviation_threshold || 0) : (config.cur_deviation_threshold || 0);
    const offThr = isA ? (config.a_offset_threshold || 0) : (config.cur_offset_threshold || 0);
    const deadbandThr = isA ? (config.a_deadband_threshold || 0.05) : (config.cur_deadband_threshold || 0.5);
    const diagType = config.diagnosis_type || 'Odchylenia';
    const windowSize = 5; 
    const result = [];
    for(let i = 0; i < maxLen; i++) {
       const r = refData[i] || {};
       const t = testData[i] || {};
       const time = r.Time !== undefined ? r.Time : (t.Time !== undefined ? t.Time : i);
       const rVal = r[colName] ?? null;
       const tVal = t[colName] ?? null;
       let upper = null; let lower = null;
       if (rVal !== null) {
         let margin = offThr;
         if (diagType === 'Odchylenia') {
           let localMax = 0;
           for (let j = Math.max(0, i - windowSize); j <= Math.min(refData.length - 1, i + windowSize); j++) {
             localMax = Math.max(localMax, Math.abs(refData[j]?.[colName] || 0));
           }
           margin = Math.max(localMax * (devThr / 100), deadbandThr);
         }
         upper = rVal + margin; lower = rVal - margin;
       }
       result.push({ Time: time, Referencja: rVal, Badany: tVal, UpperLimit: upper, LowerLimit: lower, Roznica: (rVal !== null && tVal !== null) ? Number((tVal - rVal).toFixed(4)) : null });
    }
    return result;
  };

  const combinedData = useMemo(() => prepareColumnData(selectedColumn), [refData, testData, selectedColumn, robotInfo]);
  const displayedData = useMemo(() => { return zoomRange ? combinedData.filter(d => d.Time >= zoomRange[0] && d.Time <= zoomRange[1]) : combinedData; }, [combinedData, zoomRange]);

  const statsData = useMemo(() => {
    if (refData.length === 0 || testData.length === 0 || availableColumns.length === 0) return null;
    const errors: Record<string, Record<string, number>> = { MAE: {}, IAE: {}, ISE: {} };
    const maxLen = Math.min(refData.length, testData.length);
    availableColumns.forEach(col => {
      let sumAbs = 0, sumSqr = 0, count = 0, integralAbs = 0, integralSqr = 0;
      for (let i = 0; i < maxLen; i++) {
        const r = refData[i]?.[col]; const t = testData[i]?.[col];
        if (r !== undefined && r !== null && t !== undefined && t !== null) {
          const err = t - r; sumAbs += Math.abs(err); count++;
          let dt = 0; if (i > 0) { dt = (refData[i]?.Time ?? i) - (refData[i - 1]?.Time ?? (i - 1)); }
          integralAbs += Math.abs(err) * dt; integralSqr += (err * err) * dt;
        }
      }
      errors.MAE[col] = count > 0 ? sumAbs / count : 0; errors.IAE[col] = integralAbs; errors.ISE[col] = integralSqr;
    });
    const aCols = availableColumns.filter(c => c.startsWith('A')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const curCols = availableColumns.filter(c => c.startsWith('Cur')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const maxes = {
      A: { MAE: Math.max(...aCols.map(c => errors.MAE[c]), 0.0001), IAE: Math.max(...aCols.map(c => errors.IAE[c]), 0.0001), ISE: Math.max(...aCols.map(c => errors.ISE[c]), 0.0001) },
      Cur: { MAE: Math.max(...curCols.map(c => errors.MAE[c]), 0.0001), IAE: Math.max(...curCols.map(c => errors.IAE[c]), 0.0001), ISE: Math.max(...curCols.map(c => errors.ISE[c]), 0.0001) }
    };
    return { errors, aCols, curCols, maxes };
  }, [refData, testData, availableColumns]);

  const { areas: violationAreas, violationPercent } = useMemo(() => {
    if (!displayedData || displayedData.length === 0) return { areas: [], violationPercent: 0 };
    const areas: { start: number, end: number }[] = [];
    let violationStart: number | null = null;
    let violationCount = 0;
    for (let i = 0; i < displayedData.length; i++) {
      const d = displayedData[i];
      const isOut = d.Badany !== null && d.UpperLimit !== null && d.LowerLimit !== null && (d.Badany > d.UpperLimit || d.Badany < d.LowerLimit);
      if (isOut) { violationCount++; if (violationStart === null) violationStart = d.Time; } 
      else if (!isOut && violationStart !== null) { areas.push({ start: violationStart, end: d.Time }); violationStart = null; }
    }
    if (violationStart !== null) areas.push({ start: violationStart, end: displayedData[displayedData.length - 1].Time });
    return { areas, violationPercent: (violationCount / displayedData.length) * 100 };
  }, [displayedData]);

const handleLiveScrub = (index: number) => {
    if (!displayedData || displayedData.length < 2) return;
    const percent = index / (displayedData.length - 1);
    
    // 1. DUŻE WYKRESY (mają 65px marginesu na teksty na Osi Y)
    const mainCssCalc = `calc(65px + (100% - 95px) * ${percent})`;
    if (mainChartLineRef.current) mainChartLineRef.current.style.left = mainCssCalc;
    if (diffChartLineRef.current) diffChartLineRef.current.style.left = mainCssCalc;

    // 2. MINI WYKRESY (nie mają osi, margines to sztywne 5px)
    const miniCssCalc = `calc(5px + (100% - 10px) * ${percent})`;
    const miniLines = document.querySelectorAll<HTMLElement>('.mini-sync-line');
    miniLines.forEach(line => {
      line.style.left = miniCssCalc;
    });
  };

  useEffect(() => { handleLiveScrub(playbackIndex); }, [playbackIndex, displayedData]);

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
      </div>
      
      {robotName ? (
        <div style={{ marginTop: '1rem', padding: '1.5rem', border: '1px solid #444', borderRadius: '8px', backgroundColor: '#1a1a1a' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ background: '#2a2a2a', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #00bcd4' }}>
              <h4 style={{ margin: '0 0 5px 0', color: '#00bcd4' }}>🤖 Dane robota</h4>
              <p style={{ margin: '5px 0', color: '#aaa' }}>Model: <strong style={{ color: '#fff' }}>{robotInfo?.config?.model || '[Brak]'}</strong></p>
              <p style={{ margin: '5px 0', color: '#aaa' }}>Lokalizacja: <strong style={{ color: '#fff' }}>{robotInfo?.config?.location || '[Brak]'}</strong></p>
            </div>
            <div style={{ background: '#2a2a2a', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #4caf50' }}>
              <h4 style={{ margin: '0 0 5px 0', color: '#4caf50' }}>🟢 Plik referencyjny</h4>
              <p style={{ margin: '0', color: '#aaa' }}>{robotInfo?.ref_file_info?.name || 'Brak pliku referencyjnego'}</p>
            </div>
            <div style={{ background: '#2a2a2a', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #ffeb3b' }}>
              <h4 style={{ margin: '0 0 5px 0', color: '#ffeb3b' }}>🟡 Plik badany</h4>
              <p style={{ margin: '0', color: '#aaa' }}>{isFile ? selectedFilePath?.split(/[/\\]/).pop() : 'Wybierz plik...'}</p>
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
                          {statsData.aCols.map(c => <th key={c} style={{ padding: '8px', borderBottom: '1px solid #444', borderRight: c === statsData.aCols[statsData.aCols.length - 1] ? '1px solid #444' : 'none', color: '#bbb' }}>{c}</th>)}
                          {statsData.curCols.map(c => <th key={c} style={{ padding: '8px', borderBottom: '1px solid #444', color: '#bbb' }}>{c}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {METRICS.map(metric => (
                          <tr key={metric}>
                            <td style={{ padding: '8px', borderBottom: '1px solid #333', borderRight: '1px solid #444', textAlign: 'left', fontWeight: 'bold', color: '#00bcd4' }}>{metric}</td>
                            {statsData.aCols.map(c => { const val = statsData.errors[metric][c]; const bgColor = getErrorColor(val, statsData.maxes.A[metric]); return (<td key={c} style={{ padding: '8px', borderBottom: '1px solid #333', borderRight: c === statsData.aCols[statsData.aCols.length - 1] ? '1px solid #444' : 'none' }}><div style={{ background: '#222', borderBottom: `4px solid ${bgColor}`, padding: '4px', borderRadius: '4px', fontWeight: 'bold' }}>{val.toFixed(3)}</div></td>); })}
                            {statsData.curCols.map(c => { const val = statsData.errors[metric][c]; const bgColor = getErrorColor(val, statsData.maxes.Cur[metric]); return (<td key={c} style={{ padding: '8px', borderBottom: '1px solid #333' }}><div style={{ background: '#222', borderBottom: `4px solid ${bgColor}`, padding: '4px', borderRadius: '4px', fontWeight: 'bold' }}>{val.toFixed(3)}</div></td>); })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#222', padding: '10px 15px', borderRadius: '8px', border: '1px solid #333', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', background: '#111', borderRadius: '6px', padding: '3px', border: '1px solid #444' }}>
              <button onClick={() => setViewMode('detailed')} style={{ padding: '6px 20px', background: viewMode === 'detailed' ? '#e91e63' : 'transparent', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', transition: 'all 0.2s' }}>🔍 Szczegóły</button>
              <button onClick={() => setViewMode('overview')} style={{ padding: '6px 20px', background: viewMode === 'overview' ? '#e91e63' : 'transparent', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', transition: 'all 0.2s' }}>📱 Widok wspólny</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: '10px' }}>
              <label style={{ color: '#aaa', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div onClick={() => setShowTimeMarker(!showTimeMarker)} style={{ width: '40px', height: '20px', background: showTimeMarker ? '#9c27b0' : '#444', borderRadius: '10px', position: 'relative', transition: '0.3s', cursor: 'pointer' }}>
                  <div style={{ width: '16px', height: '16px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: showTimeMarker ? '22px' : '2px', transition: '0.3s' }} />
                </div>
                Synchronizacja 3D
              </label>
            </div>
            {viewMode === 'detailed' && zoomRange && (<button onClick={() => setZoomRange(null)} style={{ padding: '8px 16px', background: '#444', color: 'white', border: '1px solid #555', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '5px' }}>🔄 Reset Zoom</button>)}
          </div>

          {viewMode === 'detailed' ? (
            <>
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

              <h3 style={{ color: '#fff', marginBottom: '0.5rem', borderBottom: '1px solid #444', paddingBottom: '5px' }}>Porównanie z referencją {unit ? `[${unit}]` : ''}</h3>
              <div style={{ height: '300px', background: '#111', padding: '1rem', borderRadius: '8px', border: '1px solid #333', marginBottom: '2.5rem', position: 'relative' }}>
                {showTimeMarker && (
                    <div 
                    ref={diffChartLineRef}
                    style={{
                        position: 'absolute', top: 15, bottom: 25, width: '2px', backgroundColor: '#9c27b0',
                        left: '65px', zIndex: 100, pointerEvents: 'none', transition: 'none'
                    }}
                    >
                    <div style={{ position: 'absolute', top: -15, left: -25, color: '#9c27b0', fontSize: '10px', fontWeight: 'bold', width: '60px', textAlign: 'center' }}>POZ. 3D</div>
                    </div>
                )}
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={displayedData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }} onMouseDown={(e) => e && setRefAreaLeft(e.activeLabel as number)} onMouseMove={(e) => refAreaLeft && e && setRefAreaRight(e.activeLabel as number)} onMouseUp={handleZoom} style={{ userSelect: 'none', cursor: 'crosshair' }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="Time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => v.toFixed(1) + 's'} stroke="#888" hide />
                    <YAxis domain={['auto', 'auto']} stroke="#888" label={{ value: unit, angle: -90, position: 'insideLeft', fill: '#888' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#444' }} labelFormatter={(l) => `Czas: ${Number(l).toFixed(3)}s`} formatter={(v: any, name: any) => { if (Array.isArray(v)) return [`od ${v[0].toFixed(2)} do ${v[1].toFixed(2)} ${unit}`, name]; return [`${Number(v).toFixed(2)} ${unit}`, name]; }} />
                    <Legend verticalAlign="top" height={36} />
                    {violationAreas.map((area, idx) => (<ReferenceArea key={`violation-${idx}`} x1={area.start} x2={area.end} fill="#f44336" fillOpacity={0.25} strokeOpacity={0} />))}
                    <Line name="Górny limit" type="monotone" dataKey="UpperLimit" stroke="#9e9e9e" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                    <Line name="Dolny limit" type="monotone" dataKey="LowerLimit" stroke="#9e9e9e" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                    <Line name="Referencja" type="monotone" dataKey="Referencja" stroke="#4caf50" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line name="Badany" type="monotone" dataKey="Badany" stroke="#ffeb3b" strokeWidth={2} dot={false} isAnimationActive={false} />
                    {refAreaLeft !== null && refAreaRight !== null && <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill="#e91e63" fillOpacity={0.3} />}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <h3 style={{ color: '#ff5722', marginBottom: '0.5rem', borderBottom: '1px solid #444', paddingBottom: '5px' }}>Obliczona różnica sygnałów {unit ? `[${unit}]` : ''}</h3>
              <div style={{ height: '220px', background: '#111', padding: '1rem', borderRadius: '8px', border: '1px solid #333', position: 'relative' }}>
                {showTimeMarker && (
                    <div 
                    ref={diffChartLineRef}
                    style={{
                        position: 'absolute', top: 15, bottom: 25, width: '2px', backgroundColor: '#9c27b0',
                        left: '65px', zIndex: 100, pointerEvents: 'none', transition: 'none'
                    }}
                    >
                    <div style={{ position: 'absolute', top: -15, left: -25, color: '#9c27b0', fontSize: '10px', fontWeight: 'bold', width: '60px', textAlign: 'center' }}>POZ. 3D</div>
                    </div>
                )}
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={displayedData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }} onMouseDown={(e) => e && setRefAreaLeft(e.activeLabel as number)} onMouseMove={(e) => refAreaLeft && e && setRefAreaRight(e.activeLabel as number)} onMouseUp={handleZoom} style={{ userSelect: 'none', cursor: 'crosshair' }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="Time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => v.toFixed(1) + 's'} stroke="#888" label={{ value: 'Czas nagrania [s]', position: 'insideBottom', offset: -10, fill: '#aaa' }} />
                    <YAxis domain={['auto', 'auto']} stroke="#888" label={{ value: unit, angle: -90, position: 'insideLeft', fill: '#888' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#444' }} labelFormatter={(l) => `Czas: ${Number(l).toFixed(3)}s`} formatter={(v: any) => [`${Number(v).toFixed(2)} ${unit}`, 'Δ Różnica']} />
                    {violationAreas.map((area, idx) => (<ReferenceArea key={`diff-violation-${idx}`} x1={area.start} x2={area.end} fill="#f44336" fillOpacity={0.25} strokeOpacity={0} />))}
                    <Line name="Δ Odchylenie (Badany - Ref)" type="monotone" dataKey="Roznica" stroke="#ff5722" strokeWidth={2} dot={false} isAnimationActive={false} />
                    {refAreaLeft !== null && refAreaRight !== null && <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill="#e91e63" fillOpacity={0.3} />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '1rem' }}>
            <div>
              <h4 style={{ color: '#00bcd4', textAlign: 'center', borderBottom: '1px solid #333', paddingBottom: '5px', marginTop: 0 }}>Osie Kątowe (A)</h4>
              {statsData?.aCols.map(col => (
                <MiniAnalizaChart 
                  key={col} title={col} data={prepareColumnData(col)} unit="°" 
                  failureThreshold={robotInfo?.config?.max_violation_threshold || 5.0} 
                  showTimeMarker={showTimeMarker} // Dodane!
                />
              ))}
            </div>
            <div>
              <h4 style={{ color: '#ffeb3b', textAlign: 'center', borderBottom: '1px solid #333', paddingBottom: '5px', marginTop: 0 }}>Prądy Silników (Cur)</h4>
              {statsData?.curCols.map(col => (
                <MiniAnalizaChart 
                  key={col} title={col} data={prepareColumnData(col)} unit="%" 
                  failureThreshold={robotInfo?.config?.max_violation_threshold || 5.0} 
                  showTimeMarker={showTimeMarker} // Dodane!
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