import { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea } from 'recharts';
import { Notifications, type NotificationItem } from './Notifications';

// --- POMOCNICZE FUNKCJE ---
const getUnit = (colName: string) => {
  if (colName.startsWith('Cur')) return '%';
  if (colName.startsWith('A')) return '°';
  return '';
};

// Funkcja generująca kolor gradientowy (Zielony -> Żółty -> Czerwony)
const getErrorColor = (val: number, max: number) => {
  // Zabezpieczenie przed dzieleniem przez bardzo małe liczby
  if (max === 0) return 'hsl(120, 80%, 45%)';
  const ratio = Math.min(Math.max(val / max, 0), 1);
  const hue = (1 - ratio) * 120; // 120 to zielony, 0 to czerwony
  return `hsl(${hue}, 80%, 45%)`;
};

const KonfiguracjaRobota = ({ selectedFilePath }: { selectedFilePath: string | null }) => {
  const robotName = selectedFilePath ? selectedFilePath.split(/[/\\]/)[1] : '';
  
  const [config, setConfig] = useState({ description: '', model: '', location: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{type: 'success' | 'error' | '', msg: string}>({type: '', msg: ''});

  // Pobieranie danych przy wejściu
  useEffect(() => {
    if (!robotName) return;
    setStatus({type: '', msg: ''});
    const fetchConfig = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/robot-config/${robotName}`);
        if (res.ok) {
          const data = await res.json();
          setConfig({
            description: data.description || '',
            model: data.model || '',
            location: data.location || ''
          });
        }
      } catch (e) { console.error(e); }
    };
    fetchConfig();
  }, [robotName]);

  const handleChange = (field: string, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setStatus({type: '', msg: ''});
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/robot-config/${robotName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config) // Wysyłamy cały słownik, API zje każdy parametr!
      });
      if (res.ok) {
        setStatus({type: 'success', msg: 'Zapisano pomyślnie!'});
        setTimeout(() => setStatus({type: '', msg: ''}), 3000);
      } else {
        setStatus({type: 'error', msg: 'Błąd podczas zapisu.'});
      }
    } catch (e) {
      setStatus({type: 'error', msg: 'Brak połączenia z serwerem.'});
    }
    setIsSaving(false);
  };

  return (
    <div style={{ textAlign: 'left' }}>
      <h2 style={{ color: '#4caf50' }}>⚙️ Konfiguracja robota</h2>
      
      {robotName ? (
        <div style={{ marginTop: '1.5rem', padding: '1.5rem', border: '1px solid #444', borderRadius: '8px', backgroundColor: '#1a1a1a', maxWidth: '600px' }}>
          <h3 style={{ color: '#4caf50', marginTop: 0, borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>
            Parametry dla: {robotName}
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', color: '#aaa', marginBottom: '5px' }}>Opis robota</label>
              <input type="text" value={config.description} onChange={e => handleChange('description', e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', background: '#222', color: '#fff', border: '1px solid #444', boxSizing: 'border-box' }} placeholder="np. Robot spawalniczy linia 2" />
            </div>
            <div>
              <label style={{ display: 'block', color: '#aaa', marginBottom: '5px' }}>Model</label>
              <input type="text" value={config.model} onChange={e => handleChange('model', e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', background: '#222', color: '#fff', border: '1px solid #444', boxSizing: 'border-box' }} placeholder="np. KUKA KR 210" />
            </div>
            <div>
              <label style={{ display: 'block', color: '#aaa', marginBottom: '5px' }}>Lokalizacja</label>
              <input type="text" value={config.location} onChange={e => handleChange('location', e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '4px', background: '#222', color: '#fff', border: '1px solid #444', boxSizing: 'border-box' }} placeholder="np. Hala B, sektor 4" />
            </div>
            
            <button onClick={handleSave} disabled={isSaving} style={{ marginTop: '10px', padding: '10px 20px', background: '#4caf50', color: 'white', border: 'none', borderRadius: '4px', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 'bold', alignSelf: 'flex-start' }}>
              {isSaving ? 'Zapisywanie...' : '💾 Zapisz konfigurację'}
            </button>

            {status.msg && (
              <p style={{ color: status.type === 'success' ? '#4caf50' : '#f44336', margin: '5px 0 0 0', fontWeight: 'bold' }}>
                {status.msg}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: '2rem', padding: '3rem', border: '2px dashed #444', borderRadius: '8px', color: '#aaa', textAlign: 'center' }}>
          <span style={{ fontSize: '2rem' }}>👈</span><br/><br/>
          Wybierz robota z drzewka po lewej stronie, aby edytować jego konfigurację.
        </div>
      )}
    </div>
  );
};

const COLORS = [
  '#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00C49F', 
  '#FFBB28', '#FF8042', '#0088FE', '#ff0055', '#4caf50', '#9c27b0'
];

// --- MODUŁ: PODGLĄD DANYCH ---
const PodgladDanych = ({ selectedFilePath }: { selectedFilePath: string | null }) => {
  const [fileInfo, setFileInfo] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeColumns, setActiveColumns] = useState<string[]>([]);
  
  const [refAreaLeft, setRefAreaLeft] = useState<number | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<number | null>(null);
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!selectedFilePath) {
      setFileInfo(null);
      setChartData([]);
      setActiveColumns([]);
      setZoomRange(null);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const infoRes = await fetch('http://127.0.0.1:8000/api/file-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: selectedFilePath })
        });
        
        if (infoRes.ok) {
          const infoData = await infoRes.json();
          setFileInfo(infoData);
          
          const dataColumns = infoData.columns.filter((c: string) => c !== 'Time' && c !== 'Label');
          if (dataColumns.length > 0) {
            setActiveColumns([dataColumns[0]]);
          }

          if (infoData.is_valid) {
            const dataRes = await fetch('http://127.0.0.1:8000/api/file-data', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: selectedFilePath })
            });
            if (dataRes.ok) {
              const data = await dataRes.json();
              setChartData(data);
              setZoomRange(null);
            }
          }
        }
      } catch (error) {
        console.error("Błąd:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [selectedFilePath]);

  const toggleColumn = (colName: string) => {
    setActiveColumns(prev => prev.includes(colName) ? prev.filter(c => c !== colName) : [...prev, colName]);
  };

  const handleZoom = () => {
    if (refAreaLeft === refAreaRight || refAreaLeft === null || refAreaRight === null) {
      setRefAreaLeft(null);
      setRefAreaRight(null);
      return;
    }
    let [left, right] = [refAreaLeft, refAreaRight];
    if (left > right) [left, right] = [right, left];
    setZoomRange([left, right]);
    setRefAreaLeft(null);
    setRefAreaRight(null);
  };

  const displayedData = zoomRange 
    ? chartData.filter(d => d.Time >= zoomRange[0] && d.Time <= zoomRange[1])
    : chartData;

  const singleUnit = activeColumns.length === 1 && activeColumns[0] !== 'Label' ? getUnit(activeColumns[0]) : '';

  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ color: '#2196f3' }}>📊 Podgląd danych</h2>
        {zoomRange && (
          <button onClick={() => setZoomRange(null)} style={{ padding: '6px 16px', background: '#e91e63', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            🔍 Resetuj Zoom
          </button>
        )}
      </div>
      
      {selectedFilePath ? (
        <div style={{ marginTop: '1.5rem', padding: '1.5rem', border: '1px solid #444', borderRadius: '8px', backgroundColor: '#1a1a1a' }}>
          <h3 style={{ color: '#ffeb3b', marginTop: 0, borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>
            Wybrano plik: {selectedFilePath}
          </h3>
          
          {isLoading ? (
            <p style={{ color: '#aaa', fontStyle: 'italic', margin: '2rem 0' }}>⏳ Trwa analiza i ładowanie danych do wykresu...</p>
          ) : fileInfo && fileInfo.is_valid ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem', marginTop: '1rem' }}>
                <div style={{ background: '#2a2a2a', padding: '1rem', borderRadius: '4px' }}>
                  <p style={{ margin: '0 0 5px 0', color: '#aaa', fontSize: '0.9rem' }}>Format</p>
                  <strong style={{ color: '#4caf50' }}>✅ Poprawny CSV</strong>
                </div>
                <div style={{ background: '#2a2a2a', padding: '1rem', borderRadius: '4px' }}>
                  <p style={{ margin: '0 0 5px 0', color: '#aaa', fontSize: '0.9rem' }}>Liczba próbek</p>
                  <strong>{fileInfo.rows_count}</strong>
                </div>
                <div style={{ background: '#2a2a2a', padding: '1rem', borderRadius: '4px' }}>
                  <p style={{ margin: '0 0 5px 0', color: '#aaa', fontSize: '0.9rem' }}>Data zapisu</p>
                  <strong>{fileInfo.record_date}</strong>
                </div>
                <div style={{ background: '#2a2a2a', padding: '1rem', borderRadius: '4px' }}>
                  <p style={{ margin: '0 0 5px 0', color: '#aaa', fontSize: '0.9rem' }}>Czas nagrania</p>
                  <strong>{fileInfo.duration !== null ? `${fileInfo.duration.toFixed(2)} s` : 'Brak'}</strong>
                </div>
              </div>

              <div style={{ marginTop: '2rem', padding: '1rem', background: '#222', borderRadius: '8px', border: '1px solid #333' }}>
                <p style={{ color: '#aaa', marginTop: 0, marginBottom: '10px' }}>Wybierz sygnały do wyświetlenia na wykresie:</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {fileInfo.columns
                    .filter((c: string) => c !== 'Time')
                    .map((col: string, idx: number) => {
                      const isSelected = activeColumns.includes(col);
                      const colColor = COLORS[idx % COLORS.length];

                      return (
                        <div 
                          key={col} onClick={() => toggleColumn(col)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            background: isSelected ? `${colColor}33` : '#333',
                            padding: '6px 12px', borderRadius: '20px', cursor: 'pointer',
                            border: `1px solid ${isSelected ? colColor : '#555'}`, transition: 'all 0.2s'
                          }}
                        >
                          <div style={{
                            width: '14px', height: '14px', borderRadius: '3px', background: isSelected ? colColor : '#222',
                            border: `2px solid ${isSelected ? colColor : '#888'}`, display: 'flex', justifyContent: 'center', alignItems: 'center'
                          }}>
                            {isSelected && <span style={{ color: '#fff', fontSize: '10px', fontWeight: 'bold' }}>✓</span>}
                          </div>
                          <span style={{ color: isSelected ? '#fff' : '#aaa', fontWeight: isSelected ? 'bold' : 'normal' }}>
                            {col} {getUnit(col) && `[${getUnit(col)}]`}
                          </span>
                        </div>
                      );
                  })}
                </div>
              </div>

              {chartData.length > 0 && (
                <div style={{ position: 'relative', marginTop: '2rem', height: '450px', background: '#111', padding: '1rem', borderRadius: '8px', border: '1px solid #333' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart 
                      data={displayedData} 
                      margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
                      onMouseDown={(e) => e && setRefAreaLeft(e.activeLabel as number)}
                      onMouseMove={(e) => refAreaLeft && e && setRefAreaRight(e.activeLabel as number)}
                      onMouseUp={handleZoom}
                      style={{ userSelect: 'none', cursor: 'crosshair' }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="Time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(val) => val.toFixed(1) + 's'} stroke="#888" label={{ value: 'Czas nagrania [s]', position: 'insideBottom', offset: -10, fill: '#aaa' }} />
                      <YAxis domain={['auto', 'auto']} stroke="#888" label={{ value: singleUnit, angle: -90, position: 'insideLeft', fill: '#888' }} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#444', borderRadius: '8px' }} 
                        itemStyle={{ fontWeight: 'bold' }} 
                        labelFormatter={(label) => `Czas: ${Number(label).toFixed(3)}s`} 
                        formatter={(value: any, name: any) => {
                          const unit = getUnit(String(name));
                          return [`${Number(value).toFixed(2)}${unit ? ' ' + unit : ''}`, name];
                        }}
                      />
                      <Legend verticalAlign="top" height={36} />
                      
                      {fileInfo.columns
                        .filter((c: string) => c !== 'Time')
                        .map((col: string, idx: number) => {
                          const isSelected = activeColumns.includes(col);
                          const isLabel = col === 'Label';
                          if (!isSelected) return null;
                          return (
                            <Line 
                              key={col} type={isLabel ? "stepAfter" : "monotone"} dataKey={col} 
                              stroke={isLabel ? "#ffeb3b" : COLORS[idx % COLORS.length]} 
                              strokeWidth={isLabel ? 3 : 2} dot={false} isAnimationActive={false} 
                              name={isLabel ? "🔢 ID Operacji (Label)" : `${col} ${getUnit(col) ? '[' + getUnit(col) + ']' : ''}`}
                            />
                          );
                      })}
                      {refAreaLeft !== null && refAreaRight !== null && (
                        <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill="#8884d8" fillOpacity={0.3} />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          ) : (
            <p style={{ color: '#f44336' }}><strong>❌ Błąd:</strong> {fileInfo?.error_msg}</p>
          )}
        </div>
      ) : (
        <div style={{ marginTop: '2rem', padding: '3rem', border: '2px dashed #444', borderRadius: '8px', color: '#aaa', textAlign: 'center' }}>
          <span style={{ fontSize: '2rem' }}>👈</span><br/><br/>
          Wybierz plik z drzewka po lewej stronie, aby rozpocząć analizę.
        </div>
      )}
    </div>
  );
};

// --- MODUŁ: ANALIZA PRZEBIEGÓW ---
type Metric = 'MAE' | 'IAE' | 'ISE';
const METRICS: Metric[] = ['MAE', 'IAE', 'ISE'];

const AnalizaPrzebiegow = ({ selectedFilePath }: { selectedFilePath: string | null }) => {
  const [robotInfo, setRobotInfo] = useState<any>(null);
  const [refData, setRefData] = useState<any[]>([]);
  const [testData, setTestData] = useState<any[]>([]);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [selectedColumn, setSelectedColumn] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const [refAreaLeft, setRefAreaLeft] = useState<number | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<number | null>(null);
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);

  const robotName = selectedFilePath ? selectedFilePath.split(/[/\\]/)[1] : '';
  const isFile = selectedFilePath ? selectedFilePath.endsWith('.csv') : false;

  useEffect(() => {
    if (!robotName) return;
    const fetchRef = async () => {
      setIsLoading(true);
      try {
        const resInfo = await fetch('http://127.0.0.1:8000/api/robot-info', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ robot_name: robotName })
        });
        if (resInfo.ok) {
          const info = await resInfo.json();
          setRobotInfo(info);
          if (info.ref_file_info) {
            const refPath = `Roboty/${robotName}/Przebieg_referencyjny/${info.ref_file_info.name}`;
            const resData = await fetch('http://127.0.0.1:8000/api/file-data', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: refPath })
            });
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
        const resData = await fetch('http://127.0.0.1:8000/api/file-data', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: selectedFilePath })
        });
        if (resData.ok) { setTestData(await resData.json()); setZoomRange(null); }
      } catch (e) { console.error(e); }
    };
    fetchTest();
  }, [selectedFilePath, isFile]);

  // Obliczanie połączonych danych do wykresów
  const combinedData = useMemo(() => {
    if (!selectedColumn || refData.length === 0 || testData.length === 0) return [];
    const result = [];
    const maxLen = Math.max(refData.length, testData.length);
    for(let i = 0; i < maxLen; i++) {
       const r = refData[i] || {};
       const t = testData[i] || {};
       const time = r.Time !== undefined ? r.Time : (t.Time !== undefined ? t.Time : i);
       const rVal = r[selectedColumn] !== undefined ? r[selectedColumn] : null;
       const tVal = t[selectedColumn] !== undefined ? t[selectedColumn] : null;
       result.push({
           Time: time,
           Referencja: rVal,
           Badany: tVal,
           Roznica: (rVal !== null && tVal !== null) ? Number((tVal - rVal).toFixed(4)) : null
       });
    }
    return result;
  }, [refData, testData, selectedColumn]);

  // --- OBLICZANIE TABELI STATYSTYK (MAE, IAE, ISE) ---
  const statsData = useMemo(() => {
    if (refData.length === 0 || testData.length === 0 || availableColumns.length === 0) return null;

    const errors: Record<Metric, Record<string, number>> = { MAE: {}, IAE: {}, ISE: {} };
    const maxLen = Math.min(refData.length, testData.length);

    availableColumns.forEach(col => {
      let sumAbs = 0;
      let sumSqr = 0;
      let count = 0;
      let integralAbs = 0;
      let integralSqr = 0;

      for (let i = 0; i < maxLen; i++) {
        const r = refData[i]?.[col];
        const t = testData[i]?.[col];
        if (r !== undefined && r !== null && t !== undefined && t !== null) {
          const err = t - r;
          
          sumAbs += Math.abs(err);
          count++;

          // Wyliczanie delty czasu (dt) do całek
          let dt = 0;
          if (i > 0) {
            const timePrev = refData[i - 1]?.Time ?? (i - 1);
            const timeCurr = refData[i]?.Time ?? i;
            dt = timeCurr - timePrev;
          }
          
          integralAbs += Math.abs(err) * dt;
          integralSqr += (err * err) * dt;
        }
      }
      
      errors.MAE[col] = count > 0 ? sumAbs / count : 0;
      errors.IAE[col] = integralAbs;
      errors.ISE[col] = integralSqr;
    });

    const aCols = availableColumns.filter(c => c.startsWith('A')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const curCols = availableColumns.filter(c => c.startsWith('Cur')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    // Wyliczanie osobnych maksymalnych wartości dla gradientu (Dla osi A i Prądów Cur)
    const maxes = {
      A: {
        MAE: Math.max(...aCols.map(c => errors.MAE[c]), 0.0001),
        IAE: Math.max(...aCols.map(c => errors.IAE[c]), 0.0001),
        ISE: Math.max(...aCols.map(c => errors.ISE[c]), 0.0001),
      },
      Cur: {
        MAE: Math.max(...curCols.map(c => errors.MAE[c]), 0.0001),
        IAE: Math.max(...curCols.map(c => errors.IAE[c]), 0.0001),
        ISE: Math.max(...curCols.map(c => errors.ISE[c]), 0.0001),
      }
    };

    return { errors, aCols, curCols, maxes };
  }, [refData, testData, availableColumns]);

  const displayedData = zoomRange 
    ? combinedData.filter(d => d.Time >= zoomRange[0] && d.Time <= zoomRange[1])
    : combinedData;

  const handleZoom = () => {
    if (refAreaLeft === refAreaRight || refAreaLeft === null || refAreaRight === null) {
      setRefAreaLeft(null);
      setRefAreaRight(null);
      return;
    }
    let [left, right] = [refAreaLeft, refAreaRight];
    if (left > right) [left, right] = [right, left];
    setZoomRange([left, right]);
    setRefAreaLeft(null);
    setRefAreaRight(null);
  };

  const unit = getUnit(selectedColumn);

  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ color: '#e91e63' }}>📈 Analiza przebiegów</h2>
        {zoomRange && (
          <button onClick={() => setZoomRange(null)} style={{ padding: '6px 16px', background: '#e91e63', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            🔍 Resetuj Zoom
          </button>
        )}
      </div>
      
      {robotName ? (
        <div style={{ marginTop: '1rem', padding: '1.5rem', border: '1px solid #444', borderRadius: '8px', backgroundColor: '#1a1a1a' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            {/* 1. DANE ROBOTA Z KONFIGURACJI */}
            <div style={{ background: '#2a2a2a', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #00bcd4' }}>
              <h4 style={{ margin: '0 0 5px 0', color: '#00bcd4' }}>🤖 Dane robota</h4>
              <p style={{ margin: '5px 0', color: '#aaa' }}>Model: <strong style={{ color: '#fff' }}>{robotInfo?.config?.model || '[Brak]'}</strong></p>
              <p style={{ margin: '5px 0', color: '#aaa' }}>Lokalizacja: <strong style={{ color: '#fff' }}>{robotInfo?.config?.location || '[Brak]'}</strong></p>
              {robotInfo?.config?.description && (
                <p style={{ margin: '5px 0', color: '#aaa', fontSize: '0.85rem', fontStyle: 'italic' }}>{robotInfo.config.description}</p>
              )}
            </div>

            {/* 2. PLIK REFERENCYJNY */}
            <div style={{ background: '#2a2a2a', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #4caf50' }}>
              <h4 style={{ margin: '0 0 5px 0', color: '#4caf50' }}>🟢 Plik referencyjny</h4>
              <p style={{ margin: '0', color: '#aaa' }}>{robotInfo?.ref_file_info?.name || 'Brak pliku referencyjnego'}</p>
            </div>

            {/* 3. PLIK BADANY */}
            <div style={{ background: '#2a2a2a', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #ffeb3b' }}>
              <h4 style={{ margin: '0 0 5px 0', color: '#ffeb3b' }}>🟡 Plik badany</h4>
              <p style={{ margin: '0', color: '#aaa' }}>{isFile ? selectedFilePath?.split(/[/\\]/).pop() : 'Wybierz plik z drzewka...'}</p>
            </div>
          </div>

          {combinedData.length > 0 && isFile && (
            <>
              {/* NOWA KOMPAKTOWA TABELA STATYSTYCZNA (MAE, IAE, ISE) */}
              {statsData && (
                <div style={{ marginBottom: '2rem' }}>
                  <h3 style={{ color: '#00bcd4', marginBottom: '0.5rem', borderBottom: '1px solid #444', paddingBottom: '5px' }}>
                    Wskaźniki Błędów: MAE, IAE, ISE
                  </h3>
                  <div style={{ background: '#111', padding: '1rem', borderRadius: '8px', border: '1px solid #333', overflowX: 'auto' }}>
                    
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', color: '#fff', fontSize: '0.9rem' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '8px', borderBottom: '1px solid #555', borderRight: '1px solid #444' }}></th>
                          <th colSpan={statsData.aCols.length} style={{ padding: '8px', borderBottom: '1px solid #555', borderRight: '1px solid #444', color: '#aaa' }}>
                            Odchylenia Kątowe [°]
                          </th>
                          <th colSpan={statsData.curCols.length} style={{ padding: '8px', borderBottom: '1px solid #555', color: '#aaa' }}>
                            Odchylenia Prądowe [%]
                          </th>
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
                            
                            {/* Część A (Osie Kątowe) */}
                            {statsData.aCols.map(c => {
                              const val = statsData.errors[metric][c];
                              const bgColor = getErrorColor(val, statsData.maxes.A[metric]);
                              return (
                                <td key={c} style={{ padding: '8px', borderBottom: '1px solid #333', borderRight: c === statsData.aCols[statsData.aCols.length - 1] ? '1px solid #444' : 'none' }}>
                                  <div style={{ background: '#222', borderBottom: `4px solid ${bgColor}`, padding: '4px', borderRadius: '4px', fontWeight: 'bold' }}>
                                    {val.toFixed(3)}
                                  </div>
                                </td>
                              );
                            })}
                            
                            {/* Część Cur (Osie Prądowe) */}
                            {statsData.curCols.map(c => {
                              const val = statsData.errors[metric][c];
                              const bgColor = getErrorColor(val, statsData.maxes.Cur[metric]);
                              return (
                                <td key={c} style={{ padding: '8px', borderBottom: '1px solid #333' }}>
                                  <div style={{ background: '#222', borderBottom: `4px solid ${bgColor}`, padding: '4px', borderRadius: '4px', fontWeight: 'bold' }}>
                                    {val.toFixed(3)}
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
              )}

              {/* Wybór sygnału do wykresu */}
              <div style={{ marginBottom: '1.5rem', background: '#222', padding: '10px', borderRadius: '8px', border: '1px solid #333' }}>
                <span style={{ color: '#aaa', marginRight: '15px' }}>Sygnał do analizy szczegółowej:</span>
                <select 
                  value={selectedColumn} 
                  onChange={(e) => setSelectedColumn(e.target.value)} 
                  style={{ padding: '5px 10px', borderRadius: '4px', background: '#333', color: 'white', border: '1px solid #555', cursor: 'pointer' }}
                >
                  {availableColumns.map(col => (
                    <option key={col} value={col}>{col} {getUnit(col) ? `[${getUnit(col)}]` : ''}</option>
                  ))}
                </select>
              </div>

              {/* TYTUŁ I GŁÓWNY WYKRES */}
              <h3 style={{ color: '#fff', marginBottom: '0.5rem', borderBottom: '1px solid #444', paddingBottom: '5px' }}>
                Porównanie z referencją {unit ? `[${unit}]` : ''}
              </h3>
              <div style={{ height: '300px', background: '#111', padding: '1rem', borderRadius: '8px', border: '1px solid #333', marginBottom: '2.5rem' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={displayedData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }} onMouseDown={(e) => e && setRefAreaLeft(e.activeLabel as number)} onMouseMove={(e) => refAreaLeft && e && setRefAreaRight(e.activeLabel as number)} onMouseUp={handleZoom} style={{ userSelect: 'none', cursor: 'crosshair' }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="Time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => v.toFixed(1) + 's'} stroke="#888" hide />
                    <YAxis domain={['auto', 'auto']} stroke="#888" label={{ value: unit, angle: -90, position: 'insideLeft', fill: '#888' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#444' }} labelFormatter={(l) => `Czas: ${Number(l).toFixed(3)}s`} formatter={(v: any, name: any) => [`${Number(v).toFixed(2)} ${unit}`, name]} />
                    <Legend verticalAlign="top" height={36} />
                    
                    <Line name="Referencja" type="monotone" dataKey="Referencja" stroke="#4caf50" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line name="Badany" type="monotone" dataKey="Badany" stroke="#ffeb3b" strokeWidth={2} dot={false} isAnimationActive={false} />
                    
                    {refAreaLeft !== null && refAreaRight !== null && <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill="#e91e63" fillOpacity={0.3} />}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* TYTUŁ I WYKRES RÓŻNICY */}
              <h3 style={{ color: '#ff5722', marginBottom: '0.5rem', borderBottom: '1px solid #444', paddingBottom: '5px' }}>
                Obliczona różnica sygnałów {unit ? `[${unit}]` : ''}
              </h3>
              <div style={{ height: '220px', background: '#111', padding: '1rem', borderRadius: '8px', border: '1px solid #333' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={displayedData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }} onMouseDown={(e) => e && setRefAreaLeft(e.activeLabel as number)} onMouseMove={(e) => refAreaLeft && e && setRefAreaRight(e.activeLabel as number)} onMouseUp={handleZoom} style={{ userSelect: 'none', cursor: 'crosshair' }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="Time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => v.toFixed(1) + 's'} stroke="#888" label={{ value: 'Czas nagrania [s]', position: 'insideBottom', offset: -10, fill: '#aaa' }} />
                    <YAxis domain={['auto', 'auto']} stroke="#888" label={{ value: unit, angle: -90, position: 'insideLeft', fill: '#888' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#444' }} labelFormatter={(l) => `Czas: ${Number(l).toFixed(3)}s`} formatter={(v: any) => [`${Number(v).toFixed(2)} ${unit}`, 'Δ Różnica']} />
                    
                    <Line name="Δ Odchylenie (Badany - Ref)" type="monotone" dataKey="Roznica" stroke="#ff5722" strokeWidth={2} dot={false} isAnimationActive={false} />
                    
                    {refAreaLeft !== null && refAreaRight !== null && <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill="#e91e63" fillOpacity={0.3} />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      ) : ( <div style={{ marginTop: '2rem', padding: '3rem', border: '2px dashed #444', borderRadius: '8px', color: '#aaa', textAlign: 'center' }}>Wybierz robota...</div> )}
    </div>
  );
};

// --- KOMPONENTY POBOCZNE I GŁÓWNY KONTENER ---
const OstatnieOperacje = () => (
  <div style={{ textAlign: 'left', padding: '1rem' }}>
    <h2 style={{ color: '#ff9800' }}>🕒 Ostatnie operacje</h2>
    <p style={{ color: '#aaa' }}>Dziennik zdarzeń (logi) - historia modyfikacji plików, dodawania robotów i wykonanych analiz.</p>
  </div>
);

const Rezerwa = ({ numer }: { numer: number }) => (
  <div style={{ textAlign: 'center', padding: '3rem' }}>
    <h2 style={{ color: '#9c27b0' }}>📦 Moduł Rezerwowy {numer}</h2>
  </div>
);

export const MainPanel = ({ activeModule, setActiveModule, selectedFilePath, systemNotification }: any) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  
  const [notifications] = useState<NotificationItem[]>([
    { id: '1', type: 'progress', message: 'Analiza FFT dla pliku przejazd_24.csv w toku...', timestamp: '14:23:10', progress: 68 },
    { id: '2', type: 'warning', message: 'Wykryto anomalię prądową w osi A3 (Robot_1).', timestamp: '14:20:05' },
    { id: '3', type: 'error', message: 'Błąd połączenia z serwerem archiwizacji OPC UA.', timestamp: '14:15:00' },
  ]);

  const modules = [
    { id: 'konfiguracja', name: '⚙️ Konfiguracja robota' },
    { id: 'podglad_danych', name: '📊 Podgląd danych' },
    { id: 'ostatnie_operacje', name: '🕒 Ostatnie operacje' },
    { id: 'analiza_przebiegow', name: '📈 Analiza przebiegów' },
    { id: 'rezerwa_2', name: '📦 Rezerwa 2' },
  ];

  const renderActiveModule = () => {
    switch (activeModule) {
      case 'konfiguracja': return <KonfiguracjaRobota selectedFilePath={selectedFilePath} />;
      case 'podglad_danych': return <PodgladDanych selectedFilePath={selectedFilePath} />;
      case 'ostatnie_operacje': return <OstatnieOperacje />;
      case 'analiza_przebiegow': return <AnalizaPrzebiegow selectedFilePath={selectedFilePath} />;
      case 'rezerwa_2': return <Rezerwa numer={2} />;
      default: return <PodgladDanych selectedFilePath={selectedFilePath} />;
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#242424', height: '100vh', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 2rem', backgroundColor: '#1e1e1e', borderBottom: '1px solid #444' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#fff' }}>Panel Diagnostyczny</h1>
        
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <button onClick={() => setIsNotificationsOpen(!isNotificationsOpen)} style={{ padding: '0.5rem 1rem', fontSize: '1rem', cursor: 'pointer', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px', position: 'relative' }}>
            🔔 {notifications.length > 0 && <span style={{ position: 'absolute', top: '-5px', right: '-5px', background: '#f44336', color: 'white', borderRadius: '50%', padding: '2px 6px', fontSize: '0.7rem' }}>{notifications.length}</span>}
          </button>

          <div style={{ position: 'relative' }}>
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} style={{ padding: '0.5rem 1rem', fontSize: '1rem', cursor: 'pointer', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🗂️ Moduł: {modules.find(m => m.id === activeModule)?.name} {isMenuOpen ? '▲' : '▼'}
            </button>

            {isMenuOpen && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '5px', backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', zIndex: 1000, width: '250px', display: 'flex', flexDirection: 'column' }}>
                {modules.map((mod) => (
                  <button key={mod.id} onClick={() => { setActiveModule(mod.id); setIsMenuOpen(false); }} style={{ padding: '10px 15px', textAlign: 'left', background: activeModule === mod.id ? '#333' : 'transparent', color: 'white', border: 'none', cursor: 'pointer', borderBottom: '1px solid #444' }}>
                    {mod.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Notifications isOpen={isNotificationsOpen} onClose={() => setIsNotificationsOpen(false)} notifications={notifications} />

      <div style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
        {systemNotification && <div style={{ backgroundColor: '#ff9800', color: 'black', padding: '1rem', margin: '0 auto 1.5rem auto', maxWidth: '600px', borderRadius: '8px', fontWeight: 'bold', textAlign: 'center' }}>{systemNotification}</div>}
        {renderActiveModule()}
      </div>
    </div>
  );
};