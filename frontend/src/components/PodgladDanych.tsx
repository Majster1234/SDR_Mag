// PodgladDanych.tsx
import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea } from 'recharts';
import { COLORS, getUnit } from './utils';

export const PodgladDanych = ({ selectedFilePath }: { selectedFilePath: string | null }) => {
  const [fileInfo, setFileInfo] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeColumns, setActiveColumns] = useState<string[]>([]);
  
  const [refAreaLeft, setRefAreaLeft] = useState<number | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<number | null>(null);
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!selectedFilePath) {
      setFileInfo(null); setChartData([]); setActiveColumns([]); setZoomRange(null);
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

  return (
    <div style={{ textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ color: '#2196f3' }}>📊 Podgląd danych</h2>
        {zoomRange && <button onClick={() => setZoomRange(null)} style={{ padding: '6px 16px', background: '#e91e63', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>🔍 Resetuj Zoom</button>}
      </div>
      
      {selectedFilePath ? (
        <div style={{ marginTop: '1.5rem', padding: '1.5rem', border: '1px solid #444', borderRadius: '8px', backgroundColor: '#1a1a1a' }}>
          <h3 style={{ color: '#ffeb3b', marginTop: 0, borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>Wybrano plik: {selectedFilePath}</h3>
          {isLoading ? (
            <p style={{ color: '#aaa', fontStyle: 'italic', margin: '2rem 0' }}>⏳ Trwa analiza i ładowanie danych do wykresu...</p>
          ) : fileInfo && fileInfo.is_valid ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem', marginTop: '1rem' }}>
                <div style={{ background: '#2a2a2a', padding: '1rem', borderRadius: '4px' }}><p style={{ margin: '0 0 5px 0', color: '#aaa', fontSize: '0.9rem' }}>Format</p><strong style={{ color: '#4caf50' }}>✅ Poprawny CSV</strong></div>
                <div style={{ background: '#2a2a2a', padding: '1rem', borderRadius: '4px' }}><p style={{ margin: '0 0 5px 0', color: '#aaa', fontSize: '0.9rem' }}>Liczba próbek</p><strong>{fileInfo.rows_count}</strong></div>
                <div style={{ background: '#2a2a2a', padding: '1rem', borderRadius: '4px' }}><p style={{ margin: '0 0 5px 0', color: '#aaa', fontSize: '0.9rem' }}>Data zapisu</p><strong>{fileInfo.record_date}</strong></div>
                <div style={{ background: '#2a2a2a', padding: '1rem', borderRadius: '4px' }}><p style={{ margin: '0 0 5px 0', color: '#aaa', fontSize: '0.9rem' }}>Czas nagrania</p><strong>{fileInfo.duration !== null ? `${fileInfo.duration.toFixed(2)} s` : 'Brak'}</strong></div>
              </div>
              <div style={{ marginTop: '2rem', padding: '1rem', background: '#222', borderRadius: '8px', border: '1px solid #333' }}>
                <p style={{ color: '#aaa', marginTop: 0, marginBottom: '10px' }}>Wybierz sygnały do wyświetlenia na wykresie:</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {fileInfo.columns.filter((c: string) => c !== 'Time').map((col: string, idx: number) => {
                      const isSelected = activeColumns.includes(col);
                      const colColor = COLORS[idx % COLORS.length];
                      return (
                        <div key={col} onClick={() => toggleColumn(col)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: isSelected ? `${colColor}33` : '#333', padding: '6px 12px', borderRadius: '20px', cursor: 'pointer', border: `1px solid ${isSelected ? colColor : '#555'}`, transition: 'all 0.2s' }}>
                          <div style={{ width: '14px', height: '14px', borderRadius: '3px', background: isSelected ? colColor : '#222', border: `2px solid ${isSelected ? colColor : '#888'}`, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            {isSelected && <span style={{ color: '#fff', fontSize: '10px', fontWeight: 'bold' }}>✓</span>}
                          </div>
                          <span style={{ color: isSelected ? '#fff' : '#aaa', fontWeight: isSelected ? 'bold' : 'normal' }}>{col} {getUnit(col) && `[${getUnit(col)}]`}</span>
                        </div>
                      );
                  })}
                </div>
              </div>
              {chartData.length > 0 && (
                <div style={{ position: 'relative', marginTop: '2rem', height: '450px', background: '#111', padding: '1rem', borderRadius: '8px', border: '1px solid #333' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={displayedData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }} onMouseDown={(e) => e && setRefAreaLeft(e.activeLabel as number)} onMouseMove={(e) => refAreaLeft && e && setRefAreaRight(e.activeLabel as number)} onMouseUp={handleZoom} style={{ userSelect: 'none', cursor: 'crosshair' }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis dataKey="Time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(val) => val.toFixed(1) + 's'} stroke="#888" label={{ value: 'Czas nagrania [s]', position: 'insideBottom', offset: -10, fill: '#aaa' }} />
                      <YAxis domain={['auto', 'auto']} stroke="#888" label={{ value: singleUnit, angle: -90, position: 'insideLeft', fill: '#888' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#444', borderRadius: '8px' }} itemStyle={{ fontWeight: 'bold' }} labelFormatter={(label) => `Czas: ${Number(label).toFixed(3)}s`} formatter={(value: any, name: any) => { const unit = getUnit(String(name)); return [`${Number(value).toFixed(2)}${unit ? ' ' + unit : ''}`, name]; }} />
                      <Legend verticalAlign="top" height={36} />
                      {fileInfo.columns.filter((c: string) => c !== 'Time').map((col: string, idx: number) => {
                          const isSelected = activeColumns.includes(col);
                          const isLabel = col === 'Label';
                          if (!isSelected) return null;
                          return <Line key={col} type={isLabel ? "stepAfter" : "monotone"} dataKey={col} stroke={isLabel ? "#ffeb3b" : COLORS[idx % COLORS.length]} strokeWidth={isLabel ? 3 : 2} dot={false} isAnimationActive={false} name={isLabel ? "🔢 ID Operacji (Label)" : `${col} ${getUnit(col) ? '[' + getUnit(col) + ']' : ''}`} />;
                      })}
                      {refAreaLeft !== null && refAreaRight !== null && <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill="#8884d8" fillOpacity={0.3} />}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          ) : (<p style={{ color: '#f44336' }}><strong>❌ Błąd:</strong> {fileInfo?.error_msg}</p>)}
        </div>
      ) : (
        <div style={{ marginTop: '2rem', padding: '3rem', border: '2px dashed #444', borderRadius: '8px', color: '#aaa', textAlign: 'center' }}><span style={{ fontSize: '2rem' }}>👈</span><br/><br/>Wybierz plik z drzewka po lewej stronie, aby rozpocząć.</div>
      )}
    </div>
  );
};