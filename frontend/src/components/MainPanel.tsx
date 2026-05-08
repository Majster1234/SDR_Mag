import { useState, useEffect, useMemo } from 'react';
import { LineChart, ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea } from 'recharts';
import { Notifications, type NotificationItem } from './Notifications';

// --- POMOCNICZE FUNKCJE ---
const getUnit = (colName: string) => {
  if (colName.startsWith('Cur')) return '%';
  if (colName.startsWith('A')) return '°';
  return '';
};

// Funkcja generująca kolor gradientowy (Zielony -> Żółty -> Czerwony)
const getErrorColor = (val: number, max: number) => {
  if (max === 0) return 'hsl(120, 80%, 45%)';
  const ratio = Math.min(Math.max(val / max, 0), 1);
  const hue = (1 - ratio) * 120; 
  return `hsl(${hue}, 80%, 45%)`;
};

const KonfiguracjaRobota = ({ selectedFilePath }: { selectedFilePath: string | null }) => {
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
          Wybierz plik z drzewka po lewej stronie, aby rozpocząć.
        </div>
      )}
    </div>
  );
};

// --- MODUŁ: ANALIZA PRZEBIEGÓW ---
type Metric = 'MAE' | 'IAE' | 'ISE';
const METRICS: Metric[] = ['MAE', 'IAE', 'ISE'];

