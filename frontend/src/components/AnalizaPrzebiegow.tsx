// AnalizaPrzebiegow.tsx
import { useState, useEffect, useMemo, useRef, Fragment, memo } from 'react';
import { LineChart, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea } from 'recharts';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { getUnit, getErrorColor } from './utils';
import { emitAppLog } from './Notifications';

type Metric = 'MAE' | 'MSE' | 'IAE' | 'ISE';
const METRICS: Metric[] = ['MAE', 'MSE', 'IAE', 'ISE'];

// Wspólna paleta i nazwy serii dla wszystkich wykresów modułu Analiza.
const CHART_SERIES = {
  reference: { name: 'Referencja', color: '#5f8f73', width: 2, dash: undefined },
  tested: { name: 'Badany', color: '#6f9bb4', width: 2.5, dash: undefined },
  raw: { name: 'Badany (surowy)', color: '#b28a55', width: 2, dash: '7 4' },
  compensated: { name: 'Badany (po komp.)', color: '#6f9bb4', width: 2.5, dash: undefined },
  diff: { name: 'Różnica', color: '#b06b78', width: 2.5, dash: undefined },
  rawDiff: { name: 'Różnica (surowa)', color: '#8979a5', width: 2, dash: '7 4' },
  upperLimit: { name: 'Granica górna', color: '#8f9aa5', width: 1.5, dash: '7 4' },
  lowerLimit: { name: 'Granica dolna', color: '#5f6b76', width: 1.5, dash: '2 4' },
  failureThreshold: { name: 'Próg awarii', color: '#a86161', width: 1.5, dash: '6 4' },
  failureRate: { name: 'Awaryjność', color: '#6f9bb4', width: 2.5, dash: undefined },
  rawFailureRate: { name: 'Awaryjność (surowa)', color: '#8979a5', width: 2, dash: '7 4' },
  temperature: { name: 'Temperatura', color: '#b07a56', width: 2.5, dash: '2 3' },
} as const;

const COMPACT_LEGEND_STYLE = { fontSize: '9px', color: '#aaa' };
const CHART_LEGEND_STYLE = { fontSize: '0.8rem', color: '#aaa' };

