import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea } from 'recharts';
import { Notifications,type NotificationItem } from './Notifications'; // <-- DODANY IMPORT

const KonfiguracjaRobota = () => (
  <div style={{ textAlign: 'left', padding: '1rem' }}>
    <h2 style={{ color: '#4caf50' }}>⚙️ Konfiguracja robota</h2>
    <p style={{ color: '#aaa' }}>Tutaj znajdą się parametry konfiguracyjne wybranego robota (np. IP, częstotliwość próbkowania, limity alarmowe).</p>
  </div>
);

const COLORS = [
  '#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#00C49F', 
  '#FFBB28', '#FF8042', '#0088FE', '#ff0055', '#4caf50', '#9c27b0'
];

const PodgladDanych = ({ selectedFilePath }: { selectedFilePath: string | null }) => {
  const [fileInfo, setFileInfo] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeColumns, setActiveColumns] = useState<string[]>([]);
  
  // --- NOWE STANY DO OBSŁUGI ZOOMA ---
  const [refAreaLeft, setRefAreaLeft] = useState<number | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<number | null>(null);
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);

  const fileName = selectedFilePath ? selectedFilePath.split(/[/\\]/).pop() : '';

  useEffect(() => {
    if (!selectedFilePath) {
      setFileInfo(null);
      setChartData([]);
      setActiveColumns([]);
      setZoomRange(null); // Reset zooma przy nowym pliku
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
              setZoomRange(null); // Reset przy pobraniu nowych danych
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

  // --- FUNKCJE OBSŁUGUJĄCE ZOOM ---
  const handleZoom = () => {
    if (refAreaLeft === refAreaRight || refAreaLeft === null || refAreaRight === null) {
      setRefAreaLeft(null);
      setRefAreaRight(null);
      return;
    }

    // Zamiana miejscami, jeśli użytkownik zaznaczył od prawej do lewej
    let [left, right] = [refAreaLeft, refAreaRight];
    if (left > right) [left, right] = [right, left];

    setZoomRange([left, right]);
    setRefAreaLeft(null);
    setRefAreaRight(null);
  };

  const zoomOut = () => {
    setZoomRange(null);
  };

  // Filtrujemy dane w locie. Jeśli zoomRange jest ustawiony, pokazujemy tylko ten wycinek, 
  // co zmusza oś Y do perfekcyjnego, automatycznego przeskalowania!
  const displayedData = zoomRange 
    ? chartData.filter(d => d.Time >= zoomRange[0] && d.Time <= zoomRange[1])
    : chartData;

  return (
    <div style={{ textAlign: 'left' }}>
      <h2 style={{ color: '#2196f3' }}>📊 Podgląd danych</h2>
      
      {selectedFilePath ? (
        <div style={{ marginTop: '1.5rem', padding: '1.5rem', border: '1px solid #444', borderRadius: '8px', backgroundColor: '#1a1a1a' }}>
          <h3 style={{ color: '#ffeb3b', marginTop: 0, borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>
            Wybrano plik: {selectedFilePath}
          </h3>
          
          {isLoading ? (
            <p style={{ color: '#aaa', fontStyle: 'italic', margin: '2rem 0' }}>⏳ Trwa analiza i ładowanie danych do wykresu...</p>
          ) : fileInfo && fileInfo.is_valid ? (
            <>
              {/* Statystyki pliku */}
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

              {/* Checkboxy kolumn */}
              <div style={{ marginTop: '2rem', padding: '1rem', background: '#222', borderRadius: '8px', border: '1px solid #333' }}>
                <p style={{ color: '#aaa', marginTop: 0, marginBottom: '10px' }}>Wybierz sygnały do wyświetlenia na wykresie (Zaznacz obszar na wykresie aby przybliżyć):</p>
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
                          <span style={{ color: isSelected ? '#fff' : '#aaa', fontWeight: isSelected ? 'bold' : 'normal' }}>{col}</span>
                        </div>
                      );
                  })}
                </div>
              </div>

              {/* WYKRES */}
              {chartData.length > 0 && (
                <div style={{ position: 'relative', marginTop: '2rem', height: '450px', background: '#111', padding: '1rem', borderRadius: '8px', border: '1px solid #333' }}>
                  
                  {/* Przycisk resetowania Zooma */}
                  {zoomRange && (
                    <button 
                      onClick={zoomOut}
                      style={{ 
                        position: 'absolute', top: '15px', right: '40px', zIndex: 100, 
                        padding: '6px 16px', background: '#e91e63', color: 'white', 
                        border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
                      }}
                    >
                      🔍 Resetuj Zoom
                    </button>
                  )}

                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart 
                      data={displayedData} // Wstrzykujemy odfiltrowane dane!
                      margin={{ top: 10, right: 30, left: 0, bottom: 20 }}
                      onMouseDown={(e) => e && setRefAreaLeft(e.activeLabel as number)}
                      onMouseMove={(e) => refAreaLeft && e && setRefAreaRight(e.activeLabel as number)}
                      onMouseUp={handleZoom}
                      style={{ userSelect: 'none', cursor: 'crosshair' }} // Kursor celownika dla wygody
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis 
                        dataKey="Time" 
                        type="number" 
                        domain={['dataMin', 'dataMax']} 
                        tickFormatter={(val) => val.toFixed(1) + 's'} 
                        stroke="#888" 
                        label={{ value: 'Czas nagrania [s]', position: 'insideBottom', offset: -10, fill: '#aaa' }} 
                      />
                      <YAxis domain={['auto', 'auto']} stroke="#888" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#444', borderRadius: '8px' }} 
                        itemStyle={{ fontWeight: 'bold' }} 
                        labelFormatter={(label) => `Czas: ${Number(label).toFixed(3)}s`} 
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
                              key={col} 
                              type={isLabel ? "stepAfter" : "monotone"} 
                              dataKey={col} 
                              stroke={isLabel ? "#ffeb3b" : COLORS[idx % COLORS.length]} 
                              strokeWidth={isLabel ? 3 : 2} 
                              dot={false} 
                              isAnimationActive={false} 
                              name={isLabel ? "🔢 ID Operacji (Label)" : col}
                            />
                          );
                      })}

                      {/* Obszar, który się podświetla podczas rysowania prostokąta */}
                      {refAreaLeft !== null && refAreaRight !== null ? (
                        <ReferenceArea 
                          x1={refAreaLeft} 
                          x2={refAreaRight} 
                          strokeOpacity={0.3} 
                          fill="#8884d8" 
                          fillOpacity={0.3} 
                        />
                      ) : null}
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
const AnalizaPrzebiegow = ({ selectedFilePath }: { selectedFilePath: string | null }) => {
  const [robotInfo, setRobotInfo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Sprytny trik: niezależnie od tego, czy wybrano plik, czy folder robota, 
  // rozbijamy ścieżkę i zawsze bierzemy drugą część (czyli np. "Robot_1" ze ścieżki "Roboty/Robot_1/...")
  const robotName = selectedFilePath ? selectedFilePath.split(/[/\\]/)[1] : '';

  useEffect(() => {
    if (!robotName) {
      setRobotInfo(null);
      return;
    }

    const fetchInfo = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('http://127.0.0.1:8000/api/robot-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ robot_name: robotName })
        });
        
        if (response.ok) {
          const data = await response.json();
          setRobotInfo(data);
        } else {
          setRobotInfo({ error: "Błąd serwera." });
        }
      } catch (error) {
        setRobotInfo({ error: "Brak połączenia z serwerem." });
      } finally {
        setIsLoading(false);
      }
    };

    fetchInfo();
  }, [robotName]);

  return (
    <div style={{ textAlign: 'left' }}>
      <h2 style={{ color: '#e91e63' }}>📈 Analiza przebiegów (Porównywanie z referencją)</h2>
      
      {robotName ? (
        <div style={{ marginTop: '1.5rem', padding: '1.5rem', border: '1px solid #444', borderRadius: '8px', backgroundColor: '#1a1a1a' }}>
          <h3 style={{ color: '#ffeb3b', marginTop: 0, borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>
            Wybrany robot: {robotName}
          </h3>
          
          {isLoading ? (
            <p style={{ color: '#aaa', fontStyle: 'italic', margin: '2rem 0' }}>⏳ Pobieranie danych robota i pliku referencyjnego...</p>
          ) : robotInfo && !robotInfo.error ? (
            <div style={{ marginTop: '1rem', color: '#ddd' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                
                {/* DANE ROBOTA */}
                <div style={{ background: '#2a2a2a', padding: '1.5rem', borderRadius: '8px', borderLeft: '4px solid #4caf50' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#4caf50' }}>Dane robota (w przyszłości)</h4>
                  <p style={{ margin: '5px 0', color: '#aaa' }}>Model: <span style={{ color: '#fff' }}>[Brak danych]</span></p>
                  <p style={{ margin: '5px 0', color: '#aaa' }}>Lokalizacja/IP: <span style={{ color: '#fff' }}>[Brak danych]</span></p>
                </div>
                
                {/* DANE PLIKU REFERENCYJNEGO */}
                <div style={{ background: '#2a2a2a', padding: '1.5rem', borderRadius: '8px', borderLeft: '4px solid #2196f3' }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#2196f3' }}>Ostatnie nagranie referencyjne</h4>
                  {robotInfo.ref_file_info ? (
                    <>
                      <p style={{ margin: '5px 0', color: '#aaa' }}>Plik: <strong style={{ color: '#fff' }}>{robotInfo.ref_file_info.name}</strong></p>
                      <p style={{ margin: '5px 0', color: '#aaa' }}>Dodano: <strong style={{ color: '#fff' }}>{robotInfo.ref_file_info.record_date}</strong></p>
                      <p style={{ margin: '5px 0', color: '#aaa' }}>Czas trwania: <strong style={{ color: '#fff' }}>
                        {robotInfo.ref_file_info.duration !== null ? `${robotInfo.ref_file_info.duration.toFixed(2)} s` : 'Brak danych'}
                      </strong></p>
                    </>
                  ) : (
                    <p style={{ color: '#f44336', fontStyle: 'italic' }}>Brak pliku referencyjnego dla tego robota.</p>
                  )}
                </div>
              </div>

              {/* Miejsce na przyszłą magię */}
              <div style={{ padding: '2rem', border: '2px dashed #444', borderRadius: '4px', textAlign: 'center', color: '#888', marginTop: '2rem' }}>
                Tu pojawią się wykresy nałożone na siebie (Archiwum vs Referencja) oraz obliczenia odchyleń 📉
              </div>
            </div>
          ) : (
            <p style={{ color: '#f44336' }}><strong>❌ Błąd:</strong> {robotInfo?.error}</p>
          )}
        </div>
      ) : (
        <div style={{ marginTop: '2rem', padding: '3rem', border: '2px dashed #444', borderRadius: '8px', color: '#aaa', textAlign: 'center' }}>
          <span style={{ fontSize: '2rem' }}>👈</span><br/><br/>
          Wybierz głównego robota z drzewka po lewej stronie, aby rozpocząć analizę odchyleń.
        </div>
      )}
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
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false); // <-- STAN POWIADOMIEŃ

  // Symulowana lista powiadomień
  const [notifications] = useState<NotificationItem[]>([
    { id: '1', type: 'progress', message: 'Analiza FFT dla pliku przejazd_24.csv w toku...', timestamp: '14:23:10', progress: 68 },
    { id: '2', type: 'warning', message: 'Wykryto anomalię prądową w osi A3 (Robot_1).', timestamp: '14:20:05' },
    { id: '3', type: 'error', message: 'Błąd połączenia z serwerem archiwizacji OPC UA.', timestamp: '14:15:00' },
    { id: '4', type: 'info', message: 'Ukończono raport dzienny.', timestamp: '12:00:00' },
  ]);

  const modules = [
    { id: 'konfiguracja', name: '⚙️ Konfiguracja robota' },
    { id: 'podglad_danych', name: '📊 Podgląd danych' },
    { id: 'ostatnie_operacje', name: '🕒 Ostatnie operacje' },
    { id: 'analiza_przebiegow', name: '📈 Analiza przebiegów' }, // <-- ZMIENIONE TUTAJ
    { id: 'rezerwa_2', name: '📦 Rezerwa 2' },
  ];

  const renderActiveModule = () => {
    switch (activeModule) {
      case 'konfiguracja': return <KonfiguracjaRobota />;
      case 'podglad_danych': return <PodgladDanych selectedFilePath={selectedFilePath} />;
      case 'ostatnie_operacje': return <OstatnieOperacje />;
      case 'analiza_przebiegow': return <AnalizaPrzebiegow selectedFilePath={selectedFilePath} />;
      case 'rezerwa_2': return <Rezerwa numer={2} />;
      default: return <PodgladDanych selectedFilePath={selectedFilePath} />;
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#242424', height: '100vh', position: 'relative' }}>
      {/* Pasek Górny */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 2rem', backgroundColor: '#1e1e1e', borderBottom: '1px solid #444' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#fff' }}>Panel Diagnostyczny</h1>
        
        {/* Grupa przycisków z prawej strony */}
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          
          {/* PRZYCISK POWIADOMIEŃ */}
          <button 
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            style={{ 
              padding: '0.5rem 1rem', fontSize: '1rem', cursor: 'pointer', backgroundColor: '#333', 
              color: 'white', border: '1px solid #555', borderRadius: '4px', position: 'relative' 
            }}
          >
            🔔
            {notifications.length > 0 && (
              <span style={{ 
                position: 'absolute', top: '-5px', right: '-5px', background: '#f44336', 
                color: 'white', borderRadius: '50%', padding: '2px 6px', fontSize: '0.7rem', fontWeight: 'bold' 
              }}>
                {notifications.length}
              </span>
            )}
          </button>

          {/* PRZYCISK MODUŁÓW */}
          <div style={{ position: 'relative' }}>
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              style={{ padding: '0.5rem 1rem', fontSize: '1rem', cursor: 'pointer', backgroundColor: '#333', color: 'white', border: '1px solid #555', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              🗂️ Moduł: {modules.find(m => m.id === activeModule)?.name} {isMenuOpen ? '▲' : '▼'}
            </button>

            {isMenuOpen && (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '5px', backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', zIndex: 1000, width: '250px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {modules.map((mod) => (
                  <button
                    key={mod.id}
                    onClick={() => { setActiveModule(mod.id); setIsMenuOpen(false); }}
                    style={{ padding: '10px 15px', textAlign: 'left', background: activeModule === mod.id ? '#333' : 'transparent', color: 'white', border: 'none', cursor: 'pointer', fontSize: '1rem', borderBottom: '1px solid #444' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#444'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = activeModule === mod.id ? '#333' : 'transparent'}
                  >
                    {mod.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* OKNO POWIADOMIEŃ */}
      <Notifications 
        isOpen={isNotificationsOpen} 
        onClose={() => setIsNotificationsOpen(false)} 
        notifications={notifications} 
      />

      {/* GŁÓWNA ZAWARTOŚĆ */}
      <div style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
        {systemNotification && (
          <div style={{ backgroundColor: '#ff9800', color: 'black', padding: '1rem', margin: '0 auto 1.5rem auto', maxWidth: '600px', borderRadius: '8px', fontWeight: 'bold', textAlign: 'center' }}>
            {systemNotification}
          </div>
        )}
        {renderActiveModule()}
      </div>
    </div>
  );
};