const MiniAnalizaChart = ({ title, data, unit }: { title: string, data: any[], unit: string }) => {
  // Wyliczamy w locie strefy alarmowe, żeby na małym wykresie też świeciło na czerwono!
  const violationAreas = useMemo(() => {
    if (!data || data.length === 0) return [];
    const areas: { start: number, end: number }[] = [];
    let violationStart: number | null = null;
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const isOut = d.Badany !== null && d.UpperLimit !== null && d.LowerLimit !== null && 
                    (d.Badany > d.UpperLimit || d.Badany < d.LowerLimit);
      if (isOut && violationStart === null) violationStart = d.Time;
      else if (!isOut && violationStart !== null) {
        areas.push({ start: violationStart, end: d.Time });
        violationStart = null;
      }
    }
    if (violationStart !== null) areas.push({ start: violationStart, end: data[data.length - 1].Time });
    return areas;
  }, [data]);

  return (
    <div style={{ background: '#111', padding: '10px', borderRadius: '8px', border: '1px solid #333', marginBottom: '10px' }}>
      <h5 style={{ margin: '0 0 10px 0', color: '#aaa', fontSize: '0.8rem' }}>{title} [{unit}]</h5>
      <div style={{ height: '120px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="2 2" stroke="#222" vertical={false} />
            <XAxis dataKey="Time" hide />
            <YAxis domain={['auto', 'auto']} hide />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1a1a1a', fontSize: '10px', borderColor: '#444' }} 
              formatter={(v: any) => [Number(v).toFixed(2), '']}
            />
            
            {violationAreas.map((area, idx) => (
              <ReferenceArea key={`violation-${idx}`} x1={area.start} x2={area.end} fill="#f44336" fillOpacity={0.25} strokeOpacity={0} />
            ))}

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

const AnalizaPrzebiegow = ({ selectedFilePath }: { selectedFilePath: string | null }) => {
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

  // Funkcja pomocnicza do generowania danych z tolerancją dla DOWOLNEJ kolumny
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

       let upper = null;
       let lower = null;

       if (rVal !== null) {
         if (diagType === 'Odchylenia') {
           let localMax = 0;
           const startIdx = Math.max(0, i - windowSize);
           const endIdx = Math.min(refData.length - 1, i + windowSize);
           for (let j = startIdx; j <= endIdx; j++) {
             const val = Math.abs(refData[j]?.[colName] || 0);
             if (val > localMax) localMax = val;
           }
           const margin = Math.max(localMax * (devThr / 100), deadbandThr);
           upper = rVal + margin;
           lower = rVal - margin;
         } else if (diagType === 'Odchylenie (offsetowe)') {
           upper = rVal + offThr;
           lower = rVal - offThr;
         }
       }

       result.push({ Time: time, Referencja: rVal, Badany: tVal, UpperLimit: upper, LowerLimit: lower, Roznica: (rVal !== null && tVal !== null) ? Number((tVal - rVal).toFixed(4)) : null });
    }
    return result;
  };

  // Używamy funkcji pomocniczej dla aktualnie wybranej kolumny w widoku szczegółowym
  const combinedData = useMemo(() => prepareColumnData(selectedColumn), [refData, testData, selectedColumn, robotInfo]);

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

    const maxes = {
      A: { MAE: Math.max(...aCols.map(c => errors.MAE[c]), 0.0001), IAE: Math.max(...aCols.map(c => errors.IAE[c]), 0.0001), ISE: Math.max(...aCols.map(c => errors.ISE[c]), 0.0001) },
      Cur: { MAE: Math.max(...curCols.map(c => errors.MAE[c]), 0.0001), IAE: Math.max(...curCols.map(c => errors.IAE[c]), 0.0001), ISE: Math.max(...curCols.map(c => errors.ISE[c]), 0.0001) }
    };

    return { errors, aCols, curCols, maxes };
  }, [refData, testData, availableColumns]);

  const displayedData = zoomRange ? combinedData.filter(d => d.Time >= zoomRange[0] && d.Time <= zoomRange[1]) : combinedData;

  // --- OBLICZANIE STREF ALARMOWYCH DLA GŁÓWNEGO WYKRESU ---
  const violationAreas = useMemo(() => {
    if (!displayedData || displayedData.length === 0) return [];
    const areas: { start: number, end: number }[] = [];
    let violationStart: number | null = null;

    for (let i = 0; i < displayedData.length; i++) {
      const d = displayedData[i];
      const isOut = d.Badany !== null && d.UpperLimit !== null && d.LowerLimit !== null && 
                    (d.Badany > d.UpperLimit || d.Badany < d.LowerLimit);
      
      if (isOut && violationStart === null) {
        violationStart = d.Time;
      } else if (!isOut && violationStart !== null) {
        areas.push({ start: violationStart, end: d.Time });
        violationStart = null;
      }
    }
    
    if (violationStart !== null) {
      areas.push({ start: violationStart, end: displayedData[displayedData.length - 1].Time });
    }

    return areas;
  }, [displayedData]);

  const handleZoom = () => {
    if (refAreaLeft === refAreaRight || refAreaLeft === null || refAreaRight === null) {
      setRefAreaLeft(null); setRefAreaRight(null); return;
    }
    let [left, right] = [refAreaLeft, refAreaRight];
    if (left > right) [left, right] = [right, left];
    setZoomRange([left, right]);
    setRefAreaLeft(null); setRefAreaRight(null);
  };

  const unit = getUnit(selectedColumn);

  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ color: '#e91e63', margin: 0 }}>📈 Analiza przebiegów</h2>
        
        {/* KONTROLKI WIDOKU */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={() => setViewMode('detailed')}
            style={{ padding: '8px 16px', background: viewMode === 'detailed' ? '#e91e63' : '#333', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            🔍 Widok szczegółowy
          </button>
          <button 
            onClick={() => setViewMode('overview')}
            style={{ padding: '8px 16px', background: viewMode === 'overview' ? '#e91e63' : '#333', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            📱 Widok zbiorczy (Dashboard)
          </button>
          {zoomRange && viewMode === 'detailed' && (
            <button onClick={() => setZoomRange(null)} style={{ padding: '8px 16px', background: '#444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              Reset Zoom
            </button>
          )}
        </div>
      </div>
      
      {robotName ? (
        <div style={{ marginTop: '1rem', padding: '1.5rem', border: '1px solid #444', borderRadius: '8px', backgroundColor: '#1a1a1a' }}>
          
          {/* HEADER Z INFORMACJAMI */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ background: '#2a2a2a', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #00bcd4' }}>
              <h4 style={{ margin: '0 0 5px 0', color: '#00bcd4' }}>🤖 Dane robota</h4>
              <p style={{ margin: '5px 0', color: '#aaa' }}>Model: <strong style={{ color: '#fff' }}>{robotInfo?.config?.model || '[Brak]'}</strong></p>
              <p style={{ margin: '5px 0', color: '#aaa' }}>Lokalizacja: <strong style={{ color: '#fff' }}>{robotInfo?.config?.location || '[Brak]'}</strong></p>
              {robotInfo?.config?.description && (
                <p style={{ margin: '5px 0', color: '#aaa', fontSize: '0.85rem', fontStyle: 'italic' }}>{robotInfo.config.description}</p>
              )}
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
              {/* TABELA STATYSTYK (Pokazywana zawsze) */}
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
                            {statsData.aCols.map(c => {
                              const val = statsData.errors[metric][c];
                              const bgColor = getErrorColor(val, statsData.maxes.A[metric]);
                              return (
                                <td key={c} style={{ padding: '8px', borderBottom: '1px solid #333', borderRight: c === statsData.aCols[statsData.aCols.length - 1] ? '1px solid #444' : 'none' }}>
                                  <div style={{ background: '#222', borderBottom: `4px solid ${bgColor}`, padding: '4px', borderRadius: '4px', fontWeight: 'bold' }}>{val.toFixed(3)}</div>
                                </td>
                              );
                            })}
                            {statsData.curCols.map(c => {
                              const val = statsData.errors[metric][c];
                              const bgColor = getErrorColor(val, statsData.maxes.Cur[metric]);
                              return (
                                <td key={c} style={{ padding: '8px', borderBottom: '1px solid #333' }}>
                                  <div style={{ background: '#222', borderBottom: `4px solid ${bgColor}`, padding: '4px', borderRadius: '4px', fontWeight: 'bold' }}>{val.toFixed(3)}</div>
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

              {/* RENDEROWANIE ZALEŻNE OD TRYBU */}
              {viewMode === 'detailed' ? (
                <>
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

                  <h3 style={{ color: '#fff', marginBottom: '0.5rem', borderBottom: '1px solid #444', paddingBottom: '5px' }}>
                    Porównanie z referencją {unit ? `[${unit}]` : ''}
                  </h3>
                  <div style={{ height: '300px', background: '#111', padding: '1rem', borderRadius: '8px', border: '1px solid #333', marginBottom: '2.5rem' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={displayedData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }} onMouseDown={(e) => e && setRefAreaLeft(e.activeLabel as number)} onMouseMove={(e) => refAreaLeft && e && setRefAreaRight(e.activeLabel as number)} onMouseUp={handleZoom} style={{ userSelect: 'none', cursor: 'crosshair' }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="Time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => v.toFixed(1) + 's'} stroke="#888" hide />
                        <YAxis domain={['auto', 'auto']} stroke="#888" label={{ value: unit, angle: -90, position: 'insideLeft', fill: '#888' }} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#444' }} 
                          labelFormatter={(l) => `Czas: ${Number(l).toFixed(3)}s`} 
                          formatter={(v: any, name: any) => {
                            if (Array.isArray(v)) return [`od ${v[0].toFixed(2)} do ${v[1].toFixed(2)} ${unit}`, name];
                            return [`${Number(v).toFixed(2)} ${unit}`, name];
                          }} 
                        />
                        <Legend verticalAlign="top" height={36} />
                        
                        {violationAreas.map((area, idx) => (
                          <ReferenceArea key={`violation-${idx}`} x1={area.start} x2={area.end} fill="#f44336" fillOpacity={0.25} strokeOpacity={0} />
                        ))}

                        <Line name="Górny limit" type="monotone" dataKey="UpperLimit" stroke="#9e9e9e" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                        <Line name="Dolny limit" type="monotone" dataKey="LowerLimit" stroke="#9e9e9e" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                        <Line name="Referencja" type="monotone" dataKey="Referencja" stroke="#4caf50" strokeWidth={2} dot={false} isAnimationActive={false} />
                        <Line name="Badany" type="monotone" dataKey="Badany" stroke="#ffeb3b" strokeWidth={2} dot={false} isAnimationActive={false} />
                        
                        {refAreaLeft !== null && refAreaRight !== null && <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill="#e91e63" fillOpacity={0.3} />}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

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
                        
                        {violationAreas.map((area, idx) => (
                          <ReferenceArea key={`diff-violation-${idx}`} x1={area.start} x2={area.end} fill="#f44336" fillOpacity={0.25} strokeOpacity={0} />
                        ))}

                        <Line name="Δ Odchylenie (Badany - Ref)" type="monotone" dataKey="Roznica" stroke="#ff5722" strokeWidth={2} dot={false} isAnimationActive={false} />
                        {refAreaLeft !== null && refAreaRight !== null && <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill="#e91e63" fillOpacity={0.3} />}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                /* WIDOK ZBIORCZY (DASHBOARD) */
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '1rem' }}>
                  <div>
                    <h4 style={{ color: '#00bcd4', textAlign: 'center', borderBottom: '1px solid #333', paddingBottom: '5px', marginTop: 0 }}>Osie Kątowe (A)</h4>
                    {statsData?.aCols.map(col => (
                      <MiniAnalizaChart key={col} title={col} data={prepareColumnData(col)} unit="°" />
                    ))}
                  </div>
                  <div>
                    <h4 style={{ color: '#ffeb3b', textAlign: 'center', borderBottom: '1px solid #333', paddingBottom: '5px', marginTop: 0 }}>Prądy Silników (Cur)</h4>
                    {statsData?.curCols.map(col => (
                      <MiniAnalizaChart key={col} title={col} data={prepareColumnData(col)} unit="%" />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : ( <div style={{ marginTop: '2rem', padding: '3rem', border: '2px dashed #444', borderRadius: '8px', color: '#aaa', textAlign: 'center' }}>Wybierz robota...</div> )}
    </div>
  );
};

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