const DiffChartTooltip = ({ active, payload, label, unit }: any) => {
  if (!active || !payload?.length) return null;

  return (
    <div style={{ background: '#171b1b', border: '1px solid #3a4545', borderRadius: '6px', boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)', padding: '10px 12px', minWidth: '205px' }}>
      <div style={{ color: '#c5cece', borderBottom: '1px solid #303b3b', paddingBottom: '6px', marginBottom: '6px', fontSize: '0.78rem', fontWeight: 600 }}>
        Czas: {Number(label).toFixed(3)} s
      </div>
      {payload.filter((entry: any) => entry.value !== null && entry.value !== undefined).map((entry: any, index: number) => (
        <div key={`${entry.dataKey}-${index}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '3px 0', color: '#d6dddd', fontSize: '0.78rem' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
            <span style={{ width: '9px', height: '3px', borderRadius: '2px', background: entry.color || '#849090', display: 'inline-block' }} />
            {entry.name || String(entry.dataKey)}
          </span>
          <strong style={{ color: '#f0f3f3', fontWeight: 600 }}>{Number(entry.value).toFixed(2)} {unit}</strong>
        </div>
      ))}
    </div>
  );
};

// --- MINI WYKRES DO WIDOKU WSPÓLNEGO ---
const MiniAnalizaChart = memo(({ title, data, unit, failureThreshold, showTimeMarker, violationAreas, violationPercent, isExpanded, onToggleExpand, showRawDiff, onMaximize, diagType, statsData, isCompensated }: any) => {
  
  // Dynamiczny Badge w zależności od wybranej strategii diagnostycznej
  const getBadgeStatus = () => {
      if (diagType === 'Wskaźniki' && statsData) {
          const metrics = ['ISE', 'MSE', 'IAE', 'MAE'];
          for (let m of metrics) {
              if (statsData.exceededLimits?.[m]?.[title]) {
                  const val = statsData.errors[m][title];
                  return { text: `❌ ${m}: ${val.toFixed(2)}`, color: '#f44336' };
              }
          }
          return { text: '✅ OK', color: '#4caf50' };
      } else {
          // Zabezpieczenie przed undefined
          const val = Number(violationPercent) || 0;
          const thr = Number(failureThreshold) || 5.0;
          
          if (val === 0) return { text: '✅ OK', color: '#4caf50' };
          if (val >= thr) return { text: `❌ ${val.toFixed(1)}% błędów`, color: '#f44336' };
          return { text: `⚠️ ${val.toFixed(1)}% błędów`, color: '#ff9800' };
      }
  };

  const badge = getBadgeStatus();

  return (
    <div style={{ background: '#141414', padding: '12px', borderRadius: '8px', border: '1px solid #2a2a2a', marginBottom: '12px', transition: 'all 0.3s ease' }}>
      
      {/* NAGŁÓWEK MINI-WYKRESU */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h5 style={{ margin: 0, color: '#aaa', fontSize: '0.85rem' }}>{title} <span style={{ opacity: 0.5 }}>[{unit}]</span></h5>
          
          <button 
            onClick={onMaximize}
            title="Powiększ na pełny ekran i analizuj"
            style={{ background: 'transparent', border: 'none', color: '#2196f3', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', padding: '0 4px', transition: '0.2s', marginTop: '-2px' }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = '#2196f3'}
          >
            ⛶
          </button>

          <button 
            onClick={onToggleExpand} 
            style={{ background: 'transparent', border: '1px solid #333', color: '#888', borderRadius: '4px', padding: '2px 6px', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', transition: '0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#555'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = '#333'; }}
          >
            {isExpanded ? '▲ Ukryj residua' : '▼ Widok różnicy'}
          </button>
        </div>
        
        {/* WIDOCZNY ZNACZNIK STATUSU AWARII */}
        <span style={{ background: badge.color, color: '#fff', padding: '3px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', boxShadow: `0 0 8px ${badge.color}40` }}>
          {badge.text}
        </span>
      </div>
      
      {/* GŁÓWNY WYKRES */}
      <div style={{ height: '140px', position: 'relative' }}>
        {showTimeMarker && (
          <div className="mini-sync-line" style={{ position: 'absolute', top: 5, bottom: 5, width: '2px', backgroundColor: '#2196f3', left: '40px', zIndex: 100, pointerEvents: 'none', boxShadow: '0 0 5px rgba(33, 150, 243, 0.5)' }} />
        )}
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="2 2" stroke="#222" vertical={false} />
            <XAxis dataKey="Time" hide />
            <YAxis width={40} domain={['auto', 'auto']} stroke="#555" tick={{fontSize: 9}} tickFormatter={(v) => String(Math.round(v))} />
            <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', fontSize: '10px', borderColor: '#333', borderRadius: '4px' }} formatter={(v: any, name: any) => [Number(v).toFixed(2), String(name)]} />
            <Legend verticalAlign="top" height={24} iconSize={6} wrapperStyle={COMPACT_LEGEND_STYLE} />
            {violationAreas && violationAreas.map((area: any, idx: number) => <ReferenceArea key={`violation-${idx}`} x1={area.start} x2={area.end} fill="#f44336" fillOpacity={0.25} strokeOpacity={0} />)}
            <Line name={CHART_SERIES.reference.name} type="monotone" dataKey="Referencja" stroke={CHART_SERIES.reference.color} strokeWidth={CHART_SERIES.reference.width} dot={false} isAnimationActive={false} />
            {showRawDiff && isCompensated && (
              <Line name={CHART_SERIES.raw.name} type="monotone" dataKey="Badany" stroke={CHART_SERIES.raw.color} strokeWidth={CHART_SERIES.raw.width} strokeDasharray={CHART_SERIES.raw.dash} dot={false} isAnimationActive={false} opacity={0.8} />
            )}
            <Line name={isCompensated ? CHART_SERIES.compensated.name : CHART_SERIES.tested.name} type="monotone" dataKey="BadanyKomp" stroke={CHART_SERIES.tested.color} strokeWidth={CHART_SERIES.tested.width} dot={false} isAnimationActive={false} />
            
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ROZWIJANY WYKRES RÓŻNIC (RESIDUA) */}
      <div style={{ 
        maxHeight: isExpanded ? '150px' : '0px', 
        opacity: isExpanded ? 1 : 0, 
        overflow: 'hidden', 
        transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        marginTop: isExpanded ? '10px' : '0px', 
        borderTop: `1px dashed ${isExpanded ? '#333' : 'transparent'}`, 
        paddingTop: isExpanded ? '10px' : '0px' 
      }}>
        <div style={{ height: '140px', position: 'relative' }}>
          {showTimeMarker && (
            <div className="mini-sync-line" style={{ position: 'absolute', top: 0, bottom: 5, width: '2px', backgroundColor: '#2196f3', left: '40px', zIndex: 100, pointerEvents: 'none', boxShadow: '0 0 5px rgba(33, 150, 243, 0.5)' }} />
          )}
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="#222" vertical={false} />
              <XAxis dataKey="Time" hide />
              <YAxis width={40} domain={['auto', 'auto']} stroke="#555" tick={{fontSize: 9}} tickFormatter={(v) => String(Math.round(v))} />
              <Legend verticalAlign="top" height={24} iconSize={6} wrapperStyle={COMPACT_LEGEND_STYLE} />
              <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', fontSize: '10px', borderColor: '#333', borderRadius: '4px' }} formatter={(v: any, name: any) => [Number(v).toFixed(2), String(name)]} />
              {violationAreas && violationAreas.map((area: any, idx: number) => <ReferenceArea key={`diff-violation-${idx}`} x1={area.start} x2={area.end} fill="#f44336" fillOpacity={0.25} strokeOpacity={0} />)}
              
              <Line name={CHART_SERIES.upperLimit.name} type="stepAfter" dataKey="DiffUpper" stroke={CHART_SERIES.upperLimit.color} strokeWidth={CHART_SERIES.upperLimit.width} strokeDasharray={CHART_SERIES.upperLimit.dash} dot={false} strokeOpacity={0.9} isAnimationActive={false} />
              <Line name={CHART_SERIES.lowerLimit.name} type="stepAfter" dataKey="DiffLower" stroke={CHART_SERIES.lowerLimit.color} strokeWidth={CHART_SERIES.lowerLimit.width} strokeDasharray={CHART_SERIES.lowerLimit.dash} dot={false} strokeOpacity={0.9} isAnimationActive={false} />
              {showRawDiff && isCompensated && (
                <Line name={CHART_SERIES.rawDiff.name} type="monotone" dataKey="RoznicaRaw" stroke={CHART_SERIES.rawDiff.color} strokeWidth={CHART_SERIES.rawDiff.width} strokeDasharray={CHART_SERIES.rawDiff.dash} dot={false} isAnimationActive={false} />
              )}
              <Line name={CHART_SERIES.diff.name} type="monotone" dataKey="Roznica" stroke={CHART_SERIES.diff.color} strokeWidth={CHART_SERIES.diff.width} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.isExpanded === nextProps.isExpanded &&
    prevProps.showRawDiff === nextProps.showRawDiff &&
    prevProps.data === nextProps.data &&
    prevProps.diagType === nextProps.diagType &&
    prevProps.statsData === nextProps.statsData &&
    prevProps.isCompensated === nextProps.isCompensated
  );
});
  

// --- PROFESJONALNY MODEL WIZUALNY ROBOTA (Z obsługą Ducha Referencji) ---
const ImprovedRobot = ({ points, isGhost = false }: { points: number[][], isGhost?: boolean }) => {
  if (!points || points.length !== 7) return null;
  
  // Jeśli to duch referencji - renderujemy holograficzny błękit, w przeciwnym razie kolory przemysłowe
  const mainColor = isGhost ? '#00bcd4' : '#FF8C00';
  const jointColor = isGhost ? '#008ba3' : '#333';
  const baseColor = isGhost ? '#111' : '#222';
  const gripperColor = isGhost ? '#444' : '#555';
  
  const opacity = isGhost ? 0.35 : 1;
  const transparent = isGhost;

  const Segment = ({ p1, p2, isLast }: { p1: number[], p2: number[], isLast?: boolean }) => {
    const v1 = new THREE.Vector3(p1[0], p1[1], p1[2]);
    const v2 = new THREE.Vector3(p2[0], p2[1], p2[2]);
    const distance = v1.distanceTo(v2);
    if (distance < 0.001) return null;
    const position = v2.clone().add(v1).divideScalar(2);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v2.clone().sub(v1).normalize());
    
    return (
      <mesh position={position} quaternion={quaternion} castShadow={!isGhost} receiveShadow={!isGhost}>
        <cylinderGeometry args={[0.035, 0.045, distance, 32]} />
        <meshStandardMaterial color={mainColor} metalness={0.4} roughness={0.4} transparent={transparent} opacity={opacity} />
      </mesh>
    );
  };

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {/* Podstawa robota (Baza) */}
      <mesh position={[0, 0, -0.05]} rotation={[Math.PI / 2, 0, 0]} receiveShadow={!isGhost} castShadow={!isGhost}>
        <cylinderGeometry args={[0.15, 0.18, 0.1, 32]} />
        <meshStandardMaterial color={baseColor} metalness={0.8} roughness={0.2} transparent={transparent} opacity={opacity} />
      </mesh>
      
      {/* Przeguby i ramiona */}
      {points.map((p, i) => (
        <Fragment key={i}>
          {/* Kulisty przegub silnika */}
          <mesh position={[p[0], p[1], p[2]]} castShadow={!isGhost} receiveShadow={!isGhost}>
            <sphereGeometry args={[0.055, 32, 32]} />
            <meshStandardMaterial color={jointColor} metalness={0.7} roughness={0.2} transparent={transparent} opacity={opacity} />
          </mesh>
          {i < 6 && <Segment p1={p} p2={points[i + 1]} isLast={i === 5} />}
        </Fragment>
      ))}
      
      {/* Chwytak (End-effector) */}
      {(() => {
        const p = points[6];
        const prev = points[5];
        const v1 = new THREE.Vector3(prev[0], prev[1], prev[2]);
        const v2 = new THREE.Vector3(p[0], p[1], p[2]);
        const dir = v2.clone().sub(v1).normalize();
        const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        
        return (
          <group position={[p[0], p[1], p[2]]} quaternion={quaternion}>
            <mesh position={[0, 0.02, 0]} castShadow={!isGhost}>
              <boxGeometry args={[0.08, 0.04, 0.04]} />
              <meshStandardMaterial color={gripperColor} metalness={0.8} roughness={0.2} transparent={transparent} opacity={opacity} />
            </mesh>
            <mesh position={[-0.03, 0.06, 0]} castShadow={!isGhost}>
              <boxGeometry args={[0.015, 0.08, 0.03]} />
              <meshStandardMaterial color={gripperColor} metalness={0.9} roughness={0.1} transparent={transparent} opacity={opacity} />
            </mesh>
            <mesh position={[0.03, 0.06, 0]} castShadow={!isGhost}>
              <boxGeometry args={[0.015, 0.08, 0.03]} />
              <meshStandardMaterial color={gripperColor} metalness={0.9} roughness={0.1} transparent={transparent} opacity={opacity} />
            </mesh>
          </group>
        );
      })()}
    </group>
  );
};

// --- ODTWARZACZ 3D ---
const RobotPlayer3D = ({ trajectory, refTrajectory, showGhost, setShowGhost, displayedData, testData, playbackIndex, setPlaybackIndex, handleLiveScrub, isTrajectoryLoading }: any) => {
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
      marginTop: isDocked ? '0' : '2rem', padding: '1rem', 
      background: isDocked ? 'rgba(20, 20, 20, 0.95)' : '#141414', backdropFilter: isDocked ? 'blur(12px)' : 'none',
      borderRadius: '8px', border: isDocked ? '2px solid #2196f3' : '1px solid #2a2a2a', 
      position: isDocked ? 'fixed' : 'relative', bottom: isDocked ? '20px' : 'auto', right: isDocked ? '20px' : 'auto',
      width: isDocked ? `${dockWidth}px` : 'auto', zIndex: isDocked ? 2000 : 1,
      boxShadow: isDocked ? '0 20px 50px rgba(0,0,0,0.8)' : 'none',
      transition: isDocked ? 'none' : 'all 0.3s ease-in-out'
    }}>
      {isDocked && (
        <div onMouseDown={startResize} title="Złap i przeciągnij, aby zmienić rozmiar"
          style={{ position: 'absolute', top: 0, left: 0, width: '25px', height: '25px', cursor: 'nwse-resize', zIndex: 10, borderTopLeftRadius: '6px', background: 'linear-gradient(135deg, rgba(33, 150, 243, 0.8) 0%, rgba(33, 150, 243, 0.8) 30%, transparent 30%)' }}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', paddingLeft: isDocked ? '15px' : '0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button 
            onClick={() => {
              if (!isPlaying && localIndex >= displayedData.length - 1) { setLocalIndex(0); setPlaybackIndex(0); if (handleLiveScrub) handleLiveScrub(0); }
              if (isPlaying) setPlaybackIndex(localIndex); 
              setIsPlaying(!isPlaying);
            }}
            style={{ background: isPlaying ? '#ff9800' : '#4caf50', color: 'white', border: 'none', borderRadius: '4px', padding: '6px 14px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold' }}
          >
            {isPlaying ? '⏸ Pauza' : '▶ Play'}
          </button>

          <select 
            value={playbackSpeed} onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
            style={{ background: '#222', color: 'white', border: '1px solid #444', borderRadius: '4px', padding: '5px 8px', fontSize: '0.8rem', outline: 'none' }}
          >
            <option value={0.1}>0.1x</option><option value={0.25}>0.25x</option><option value={0.5}>0.5x</option><option value={1.0}>1.0x</option><option value={2.0}>2.0x</option><option value={5.0}>5.0x</option>
          </select>
          
          <label style={{ color: '#00bcd4', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', marginLeft: '10px', background: 'rgba(0, 188, 212, 0.1)', padding: '5px 10px', borderRadius: '4px', border: '1px solid rgba(0, 188, 212, 0.3)' }}>
            <input type="checkbox" checked={showGhost} onChange={(e) => setShowGhost(e.target.checked)} style={{ accentColor: '#00bcd4' }} />
            Duch referencji
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: '#aaa', background: '#1a1a1a', padding: '4px 12px', borderRadius: '4px', fontSize: '0.85rem', border: '1px solid #333' }}>
            <strong>{currentTime?.toFixed(3) || 0} s</strong>
          </span>
          <button 
            onClick={() => setIsDocked(!isDocked)}
            style={{ background: isDocked ? '#e91e63' : '#333', color: 'white', border: 'none', borderRadius: '4px', padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold' }}
          >
            {isDocked ? '🔓 Odepnij' : '📌 Przypnij'}
          </button>
        </div>
      </div>

      <input 
        type="range" min={0} max={Math.max(displayedData.length - 1, 0)} value={localIndex} 
        onChange={(e) => { const newIdx = Number(e.target.value); setLocalIndex(newIdx); if (handleLiveScrub) handleLiveScrub(newIdx); }}
        onMouseUp={() => setPlaybackIndex(localIndex)} 
        onMouseDown={() => { setIsPlaying(false); setPlaybackIndex(localIndex); }} 
        style={{ width: '100%', marginBottom: '15px', cursor: 'pointer', accentColor: '#2196f3' }} 
      />

      <div style={{ height: isDocked ? `${dockHeight}px` : '450px', background: '#0a0a0a', borderRadius: '6px', border: '1px solid #2a2a2a', overflow: 'hidden', position: 'relative' }}>
        {isTrajectoryLoading ? (
          <div style={{ padding: '1rem', color: '#2196f3', textAlign: 'center', marginTop: isDocked ? '20%' : '150px' }}>⏳ Obliczanie macierzy kinematyki dla 3D...</div>
        ) : (
          <Canvas camera={{ position: [2, 1.5, 2], fov: 45 }} shadows={{ type: THREE.PCFShadowMap }}>
            <color attach="background" args={['#0f0f0f']} />
            <ambientLight intensity={0.6} />
            <directionalLight position={[5, 10, 5]} intensity={1.5} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
            <Grid infiniteGrid fadeDistance={8} sectionColor="#444" cellColor="#222" />
            {trajectory && trajectory.length > 0 && <ImprovedRobot points={trajectory[actualIndex]} />}
            {showGhost && refTrajectory && refTrajectory.length > 0 && refTrajectory[actualIndex] && <ImprovedRobot points={refTrajectory[actualIndex]} isGhost={true} />}
            <OrbitControls makeDefault />
          </Canvas>
        )}
      </div>
    </div>
  );
};

const paramStyle: React.CSSProperties = {
  background: '#1a1a1a', padding: '8px 12px', borderRadius: '4px', 
  border: '1px solid #2a2a2a', fontSize: '0.85rem', color: '#bbb'
};

const SignalStatsTable = ({ title, stats, unit, color }: any) => {
  if (!stats) return null;
  const rowStyle = { borderBottom: '1px solid #2a2a2a', fontSize: '0.85rem' };
  const labelStyle = { padding: '8px', color: '#aaa', textAlign: 'left' as const };
  const valStyle = { padding: '8px', textAlign: 'right' as const, fontWeight: 'bold', color: '#fff' };

  return (
    <div style={{ background: '#111', borderRadius: '8px', padding: '15px', border: `1px solid ${color}44` }}>
      <h5 style={{ margin: '0 0 10px 0', color: color, borderBottom: `1px solid ${color}66`, paddingBottom: '8px', fontSize: '0.95rem' }}>{title}</h5>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr style={rowStyle}><td style={labelStyle}>Minimum:</td><td style={valStyle}>{stats.min.toFixed(4)} <span style={{ opacity: 0.5 }}>{unit}</span></td></tr>
          <tr style={rowStyle}><td style={labelStyle}>Maximum:</td><td style={valStyle}>{stats.max.toFixed(4)} <span style={{ opacity: 0.5 }}>{unit}</span></td></tr>
          <tr style={rowStyle}><td style={labelStyle}>Peak-to-Peak:</td><td style={valStyle}>{stats.peak_to_peak.toFixed(4)} <span style={{ opacity: 0.5 }}>{unit}</span></td></tr>
          <tr style={rowStyle}><td style={labelStyle}>Średnia (Mean):</td><td style={valStyle}>{stats.mean.toFixed(4)} <span style={{ opacity: 0.5 }}>{unit}</span></td></tr>
          <tr style={rowStyle}><td style={labelStyle}>Wartość RMS:</td><td style={valStyle}>{stats.rms.toFixed(4)} <span style={{ opacity: 0.5 }}>{unit}</span></td></tr>
          <tr style={{ border: 'none', fontSize: '0.85rem' }}><td style={labelStyle}>Odch. standardowe:</td><td style={valStyle}>{stats.std.toFixed(4)}</td></tr>
        </tbody>
      </table>
    </div>
  );
};

export const AnalizaPrzebiegow = ({ selectedFilePath }: { selectedFilePath: string | null }) => {
  const [robotInfo, setRobotInfo] = useState<any>(null);
  
  const [diagnosis, setDiagnosis] = useState<any>(null);
  const [testData, setTestData] = useState<any[]>([]);
  const [showParamsModal, setShowParamsModal] = useState(false);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [selectedColumn, setSelectedColumn] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'combined' | 'batch'>('combined');
  const [refAreaLeft, setRefAreaLeft] = useState<number | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<number | null>(null);
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);
  const [playbackIndex, setPlaybackIndex] = useState<number>(0);
  const [trajectory, setTrajectory] = useState<any[]>([]);
  const [refTrajectory, setRefTrajectory] = useState<any[]>([]); 
  const [showGhost, setShowGhost] = useState<boolean>(true); 
  const [isTrajectoryLoading, setIsTrajectoryLoading] = useState(false);
  const [showTimeMarker, setShowTimeMarker] = useState<boolean>(true);
  const [isAutoDiagnosing, setIsAutoDiagnosing] = useState(false);
  const mainChartLineRef = useRef<HTMLDivElement>(null);
  const diffChartLineRef = useRef<HTMLDivElement>(null);
  const [overrideConfig, setOverrideConfig] = useState<any>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [useThermal, setUseThermal] = useState(true);
  const [batchResults, setBatchResults] = useState<any[] | null>(null);
  const [isBatchLoading, setIsBatchLoading] = useState(false);
  const [batchTrendSelection, setBatchTrendSelection] = useState<string>('Ogólny');
  const [showBatchTemp, setShowBatchTemp] = useState<boolean>(false);
  const [showRawDiff, setShowRawDiff] = useState<boolean>(false); 
  const [showBatchRaw, setShowBatchRaw] = useState<boolean>(false);
  const [batchTempSelection, setBatchTempSelection] = useState<string>('Średnia');
  const [expandedResiduals, setExpandedResiduals] = useState<string[]>([]);
  const [showStatsTable, setShowStatsTable] = useState<boolean>(true);
  const robotName = selectedFilePath ? selectedFilePath.split(/[/\\]/)[1] : '';
  const isFile = selectedFilePath ? selectedFilePath.endsWith('.csv') : false;
  const [maximizedAxis, setMaximizedAxis] = useState<string | null>(null);
  const [showModal3D, setShowModal3D] = useState<boolean>(false);
  
  const handleMaximize = (col: string) => {
    setSelectedColumn(col); // Ustawiamy oś jako aktywną, żeby pobrać dla niej dane
    setZoomRange(null);     // Resetujemy ewentualny stary zoom
    setMaximizedAxis(col);  // Otwieramy modal
  };

  const updateOverride = (key: string, value: any) => {
    setOverrideConfig((prev: any) => ({ ...(prev || diagnosis?.usedConfig || {}), [key]: value }));
  };

  const handleRecalculate = async (configToUse = overrideConfig, thermalFlag = useThermal) => {
    setIsLoading(true);
    emitAppLog('info', 'Uruchomiono przeliczanie analizy z nowymi parametrami (Symulacja)...');
    try {
      const resDiag = await fetch('http://127.0.0.1:8000/api/diagnose', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ robot_name: robotName, test_file_path: selectedFilePath, override_config: configToUse, use_thermal: thermalFlag })
      });
      if (resDiag.ok) {
        const diagData = await resDiag.json();
        if (!diagData.error) {
          setDiagnosis(diagData);
          setAvailableColumns(diagData.columns);
          if (!selectedColumn) setSelectedColumn(diagData.columns[0]);
          emitAppLog('success', 'Zakończono przeliczanie. Wykresy i limity zostały zaktualizowane.');
        } else { emitAppLog('error', `Błąd diagnozy: ${diagData.error}`); }
      }
    } catch (e) { emitAppLog('error', 'Błąd komunikacji z serwerem podczas przeliczania.'); }
    setIsLoading(false);
  };

  const handleBatchAnalysis = async () => {
    if (!selectedFilePath) return;
    const normalizedPath = selectedFilePath.replace(/\\/g, '/');
    const folderPath = normalizedPath.substring(0, normalizedPath.lastIndexOf('/'));
    
    setIsBatchLoading(true);
    emitAppLog('info', `Rozpoczęto grupową analizę folderu: ${folderPath.split('/').pop()}...`);
    
    try {
      const res = await fetch('http://127.0.0.1:8000/api/diagnose/batch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ robot_name: robotName, folder_path: folderPath, override_config: overrideConfig, use_thermal: useThermal })
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.error) { emitAppLog('error', `Błąd analizy grupowej: ${data.error}`); } 
        else { setBatchResults(data.batch_results); emitAppLog('success', `Ukończono analizę. Przetworzono ${data.batch_results.length} przejazdów.`); }
      }
    } catch (err) { emitAppLog('error', 'Błąd komunikacji podczas analizy grupowej.'); } finally { setIsBatchLoading(false); }
  };

  const exportBatchToCSV = () => {
    if (!batchResults || batchResults.length === 0) return;
    let csvContent = "Sygnal / Parametr,";
    csvContent += batchResults.map((r: any) => r.file_name.replace('.csv', '')).join(",") + "\n";
    csvContent += "Label Manualny,";
    csvContent += batchResults.map((r: any) => r.manual_label).join(",") + "\n";
    csvContent += "Label Systemu,";
    csvContent += batchResults.map((r: any) => r.auto_label).join(",") + "\n";

    availableColumns.forEach(col => {
      csvContent += `${col},`;
      csvContent += batchResults.map((r: any) => { return (r.violation_percents[col] || 0).toFixed(2); }).join(",") + "\n";
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ robot_name: robotName, test_file_path: selectedFilePath })
      });
      if (res.ok) {
        const data = await res.json();
        emitAppLog('success', `Zakończono auto-diagnostykę. Werdykt: ${data.auto_label}`);
        window.dispatchEvent(new CustomEvent('refreshFileTree'));
        handleRecalculate(overrideConfig);
      }
    } catch (err) { console.error(err); } finally { setIsAutoDiagnosing(false); }
  };

  useEffect(() => {
    if (!robotName || !isFile || !selectedFilePath) return;
    const fetchAllData = async () => {
      setIsLoading(true);
      setDiagnosis(null);
      setRobotInfo(null);
      try {
        const resInfo = await fetch('http://127.0.0.1:8000/api/robot-info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ robot_name: robotName }) });
        if (resInfo.ok) setRobotInfo(await resInfo.json());

        const resTest = await fetch('http://127.0.0.1:8000/api/file-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: selectedFilePath }) });
        if (resTest.ok) setTestData(await resTest.json());

        const resDiag = await fetch('http://127.0.0.1:8000/api/diagnose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ robot_name: robotName, test_file_path: selectedFilePath, override_config: overrideConfig, use_thermal: useThermal }) });
        
        if (resDiag.ok) {
          const diagData = await resDiag.json();
          if (diagData.error) {
            emitAppLog('error', diagData.error);
            setDiagnosis(null);
          } else {
            setDiagnosis(diagData);
            setAvailableColumns(diagData.columns);
            if (!selectedColumn) setSelectedColumn(diagData.columns[0]);
            setZoomRange(null);
          }
        }
      } catch (e) { emitAppLog('error', "Wystąpił problem z połączeniem z serwerem diagnostycznym."); }
      setIsLoading(false);
    };
    fetchAllData();
  }, [robotName, selectedFilePath]);

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
        if (robotInfo?.ref_file_info?.path) {
          const resRef = await fetch('http://127.0.0.1:8000/api/kinematics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: robotInfo.ref_file_info.path }) });
          if (resRef.ok) {
            const refData = await resRef.json();
            if (refData.trajectory) setRefTrajectory(refData.trajectory);
          }
        }
      } catch (e) { console.error(e); }
      setIsTrajectoryLoading(false);
    };
    fetchKinematics();
  }, [selectedFilePath, robotInfo]);

  const combinedData = diagnosis?.chartData?.[selectedColumn] || [];
  const displayedData = useMemo(() => {
    return zoomRange ? combinedData.filter((d: any) => d.Time >= zoomRange[0] && d.Time <= zoomRange[1]) : combinedData;
  }, [combinedData, zoomRange]);

  const statsData = diagnosis?.statsData;
  const violationAreas = diagnosis?.violationAreas?.[selectedColumn] || [];
  const violationPercent = diagnosis?.statsData?.violationPercents?.[selectedColumn] || 0;

  const activeConfig = overrideConfig || diagnosis?.usedConfig || {};
  const activeFailureThreshold = activeConfig.diagnosis_type === 'Zużycie Energii'
    ? (activeConfig.energy_threshold ?? 5.0)
    : (activeConfig.max_violation_threshold ?? 5.0);
  const checkIfCompensated = (axisName: string) => {
    if (!axisName) return false;
    const axisKey = axisName.replace('Cur', 'A'); // Termika jest pod kluczami A1..A6
    const tConf = activeConfig.thermal_config?.[axisKey];
    if (!tConf) return false;
    return tConf.a !== 0 || tConf.b !== 1; // Zwraca true, jeśli współczynniki są inne niż domyślne
  };

  const handleLiveScrub = (index: number) => {
      if (!combinedData || combinedData.length < 2) return;
      const percent = index / (combinedData.length - 1);
      
      const mainCssCalc = `calc(90px + (100% - 120px) * ${percent})`;
      if (mainChartLineRef.current) mainChartLineRef.current.style.left = mainCssCalc;
      if (diffChartLineRef.current) diffChartLineRef.current.style.left = mainCssCalc;

      const miniCssCalc = `calc(40px + (100% - 50px) * ${percent})`;
      document.querySelectorAll<HTMLElement>('.mini-sync-line').forEach(line => line.style.left = miniCssCalc);
      
      // NOWE: Obsługa suwaka wewnątrz powiększonego Modala
      document.querySelectorAll<HTMLElement>('.modal-sync-line').forEach(line => line.style.left = mainCssCalc);
    };

  const handleZoom = () => {
    if (refAreaLeft === refAreaRight || refAreaLeft === null || refAreaRight === null) { setRefAreaLeft(null); setRefAreaRight(null); return; }
    let [left, right] = [refAreaLeft, refAreaRight];
    if (left > right) [left, right] = [right, left];
    setZoomRange([left, right]); setRefAreaLeft(null); setRefAreaRight(null);
  };

  const unit = getUnit(selectedColumn);
  const isCompMax = checkIfCompensated(maximizedAxis || '');
  return (
    <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', minHeight: '100%', width: '100%', minWidth: 0 }}>
      {/* --- NAGŁÓWEK --- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ color: '#2196f3', margin: '0 0 8px 0', fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            📈 Analiza przebiegów
          </h2>
          <p style={{ color: '#888', margin: 0, fontSize: '0.9rem' }}>Porównanie z referencją i automatyczna diagnostyka.</p>
        </div>
        {selectedFilePath && isFile && (
          <button
            onClick={handleTriggerAutoDiagnosis} disabled={isAutoDiagnosing}
            style={{ padding: '8px 16px', background: 'rgba(33, 150, 243, 0.15)', color: '#2196f3', border: '1px solid rgba(33, 150, 243, 0.4)', borderRadius: '6px', fontWeight: 'bold', cursor: isAutoDiagnosing ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(33, 150, 243, 0.25)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(33, 150, 243, 0.15)'}
          >
            {isAutoDiagnosing ? '⏳ Analizowanie...' : '🧠 Wywołaj Auto-Diagnostykę'}
          </button>
        )}
      </div>
      
      {robotName ? (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          
          {/* --- INFORMACJE O ROBOCIE I SYMULACJI --- */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ background: '#141414', padding: '15px', borderRadius: '8px', border: '1px solid #2a2a2a', borderLeft: '4px solid #00bcd4' }}>
                <h4 style={{ margin: '0 0 8px 0', color: '#00bcd4', fontSize: '0.95rem' }}>🤖 Maszyna i Lokalizacja</h4>
                <div style={{ display: 'flex', gap: '20px' }}>
                  <p style={{ margin: 0, color: '#aaa', fontSize: '0.85rem' }}>Model: <strong style={{ color: '#fff' }}>{robotInfo?.config?.model || 'Nieokreślony'}</strong></p>
                  <p style={{ margin: 0, color: '#aaa', fontSize: '0.85rem' }}>Lok.: <strong style={{ color: '#fff' }}>{robotInfo?.config?.location || 'Nieokreślona'}</strong></p>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ background: '#141414', padding: '10px 15px', borderRadius: '8px', border: '1px solid #2a2a2a', borderLeft: '4px solid #4caf50', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <h4 style={{ margin: '0 0 5px 0', color: '#4caf50', fontSize: '0.8rem' }}>🟢 Referencja</h4>
                    <p style={{ margin: '0 0 8px 0', color: '#888', fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{robotInfo?.ref_file_info?.name || 'Brak pliku'}</p>
                  </div>
                  {diagnosis?.refTemps && Object.keys(diagnosis.refTemps).length > 0 && (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {Object.entries(diagnosis.refTemps).map(([axis, temp]) => (
                        <span key={axis} style={{ background: '#1a1a1a', border: '1px solid #333', color: '#aaa', fontSize: '0.65rem', padding: '2px 5px', borderRadius: '3px' }}>{axis}: <strong style={{color: '#4caf50'}}>{String(temp)}°C</strong></span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ background: '#141414', padding: '10px 15px', borderRadius: '8px', border: '1px solid #2a2a2a', borderLeft: '4px solid #ffeb3b', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <h4 style={{ margin: '0 0 5px 0', color: '#ffeb3b', fontSize: '0.8rem' }}>🟡 Przebieg Badany</h4>
                    <p style={{ margin: '0 0 8px 0', color: '#888', fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedFilePath?.split(/[/\\]/).pop()}</p>
                  </div>
                  {diagnosis?.testTemps && Object.keys(diagnosis.testTemps).length > 0 && (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {Object.entries(diagnosis.testTemps).map(([axis, temp]) => (
                        <span key={axis} style={{ background: '#1a1a1a', border: '1px solid #333', color: '#aaa', fontSize: '0.65rem', padding: '2px 5px', borderRadius: '3px' }}>{axis}: <strong style={{color: '#ffeb3b'}}>{String(temp)}°C</strong></span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ background: '#141414', padding: '15px', borderRadius: '8px', border: overrideConfig ? '1px solid #ff9800' : '1px solid #2a2a2a', display: 'flex', flexDirection: 'column', transition: 'all 0.3s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #2a2a2a', paddingBottom: '10px' }}>
                <h4 style={{ margin: 0, color: overrideConfig ? '#ff9800' : '#888', fontSize: '0.95rem' }}>
                  {overrideConfig ? '⚠️ Parametry Symulacji (What-If)' : '⚙️ Aktywne parametry diagnozy'}
                </h4>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {overrideConfig && (
                    <button 
                      onClick={() => { setOverrideConfig(null); setIsSimulating(false); handleRecalculate(null); emitAppLog('warning', 'Zresetowano do parametrów domyślnych robota.'); }}
                      style={{ background: 'transparent', color: '#f44336', border: '1px solid #f44336', borderRadius: '4px', padding: '4px 10px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold' }}
                    >✕ Resetuj</button>
                  )}
                  <button 
                    onClick={() => { if (isSimulating) handleRecalculate(); setIsSimulating(!isSimulating); }}
                    style={{ background: isSimulating ? '#4caf50' : 'transparent', color: isSimulating ? '#fff' : '#2196f3', border: isSimulating ? 'none' : '1px solid #2196f3', borderRadius: '4px', padding: '4px 10px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold' }}
                  >{isSimulating ? '▶ Przelicz zmiany' : '🔧 Modyfikuj parametry'}</button>
                </div>
              </div>

              <div style={{ marginBottom: '15px', padding: '10px', background: 'rgba(255, 152, 0, 0.1)', border: `1px solid ${useThermal ? 'rgba(255, 152, 0, 0.4)' : '#333'}`, borderRadius: '6px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: useThermal ? '#ff9800' : '#888', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 'bold' }}>
                  <input
                    type="checkbox"
                    checked={useThermal}
                    onChange={(e) => {
                      setUseThermal(e.target.checked);
                      handleRecalculate(overrideConfig, e.target.checked);
                    }}
                    style={{ accentColor: '#ff9800', width: '16px', height: '16px' }}
                  />
                  🌡️ Uwzględnij kompensację termiczną maszyny
                </label>
              </div>

              {diagnosis?.usedConfig ? (
                (() => {
                  const activeCfg = overrideConfig || diagnosis.usedConfig;
                  const inputStyle = { background: '#1a1a1a', color: '#fff', border: '1px solid #444', padding: '4px 8px', width: '70px', borderRadius: '4px', fontSize: '0.85rem', outline: 'none' };
                  
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ color: '#aaa', fontSize: '0.8rem' }}>Algorytm: </span>
                        {isSimulating ? (
                          <select value={activeCfg.diagnosis_type || 'Odchylenia'} onChange={(e) => updateOverride('diagnosis_type', e.target.value)} style={{ ...inputStyle, width: 'auto', flex: 1, borderColor: '#ff9800' }}>
                            <option value="Odchylenia">Odchylenia (Tunel %)</option><option value="Odchylenie (offsetowe)">Odchylenia (Offset staly)</option><option value="Wskaźniki">Wskaźniki (MAE, ISE...)</option><option value="Statystyka">Statystyka (k-Sigma)</option><option value="Zużycie Energii">Zużycie Energii (Suma)</option>
                          </select>
                        ) : (<strong style={{ color: '#fff', fontSize: '0.85rem' }}>{activeCfg.diagnosis_type || 'Nieznany'}</strong>)}
                      </div>

                      {activeCfg.diagnosis_type === 'Statystyka' ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...paramStyle }}><span>Mnożnik k-Sigma (σ):</span>{isSimulating ? <input type="number" step="0.1" value={activeCfg.sigma_multiplier ?? 3.0} onChange={e => updateOverride('sigma_multiplier', parseFloat(e.target.value))} style={inputStyle} /> : <strong>{activeCfg.sigma_multiplier} x</strong>}</div>
                      ) : activeCfg.diagnosis_type === 'Zużycie Energii' ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...paramStyle }}>
                          <span>Dopuszczalny wzrost energii (%):</span>
                          {isSimulating ? <input type="number" min="0" step="0.1" value={activeCfg.energy_threshold ?? 5.0} onChange={e => updateOverride('energy_threshold', parseFloat(e.target.value))} style={inputStyle} /> : <strong>{activeCfg.energy_threshold ?? 5.0} %</strong>}
                        </div>
                      ) : activeCfg.diagnosis_type === 'Wskaźniki' ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }}>
                          {['mae', 'mse', 'iae', 'ise'].map(metric => (
                            <div key={metric} style={{ display: 'flex', flexDirection: 'column', ...paramStyle, padding: '4px 8px' }}>
                              <span style={{ fontSize: '0.7rem' }}>{metric.toUpperCase()}:</span>
                              {isSimulating ? <input type="number" step="0.1" value={activeCfg[`${metric}_threshold`] ?? 1.0} onChange={e => updateOverride(`${metric}_threshold`, parseFloat(e.target.value))} style={{ ...inputStyle, width: '100%', marginTop: '2px' }} /> : <strong>{activeCfg[`${metric}_threshold`]}x</strong>}
                            </div>
                          ))}
                        </div>
                      ) : activeCfg.diagnosis_type === 'Odchylenie (offsetowe)' ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', ...paramStyle, padding: '4px 8px' }}><span>Offset A (°):</span>{isSimulating ? <input type="number" step="0.05" value={activeCfg.a_offset_threshold ?? 0.1} onChange={e => updateOverride('a_offset_threshold', parseFloat(e.target.value))} style={{...inputStyle, width: '100%'}} /> : <strong>{activeCfg.a_offset_threshold} °</strong>}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', ...paramStyle, padding: '4px 8px' }}><span>Offset Cur (%):</span>{isSimulating ? <input type="number" step="0.5" value={activeCfg.cur_offset_threshold ?? 5.0} onChange={e => updateOverride('cur_offset_threshold', parseFloat(e.target.value))} style={{...inputStyle, width: '100%'}} /> : <strong>{activeCfg.cur_offset_threshold} %</strong>}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', ...paramStyle, padding: '4px 8px', border: '1px solid rgba(244,67,54,0.3)' }}><span style={{color: '#f44336'}}>Max Awarii:</span>{isSimulating ? <input type="number" step="1" value={activeCfg.max_violation_threshold ?? 5.0} onChange={e => updateOverride('max_violation_threshold', parseFloat(e.target.value))} style={{...inputStyle, width: '100%'}} /> : <strong style={{ color: '#f44336' }}>{activeCfg.max_violation_threshold} %</strong>}</div>
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', ...paramStyle, padding: '4px 8px' }}><span>Tuning:</span>{isSimulating ? <select value={activeCfg.tuning_mode ?? 'okno'} onChange={e => updateOverride('tuning_mode', e.target.value)} style={{...inputStyle, width:'100%'}}><option value="chwilowy">Pkt.</option><option value="okno">Okno</option><option value="srednia">Średnia</option></select> : <strong style={{fontSize:'0.75rem', marginTop:'4px'}}>{activeCfg.tuning_mode}</strong>}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', ...paramStyle, padding: '4px 8px' }}><span>Tol. A (%):</span>{isSimulating ? <input type="number" step="0.5" value={activeCfg.a_deviation_threshold ?? 2.0} onChange={e => updateOverride('a_deviation_threshold', parseFloat(e.target.value))} style={{...inputStyle, width: '100%'}} /> : <strong style={{marginTop:'4px'}}>{activeCfg.a_deviation_threshold} %</strong>}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', ...paramStyle, padding: '4px 8px' }}><span>Tol. Cur (%):</span>{isSimulating ? <input type="number" step="0.5" value={activeCfg.cur_deviation_threshold ?? 2.0} onChange={e => updateOverride('cur_deviation_threshold', parseFloat(e.target.value))} style={{...inputStyle, width: '100%'}} /> : <strong style={{marginTop:'4px'}}>{activeCfg.cur_deviation_threshold} %</strong>}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', ...paramStyle, padding: '4px 8px' }}><span>Deadband:</span>{isSimulating ? <input type="number" step="0.01" value={activeCfg.a_deadband_threshold ?? 0.05} onChange={e => updateOverride('a_deadband_threshold', parseFloat(e.target.value))} style={{...inputStyle, width: '100%'}} /> : <strong style={{marginTop:'4px'}}>{activeCfg.a_deadband_threshold}</strong>}</div>
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (<p style={{ color: '#555', fontSize: '0.8rem', margin: 0 }}>Brak wczytanych parametrów.</p>)}
            </div>
          </div>
                
{/* --- TABELA WSKAŹNIKÓW (MAE, MSE...) --- */}
          {combinedData.length > 0 && isFile && statsData && (
            <div style={{ marginBottom: '15px' }}>
              
              {/* NAGŁÓWEK I PRZYCISK ZWIJANIA */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ color: '#00bcd4', margin: 0, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📊 Szczegółowe wskaźniki błędu (Opcjonalnie)
                </h3>
                <button 
                  onClick={() => setShowStatsTable(!showStatsTable)}
                  style={{ background: 'transparent', color: '#00bcd4', border: '1px solid #00bcd4', borderRadius: '4px', padding: '4px 10px', fontSize: '0.8rem', cursor: 'pointer', transition: '0.2s', fontWeight: 'bold' }}
                >
                  {showStatsTable ? '▲ Ukryj tabelę' : '▼ Pokaż tabelę'}
                </button>
              </div>

              {/* ZAWARTOŚĆ TABELI (Z płynną animacją CSS) */}
              <div style={{ 
                maxHeight: showStatsTable ? '800px' : '0px', 
                opacity: showStatsTable ? 1 : 0, 
                overflow: 'hidden', 
                transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
              }}>
                <div style={{ background: '#141414', padding: '1rem', borderRadius: '8px', border: '1px solid #2a2a2a', overflowX: 'auto', marginTop: showStatsTable ? '5px' : '0' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', color: '#fff', fontSize: '0.85rem' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '6px', borderBottom: '1px solid #333', borderRight: '1px solid #333' }}></th>
                        <th colSpan={statsData.aCols.length} style={{ padding: '6px', borderBottom: '1px solid #333', borderRight: '1px solid #333', color: '#888' }}>Odchylenia Kątowe [°]</th>
                        <th colSpan={statsData.curCols.length} style={{ padding: '6px', borderBottom: '1px solid #333', color: '#888' }}>Odchylenia Prądowe [%]</th>
                      </tr>
                      <tr>
                        <th style={{ padding: '6px', borderBottom: '1px solid #333', borderRight: '1px solid #333', color: '#666', textAlign: 'left' }}>Metryka</th>
                        {statsData?.aCols?.map((c: string) => <th key={c} style={{ padding: '6px', borderBottom: '1px solid #333', borderRight: c === statsData.aCols[statsData.aCols.length - 1] ? '1px solid #333' : 'none', color: '#aaa' }}>{c}</th>)}
                        {statsData?.curCols?.map((c: string) => <th key={c} style={{ padding: '6px', borderBottom: '1px solid #333', color: '#aaa' }}>{c}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {METRICS.map(metric => (
                        <tr key={metric}>
                          <td style={{ padding: '6px', borderBottom: '1px solid #222', borderRight: '1px solid #333', textAlign: 'left', fontWeight: 'bold', color: '#00bcd4' }}>{metric}</td>
                          
                          {/* PĘTLA DLA KĄTÓW (A1-A6) */}
                          {statsData.aCols.map((c: any) => { 
                              const val = statsData.errors[metric][c]; 
                              const limit = statsData.calculatedThresholds?.[metric]?.[c] || 0;
                              const isExceeded = statsData.exceededLimits?.[metric]?.[c] || false;
                              const isMetricsMode = diagnosis?.globalDiagnosis?.diagType === 'Wskaźniki';
                              
                              const diff = limit - val;
                              const hoverText = isMetricsMode 
                                ? (isExceeded ? `❌ Przekroczono limit o ${Math.abs(diff).toFixed(4)}` : `✅ Brakuje ${diff.toFixed(4)} do limitu`) 
                                : '';

                              const baseColor = getErrorColor(val, statsData.maxes.A[metric]); 
                              // Wymuszenie ostrej czerwieni (Hue: 0) jeśli przekroczono limit, w przeciwnym razie użyj gradientu (do pomarańczu)
                              const bgColor = isExceeded ? 'hsl(0, 90%, 55%)' : baseColor; 
                              const lightBg = bgColor.replace('hsl', 'hsla').replace(')', ', 0.15)');
                              
                              return (
                              <td key={c} title={hoverText} style={{ padding: '4px', borderBottom: '1px solid #222', borderRight: c === statsData.aCols[statsData.aCols.length - 1] ? '1px solid #333' : 'none', cursor: isMetricsMode ? 'help' : 'default' }}>
                                  <div style={{ background: `linear-gradient(180deg, #1a1a1a 0%, ${lightBg} 100%)`, borderBottom: `2px solid ${bgColor}`, padding: '4px', borderRadius: '4px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', color: isExceeded ? '#f44336' : '#fff' }}>
                                    <span style={{ fontWeight: isExceeded ? 'bold' : 'normal' }}>{val.toFixed(4)}</span>
                                    {isMetricsMode && (
                                      <span style={{ fontSize: '0.75rem', color: isExceeded ? '#f44336' : '#888', whiteSpace: 'nowrap' }}>/ {limit.toFixed(4)}</span>
                                    )}
                                    {isExceeded && <span style={{ fontSize: '0.9rem' }}>⚠️</span>}
                                  </div>
                              </td>
                              ); 
                          })}
                          
                          {/* PĘTLA DLA PRĄDÓW (Cur1-Cur6) */}
                          {statsData.curCols.map((c: any) => { 
                              const val = statsData.errors[metric][c]; 
                              const limit = statsData.calculatedThresholds?.[metric]?.[c] || 0;
                              const isExceeded = statsData.exceededLimits?.[metric]?.[c] || false;
                              const isMetricsMode = diagnosis?.globalDiagnosis?.diagType === 'Wskaźniki';
                              
                              const diff = limit - val;
                              const hoverText = isMetricsMode 
                                ? (isExceeded ? `❌ Przekroczono limit o ${Math.abs(diff).toFixed(4)}` : `✅ Brakuje ${diff.toFixed(4)} do limitu`) 
                                : '';

                              const baseColor = getErrorColor(val, statsData.maxes.Cur[metric]); 
                              const bgColor = isExceeded ? 'hsl(0, 90%, 55%)' : baseColor; 
                              const lightBg = bgColor.replace('hsl', 'hsla').replace(')', ', 0.15)');
                              
                              return (
                              <td key={c} title={hoverText} style={{ padding: '4px', borderBottom: '1px solid #222', cursor: isMetricsMode ? 'help' : 'default' }}>
                                  <div style={{ background: `linear-gradient(180deg, #1a1a1a 0%, ${lightBg} 100%)`, borderBottom: `2px solid ${bgColor}`, padding: '4px', borderRadius: '4px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px', color: isExceeded ? '#f44336' : '#fff' }}>
                                    <span style={{ fontWeight: isExceeded ? 'bold' : 'normal' }}>{val.toFixed(4)}</span>
                                    {isMetricsMode && (
                                      <span style={{ fontSize: '0.75rem', color: isExceeded ? '#f44336' : '#888', whiteSpace: 'nowrap' }}>/ {limit.toFixed(4)}</span>
                                    )}
                                    {isExceeded && <span style={{ fontSize: '0.9rem' }}>⚠️</span>}
                                  </div>
                              </td>
                              ); 
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
              
          {/* --- SEGMENTED CONTROL (PRZEŁĄCZANIE WIDOKU) --- */}
          <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', background: '#141414', padding: '10px 15px', borderRadius: '8px', border: '1px solid #2a2a2a', marginBottom: '15px' }}>
            
            <div style={{ display: 'flex', background: '#111', borderRadius: '6px', padding: '4px', border: '1px solid #333' }}>
              {[
                { id: 'combined', icon: '📊', label: 'Wspólny (Siatka osi)' },
                { id: 'batch', icon: '📑', label: 'Folder (Batch)' }
              ].map(mode => (
                <button 
                  key={mode.id}
                  onClick={() => { setViewMode(mode.id as any); if (mode.id === 'batch' && !batchResults) handleBatchAnalysis(); }}
                  style={{
                    background: viewMode === mode.id ? '#2a2a2a' : 'transparent',
                    color: viewMode === mode.id ? '#fff' : '#888',
                    border: 'none', borderRadius: '4px', padding: '6px 12px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: viewMode === mode.id ? 'bold' : 'normal',
                    display: 'flex', alignItems: 'center', gap: '6px', transition: '0.2s', boxShadow: viewMode === mode.id ? '0 1px 3px rgba(0,0,0,0.5)' : 'none'
                  }}
                >
                  <span style={{ opacity: viewMode === mode.id ? 1 : 0.5 }}>{mode.icon}</span> {mode.label}
                </button>
              ))}
            </div>
          </div>

          {/* WIDOK: BATCH */}
          {viewMode === 'batch' ? (
            <div style={{ background: '#141414', padding: '1.5rem', borderRadius: '8px', border: '1px solid #2a2a2a', width: 'calc(100vw - 350px)', maxWidth: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <div>
                  <h3 style={{ color: '#2196f3', margin: 0 }}>Zestawienie Zbiorcze Przejazdów</h3>
                  <span style={{ color: '#888', fontSize: '0.85rem' }}>Automatyczna diagnoza wielu plików bazująca na limicie awarii.</span>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {batchResults && (
                    <button onClick={exportBatchToCSV} style={{ background: 'transparent', color: '#4caf50', border: '1px solid #4caf50', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}>
                      📥 CSV
                    </button>
                  )}
                  <button onClick={handleBatchAnalysis} disabled={isBatchLoading} style={{ background: '#2196f3', color: 'white', padding: '6px 12px', border: 'none', borderRadius: '4px', cursor: isBatchLoading ? 'wait' : 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}>
                    {isBatchLoading ? '⏳ Przeliczanie...' : '🔄 Odśwież'}
                  </button>
                </div>
              </div>

              {batchResults ? (
                <div style={{ display: 'block', width: '100%', overflowX: 'auto', borderRadius: '6px', border: '1px solid #333' }}>
                  <table style={{ borderCollapse: 'collapse', color: '#fff', fontSize: '0.75rem', whiteSpace: 'nowrap', minWidth: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '10px', borderBottom: '1px solid #333', borderRight: '1px solid #333', background: '#1a1a1a', textAlign: 'left', minWidth: '160px', position: 'sticky', left: 0, zIndex: 2 }}>
                          Sygnał / Parametr
                        </th>
                        {batchResults.map((res: any, idx: number) => (
                          <th key={idx} style={{ padding: '10px', borderBottom: '1px solid #333', borderRight: '1px solid #222', background: '#1a1a1a', textAlign: 'center', color: '#aaa', fontWeight: 'normal' }}>
                            {res.file_name.replace('.csv', '')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ padding: '10px', borderBottom: '1px solid #333', borderRight: '1px solid #333', background: '#1a1a1a', fontWeight: 'bold', position: 'sticky', left: 0, zIndex: 1 }}>
                          👤 Label Manualny
                        </td>
                        {batchResults.map((res: any, idx: number) => (
                          <td key={`man-${idx}`} style={{ padding: '10px', borderBottom: '1px solid #333', borderRight: '1px solid #222', textAlign: 'center', color: res.manual_label === 'OK' ? '#4caf50' : res.manual_label === 'AWARIA' ? '#f44336' : '#888', background: '#111' }}>
                            {res.manual_label}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={{ padding: '10px', borderBottom: '2px solid #444', borderRight: '1px solid #333', background: '#1a1a1a', fontWeight: 'bold', position: 'sticky', left: 0, zIndex: 1 }}>
                          🤖 Label Systemu
                        </td>
                        {batchResults.map((res: any, idx: number) => (
                          <td key={`auto-${idx}`} style={{ padding: '10px', borderBottom: '2px solid #444', borderRight: '1px solid #222', textAlign: 'center', color: res.auto_label === 'OK' ? '#4caf50' : res.auto_label === 'AWARIA' ? '#f44336' : '#888', background: '#111' }}>
                            {res.auto_label}
                          </td>
                        ))}
                      </tr>

                      {availableColumns.map((colName) => {
                        const activeThreshold = activeFailureThreshold;
                        return (
                          <tr key={colName}>
                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #222', borderRight: '1px solid #333', background: '#1a1a1a', position: 'sticky', left: 0, zIndex: 1, color: '#aaa' }}>
                              {colName}
                            </td>
                            {batchResults.map((res: any, idx: number) => {
                              const val = res.violation_percents[colName] || 0;
                              const isError = val >= activeThreshold;
                              const ratio = Math.min(val / activeThreshold, 1.0);
                              const bgColor = val === 0 ? '#111' : `rgba(244, 67, 54, ${ratio * 0.5})`;

                              return (
                                <td key={`${colName}-${idx}`} style={{ padding: '8px 10px', borderBottom: '1px solid #222', borderRight: '1px solid #222', textAlign: 'center', color: isError ? '#fff' : '#888', fontWeight: isError ? 'bold' : 'normal', background: bgColor }}>
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

              {/* WYKRES TRENDU */}
              {batchResults && batchResults.length > 0 && (
                <div style={{ marginTop: '20px', background: '#111', padding: '15px', borderRadius: '6px', border: '1px solid #333' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                    <h4 style={{ color: '#2196f3', margin: 0, fontSize: '0.95rem' }}>📈 Trend degradacji</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <label style={{ color: '#ff9800', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={showBatchTemp} onChange={e => setShowBatchTemp(e.target.checked)} style={{ accentColor: '#ff9800' }} />
                        Pokaż temperaturę
                      </label>
                      <label style={{ color: '#9c27b0', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={showBatchRaw} onChange={e => setShowBatchRaw(e.target.checked)} style={{ accentColor: '#9c27b0' }} />
                        Surowe awarie (bez komp.)
                      </label>
                      {showBatchTemp && (
                        <select
                          value={batchTempSelection} onChange={e => setBatchTempSelection(e.target.value)}
                          style={{ background: '#1a1a1a', color: '#ff9800', border: '1px solid #444', padding: '4px 8px', borderRadius: '4px', outline: 'none', fontSize: '0.85rem' }}
                        >
                          <option value="Średnia">∑ Średnia Temp.</option>
                          <option value="A1">A1</option><option value="A2">A2</option><option value="A3">A3</option>
                          <option value="A4">A4</option><option value="A5">A5</option><option value="A6">A6</option>
                        </select>
                      )}
                      
                      <div style={{ width: '1px', height: '20px', background: '#333' }}></div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: '#888', fontSize: '0.8rem' }}>Sygnał:</span>
                        <select 
                          value={batchTrendSelection} onChange={e => setBatchTrendSelection(e.target.value)}
                          style={{ background: '#1a1a1a', color: '#fff', border: '1px solid #444', padding: '4px 8px', borderRadius: '4px', outline: 'none', fontSize: '0.85rem' }}
                        >
                          <option value="Ogólny">∑ Trend Ogólny</option>
                          {availableColumns.map(col => <option key={col} value={col}>{col}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div style={{ height: '250px', width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={batchResults.map((res: any) => {
                            let wartosc = 0;
                            let wartoscRaw = 0; // NOWA ZMIENNA
                            
                            if (batchTrendSelection === 'Ogólny') {
                              const violationValues = Object.values(res.violation_percents || {}) as number[];
                              const nonZeroValues = violationValues.filter(v => typeof v === 'number' && v > 0);
                              wartosc = nonZeroValues.length > 0 ? nonZeroValues.reduce((sum, val) => sum + val, 0) / nonZeroValues.length : 0;
                              
                              // WYLICZENIE ŚREDNIEJ SUROWEJ
                              const violationValuesRaw = Object.values(res.violation_percents_raw || {}) as number[];
                              const nonZeroValuesRaw = violationValuesRaw.filter(v => typeof v === 'number' && v > 0);
                              wartoscRaw = nonZeroValuesRaw.length > 0 ? nonZeroValuesRaw.reduce((sum, val) => sum + val, 0) / nonZeroValuesRaw.length : 0;
                            } else { 
                              wartosc = res.violation_percents[batchTrendSelection] || 0; 
                              wartoscRaw = res.violation_percents_raw?.[batchTrendSelection] || 0;
                            }
                            
                            let tempVal = 0;
                            if (res.test_temps && Object.keys(res.test_temps).length > 0) {
                                if (batchTempSelection === 'Średnia') {
                                    const vals = Object.values(res.test_temps) as number[];
                                    if (vals.length > 0) tempVal = vals.reduce((sum, val) => sum + val, 0) / vals.length;
                                } else {
                                    tempVal = res.test_temps[batchTempSelection] || 0;
                                }
                            }

                            return { 
                              name: res.file_name.replace('przejazd_', 'P').replace('.csv', ''), 
                              wartosc: parseFloat(wartosc.toFixed(2)),
                              wartoscRaw: parseFloat(wartoscRaw.toFixed(2)), // WSTRZYKNIĘCIE DANYCH
                              temperatura: parseFloat(tempVal.toFixed(1))
                            };
                          })}
                          margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
                        >
                          <CartesianGrid strokeDasharray="2 2" stroke="#222" vertical={false} />
                          <XAxis dataKey="name" stroke="#666" angle={-45} textAnchor="end" height={60} fontSize={10} />
                          <YAxis yAxisId="left" stroke="#666" fontSize={10} unit="%" />
                          {showBatchTemp && <YAxis yAxisId="right" orientation="right" stroke="#ff9800" fontSize={10} unit="°C" domain={['auto', 'auto']} />}
                           
                          <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', fontSize: '0.85rem', borderRadius: '6px' }} />
                          <Legend verticalAlign="top" height={36} iconSize={8} wrapperStyle={CHART_LEGEND_STYLE} />
                          <Line yAxisId="left" type="linear" name={CHART_SERIES.failureThreshold.name} dataKey={() => overrideConfig?.max_violation_threshold || diagnosis?.usedConfig?.max_violation_threshold || 5.0} stroke={CHART_SERIES.failureThreshold.color} strokeWidth={CHART_SERIES.failureThreshold.width} strokeDasharray={CHART_SERIES.failureThreshold.dash} dot={false} activeDot={false} isAnimationActive={false} />
                          
                          <Line yAxisId="left" type="monotone" name={CHART_SERIES.failureRate.name} dataKey="wartosc" stroke={CHART_SERIES.failureRate.color} strokeWidth={CHART_SERIES.failureRate.width} dot={false} activeDot={false} />
                          {showBatchRaw && <Line yAxisId="left" type="monotone" name={CHART_SERIES.rawFailureRate.name} dataKey="wartoscRaw" stroke={CHART_SERIES.rawFailureRate.color} strokeWidth={CHART_SERIES.rawFailureRate.width} strokeDasharray={CHART_SERIES.rawFailureRate.dash} dot={false} activeDot={false} />}
                          {showBatchTemp && <Line yAxisId="right" type="monotone" name={CHART_SERIES.temperature.name} dataKey="temperatura" stroke={CHART_SERIES.temperature.color} strokeWidth={CHART_SERIES.temperature.width} strokeDasharray={CHART_SERIES.temperature.dash} dot={false} activeDot={false} />}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                
              )}
            </div>
            
            ):(
            
        /* WIDOK: WSPÓLNY (Siatka Mini-wykresów) */
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: '1rem' }}>
            {(() => {
              const allCols = [...(statsData?.aCols || []), ...(statsData?.curCols || [])];
              const isAllExpanded = expandedResiduals.length > 0 && expandedResiduals.length === allCols.length;
              
              const toggleAll = () => setExpandedResiduals(isAllExpanded ? [] : allCols);
              const toggleSingle = (col: string) => setExpandedResiduals(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);

              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginBottom: '10px' }}>
                    <button 
                      onClick={() => setShowRawDiff(!showRawDiff)} 
                      style={{ background: showRawDiff ? 'rgba(156, 39, 176, 0.2)' : 'transparent', color: showRawDiff ? '#e1bee7' : '#888', border: `1px solid ${showRawDiff ? '#9c27b0' : '#444'}`, borderRadius: '4px', padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', transition: '0.2s' }}
                    >
                      👁️ {showRawDiff ? 'Ukryj surowe odchylenie' : 'Pokaż surowe odchylenie'}
                    </button>
                    <button 
                      onClick={toggleAll} 
                      style={{ background: 'rgba(33, 150, 243, 0.1)', color: '#2196f3', border: '1px solid rgba(33, 150, 243, 0.3)', borderRadius: '4px', padding: '6px 12px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', transition: '0.2s' }}
                    >
                      {isAllExpanded ? '▲ Zwiń wszystkie residua' : '▼ Rozwiń wszystkie residua'}
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    
                    {/* KOLUMNA LEWA: OSIE KĄTOWE */}
                    <div>
                      <h4 style={{ color: '#00bcd4', textAlign: 'center', borderBottom: '1px solid #2a2a2a', paddingBottom: '8px', marginTop: 0 }}>Osie Kątowe (A)</h4>
                      {statsData?.aCols?.map((col: string) => (
                        <MiniAnalizaChart 
                          key={col} 
                          title={col} 
                          unit="°" 
                          data={diagnosis?.chartData?.[col] || []} 
                          
                          /* Używamy limitu z symulacji (jeśli włączona) lub bazowego */
                          failureThreshold={activeFailureThreshold} 
                          
                          showTimeMarker={showTimeMarker} 
                          violationAreas={diagnosis?.violationAreas?.[col]} 
                          violationPercent={diagnosis?.statsData?.violationPercents?.[col] || 0}
                          isExpanded={expandedResiduals.includes(col)}
                          onToggleExpand={() => toggleSingle(col)}
                          showRawDiff={showRawDiff}
                          onMaximize={() => handleMaximize(col)}
                          
                          /* KLUCZOWE: Wstrzyknięcie strategii i danych statystycznych */
                          diagType={diagnosis?.globalDiagnosis?.diagType} 
                          statsData={diagnosis?.statsData}              
                          isCompensated={checkIfCompensated(col)}  
                        />
                      ))}
                    </div>

                    {/* KOLUMNA PRAWA: PRĄDY SILNIKÓW */}
                    <div>
                      <h4 style={{ color: '#ffeb3b', textAlign: 'center', borderBottom: '1px solid #2a2a2a', paddingBottom: '8px', marginTop: 0 }}>Prądy Silników (Cur)</h4>
                      {statsData?.curCols?.map((col: string) => (
                        <MiniAnalizaChart 
                          key={col} 
                          title={col} 
                          unit="%" 
                          data={diagnosis?.chartData?.[col] || []} 
                          
                          failureThreshold={activeFailureThreshold} 
                          
                          showTimeMarker={showTimeMarker} 
                          violationAreas={diagnosis?.violationAreas?.[col]} 
                          violationPercent={diagnosis?.statsData?.violationPercents?.[col] || 0}
                          isExpanded={expandedResiduals.includes(col)}
                          onToggleExpand={() => toggleSingle(col)}
                          showRawDiff={showRawDiff}
                          onMaximize={() => handleMaximize(col)}
                          
                          /* KLUCZOWE: Muszą być w OBU pętlach! */
                          diagType={diagnosis?.globalDiagnosis?.diagType} 
                          statsData={diagnosis?.statsData}                
                        />
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
          )}
        </div>
      ) : ( <div style={{ marginTop: '2rem', padding: '3rem', border: '2px dashed #2a2a2a', borderRadius: '12px', color: '#666', textAlign: 'center' }}>Wybierz robota z drzewka plików, aby załadować przebieg...</div> )}
  
      {/* ========================================================= */}
      {/* MODAL PEŁNOEKRANOWY (ZOOM DLA WIDOKU WSPÓLNEGO)             */}
      {/* ========================================================= */}
      
      {maximizedAxis && (
        <>
        
          {/* DEFINICJA PŁYNNYCH ANIMACJI CSS */}
          <style>
            {`
              @keyframes modalBackdropFade {
                from { opacity: 0; backdrop-filter: blur(0px); }
                to { opacity: 1; backdrop-filter: blur(8px); }
              }
              @keyframes modalContentPop {
                from { opacity: 0; transform: scale(0.95) translateY(20px); }
                to { opacity: 1; transform: scale(1) translateY(0); }
              }
            `}
          </style>
          
          {/* TŁO MODALA Z ANIMACJĄ FADE */}
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', zIndex: 4000, display: 'flex', justifyContent: 'center', alignItems: 'center', animation: 'modalBackdropFade 0.3s ease-out forwards' }}>
            
            {/* GŁÓWNE OKNO Z ANIMACJĄ POP-UP */}
            <div style={{ width: '95%', maxWidth: '1600px', height: '90vh', background: '#111', borderRadius: '12px', border: '1px solid #333', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.8)', animation: 'modalContentPop 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
              
              {/* NAGŁÓWEK MODALA */}
              <div style={{ padding: '15px 20px', background: '#1a1a1a', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <h2 style={{ margin: 0, color: '#2196f3', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    ⛶ Szczegółowa analiza osi: {maximizedAxis} <span style={{opacity: 0.5, fontSize: '1rem'}}>[{unit}]</span>
                  </h2>
                  
                  {/* DYNAMICZNY ZNACZNIK STATUSU (WSKAŹNIKI I ODCHYLENIA) W MODALU */}
                  {(() => {
                    const diagType = diagnosis?.globalDiagnosis?.diagType;
                    const stats = diagnosis?.statsData;
                    const fThreshold = activeFailureThreshold;
                    const vPercent = stats?.violationPercents?.[maximizedAxis || ''] || 0;
                    

                    let bText = '✅ Pracuje prawidłowo';
                    let bColor = 'rgba(76, 175, 80, 0.2)';
                    let bBorder = '#4caf50';

                    if (diagType === 'Wskaźniki' && stats) {
                        const metrics = ['ISE', 'MSE', 'IAE', 'MAE'];
                        for (let m of metrics) {
                            if (stats.exceededLimits?.[m]?.[maximizedAxis || '']) {
                                const val = stats.errors[m][maximizedAxis || ''];
                                const limit = stats.calculatedThresholds[m][maximizedAxis || ''];
                                bText = `❌ Awaria (Przekroczono ${m}: ${val.toFixed(2)} > Limit: ${limit.toFixed(2)})`;
                                bColor = 'rgba(244, 67, 54, 0.2)';
                                bBorder = '#f44336';
                                break;
                            }
                        }
                    } else {
                        if (vPercent >= fThreshold) { bText = `❌ Awaria (Błąd: ${vPercent.toFixed(1)}%)`; bColor = 'rgba(244, 67, 54, 0.2)'; bBorder = '#f44336'; }
                        else if (vPercent > 0) { bText = `⚠️ Ostrzeżenie (Błąd: ${vPercent.toFixed(1)}%)`; bColor = 'rgba(255, 152, 0, 0.2)'; bBorder = '#ff9800'; }
                    }

                    return (
                      <span style={{ background: bColor, color: bBorder, border: `1px solid ${bBorder}`, padding: '4px 10px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold', marginLeft: '5px' }}>
                        {bText}
                      </span>
                    );
                  })()}
                  
                  {/* PRZENIESIONY PRZYCISK STATYSTYK */}
                  <button 
                    onClick={() => setShowParamsModal(true)} 
                    style={{ background: 'rgba(33, 150, 243, 0.1)', color: '#2196f3', border: '1px solid rgba(33, 150, 243, 0.3)', borderRadius: '4px', padding: '4px 10px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold', marginLeft: '10px' }}
                  >
                    📊 Parametry statystyczne
                  </button>
                </div>
                <button onClick={() => { setMaximizedAxis(null); setZoomRange(null); setShowModal3D(false); }} style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: '2.5rem', cursor: 'pointer', transition: '0.2s', lineHeight: '1rem' }} onMouseEnter={e=>e.currentTarget.style.color='#fff'} onMouseLeave={e=>e.currentTarget.style.color='#aaa'}>×</button>
              </div>

              {/* ZAWARTOŚĆ MODALA (Wykresy | Pionowy Przycisk | Panel 3D) */}
              <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                
                {/* LEWA STRONA (Wykresy) */}
                <div style={{ padding: '20px', overflowY: 'auto', flex: 1, transition: 'all 0.3s' }}>
                   {/* 1. GÓRNY WYKRES W MODALU */}
                   <div style={{ height: '35vh', background: '#141414', padding: '1rem', borderRadius: '8px', border: '1px solid #2a2a2a', marginBottom: '20px', position: 'relative' }}>
                     {showTimeMarker && (
                        <div className="modal-sync-line" style={{ position: 'absolute', top: 15, bottom: 25, width: '2px', backgroundColor: '#2196f3', left: '90px', zIndex: 100, pointerEvents: 'none', boxShadow: '0 0 8px rgba(33,150,243,0.5)' }} />
                     )}
                     <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={displayedData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }} onMouseDown={(e) => e && setRefAreaLeft(e.activeLabel as number)} onMouseMove={(e) => refAreaLeft && e && setRefAreaRight(e.activeLabel as number)} onMouseUp={handleZoom} style={{ userSelect: 'none', cursor: 'crosshair' }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                          <XAxis dataKey="Time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => v.toFixed(1) + 's'} stroke="#555" hide />
                          <YAxis width={62} domain={['auto', 'auto']} stroke="#555" tick={{fontSize: 11}} label={{ value: unit, angle: -90, position: 'insideLeft', fill: '#555', fontSize: 12 }} />
                          <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#333', borderRadius: '6px' }} labelFormatter={(l) => `Czas: ${Number(l).toFixed(3)}s`} formatter={(v: any, name: any) => { 
                            const strName = String(name);
                            
                            if (strName === "Badany") return [`${Number(v).toFixed(2)} ${unit}`, CHART_SERIES.raw.name];
                            if (strName === "BadanyKomp") return [`${Number(v).toFixed(2)} ${unit}`, isCompMax ? CHART_SERIES.compensated.name : CHART_SERIES.tested.name];
                            if (Array.isArray(v)) return [`od ${v[0].toFixed(2)} do ${v[1].toFixed(2)} ${unit}`, name]; 
                            return [`${Number(v).toFixed(2)} ${unit}`, name];
                             
                          }} />
                          <Legend verticalAlign="top" height={36} iconSize={8} wrapperStyle={CHART_LEGEND_STYLE} />
                          {violationAreas?.map((area: any, idx: any) => (<ReferenceArea key={`violation-${idx}`} x1={area.start} x2={area.end} fill="#f44336" fillOpacity={0.2} strokeOpacity={0} />))}
                          
                          <Line name={CHART_SERIES.reference.name} type="monotone" dataKey="Referencja" stroke={CHART_SERIES.reference.color} strokeWidth={CHART_SERIES.reference.width} dot={false} isAnimationActive={false} />
                          
                          {showRawDiff && isCompMax && (
                            <Line name={CHART_SERIES.raw.name} type="monotone" dataKey="Badany" stroke={CHART_SERIES.raw.color} strokeWidth={CHART_SERIES.raw.width} strokeDasharray={CHART_SERIES.raw.dash} dot={false} isAnimationActive={false} opacity={0.8} />
                          )}
                          
                          <Line name={isCompMax ? CHART_SERIES.compensated.name : CHART_SERIES.tested.name} type="monotone" dataKey="BadanyKomp" stroke={CHART_SERIES.tested.color} strokeWidth={CHART_SERIES.tested.width} dot={false} isAnimationActive={false} />
                          {refAreaLeft !== null && refAreaRight !== null && <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0} fill="#2196f3" fillOpacity={0.2} />}
                        </ComposedChart>
                     </ResponsiveContainer>
                   </div>

                   {/* 2. DOLNY WYKRES RÓŻNICOWY W MODALU */}
                   <h3 style={{ color: CHART_SERIES.diff.color, marginBottom: '0.5rem', borderBottom: '1px solid #333', paddingBottom: '5px', fontSize: '1rem' }}>Różnica sygnałów w powiększeniu</h3>
                   <div style={{ height: '35vh', background: '#141414', padding: '1rem', borderRadius: '8px', border: '1px solid #2a2a2a', position: 'relative' }}>
                     {showTimeMarker && (
                        <div className="modal-sync-line" style={{ position: 'absolute', top: 15, bottom: 25, width: '2px', backgroundColor: '#2196f3', left: '90px', zIndex: 100, pointerEvents: 'none', boxShadow: '0 0 8px rgba(33,150,243,0.5)' }} />
                     )}
                     <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={displayedData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }} onMouseDown={(e) => e && setRefAreaLeft(e.activeLabel as number)} onMouseMove={(e) => refAreaLeft && e && setRefAreaRight(e.activeLabel as number)} onMouseUp={handleZoom} style={{ userSelect: 'none', cursor: 'crosshair' }}>
                          <CartesianGrid strokeDasharray="2 2" stroke="#222" vertical={false} />
                          <XAxis dataKey="Time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => v.toFixed(1) + 's'} stroke="#555" tick={{fontSize: 11}} label={{ value: 'Czas nagrania [s]', position: 'insideBottom', offset: -10, fill: '#888', fontSize: 11 }} />
                          <YAxis width={62} domain={['auto', 'auto']} stroke="#555" tick={{fontSize: 11}} label={{ value: unit, angle: -90, position: 'insideLeft', fill: '#555', fontSize: 12 }} />
                          <Tooltip content={<DiffChartTooltip unit={unit} />} />
                          {violationAreas?.map((area: any, idx: any) => (<ReferenceArea key={`diff-violation-${idx}`} x1={area.start} x2={area.end} fill="#f44336" fillOpacity={0.2} strokeOpacity={0} />))}
                          
                          <Legend verticalAlign="top" height={36} iconSize={8} wrapperStyle={CHART_LEGEND_STYLE} />
                          <Line name={CHART_SERIES.upperLimit.name} type="stepAfter" dataKey="DiffUpper" stroke={CHART_SERIES.upperLimit.color} strokeWidth={CHART_SERIES.upperLimit.width} strokeDasharray={CHART_SERIES.upperLimit.dash} dot={false} strokeOpacity={0.9} isAnimationActive={false} />
                          <Line name={CHART_SERIES.lowerLimit.name} type="stepAfter" dataKey="DiffLower" stroke={CHART_SERIES.lowerLimit.color} strokeWidth={CHART_SERIES.lowerLimit.width} strokeDasharray={CHART_SERIES.lowerLimit.dash} dot={false} strokeOpacity={0.9} isAnimationActive={false} />
                          
                          {showRawDiff && isCompMax && (
                            <Line name={CHART_SERIES.rawDiff.name} type="monotone" dataKey="RoznicaRaw" stroke={CHART_SERIES.rawDiff.color} strokeWidth={CHART_SERIES.rawDiff.width} strokeDasharray={CHART_SERIES.rawDiff.dash} dot={false} isAnimationActive={false} />
                          )}
                          <Line name={CHART_SERIES.diff.name} type="monotone" dataKey="Roznica" stroke={CHART_SERIES.diff.color} strokeWidth={CHART_SERIES.diff.width} dot={false} isAnimationActive={false} />
                          {refAreaLeft !== null && refAreaRight !== null && <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0} fill="#2196f3" fillOpacity={0.2} />}
                        </LineChart>
                     </ResponsiveContainer>
                   </div>
                </div>

                {/* PRZYCISK KRAWĘDZIOWY WSUWANY (Pionowa zakładka) */}
                <div 
                  onClick={() => setShowModal3D(!showModal3D)}
                  title={showModal3D ? "Schowaj widok 3D" : "Otwórz cyfrowego bliźniaka 3D"}
                  style={{
                    width: '35px',
                    background: showModal3D ? '#1a1a1a' : '#222',
                    borderLeft: '1px solid #333',
                    borderRight: showModal3D ? '1px solid #333' : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    zIndex: 10,
                    boxShadow: showModal3D ? 'none' : '-3px 0 10px rgba(0,0,0,0.4)'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#2196f3'}
                  onMouseLeave={e => e.currentTarget.style.background = showModal3D ? '#1a1a1a' : '#222'}
                >
                  <span style={{ 
                    writingMode: 'vertical-rl', 
                    transform: 'rotate(180deg)', 
                    color: '#fff', 
                    fontWeight: 'bold', 
                    letterSpacing: '2px', 
                    fontSize: '0.85rem' 
                  }}>
                    {showModal3D ? '▶ UKRYJ 3D' : '◀ WIDOK 3D'}
                  </span>
                </div>

                {/* PRAWA STRONA (Wysuwany Odtwarzacz 3D) */}
                <div style={{ 
                    width: showModal3D ? '520px' : '0px', 
                    opacity: showModal3D ? 1 : 0, 
                    overflow: 'hidden', 
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)', 
                    background: '#0d0d0d' 
                }}>
                  <div style={{ width: '520px', padding: '10px 20px', height: '100%', boxSizing: 'border-box', overflowY: 'auto' }}>
                    <div style={{ marginTop: '-1rem' }}>
                      {/* Warunkowe renderowanie: montuje i renderuje 3D tylko gdy jest to widoczne! Oszczędność CPU/GPU */}
                      {showModal3D && (
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
                    </div>
                  </div>
                </div>
                </div>
                </div>
                {/* POPUP PARAMETRÓW STATYSTYCZNYCH OSI */}
              {showParamsModal && (
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', zIndex: 3000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(3px)' }}>
                  <div style={{ background: '#141414', width: '500px', borderRadius: '12px', border: '1px solid #333', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
                      <div style={{ padding: '1rem 1.5rem', background: '#1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333' }}>
                        <h3 style={{ margin: 0, color: '#2196f3', fontSize: '1.1rem' }}>📉 Statystyki sygnału: {selectedColumn}</h3>
                        <button onClick={() => setShowParamsModal(false)} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.2rem', transition: '0.2s' }} onMouseEnter={e=>e.currentTarget.style.color='#fff'} onMouseLeave={e=>e.currentTarget.style.color='#888'}>✕</button>
                      </div>
                      <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <SignalStatsTable title="Sygnał Badany (Surowy)" stats={diagnosis?.statsData?.signalParams?.[selectedColumn]?.raw} unit={unit} color="#ffeb3b" />
                        <SignalStatsTable title="Różnica (Badany - Referencja)" stats={diagnosis?.statsData?.signalParams?.[selectedColumn]?.diff} unit={unit} color="#ff5722" />
                      </div>
                    </div>
                </div>
              )}      
              </div>
              
        </>
      )}
      {/* ========================================================= */}
      {/* SEKCJA 3D: CYFROWY BLIŹNIAK (Z Odtwarzaczem) */}
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
    </div>
  );
};
