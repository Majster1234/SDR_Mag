import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

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
  
  // Stan przechowujący listę aktualnie zaznaczonych kolumn
  const [activeColumns, setActiveColumns] = useState<string[]>([]);

  // Wyciągamy samą nazwę pliku
  const fileName = selectedFilePath ? selectedFilePath.split(/[/\\]/).pop() : '';

  useEffect(() => {
    if (!selectedFilePath) {
      setFileInfo(null);
      setChartData([]);
      setActiveColumns([]);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      try {
        // 1. Pobieramy informacje o pliku (nasz poprzedni kod)
        const infoRes = await fetch('http://127.0.0.1:8000/api/file-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: selectedFilePath })
        });
        
        if (infoRes.ok) {
          const infoData = await infoRes.json();
          setFileInfo(infoData);
          
          // Domyślnie zaznaczamy pierwszą kolumnę po "Time" (żeby wykres nie był pusty na start)
          const dataColumns = infoData.columns.filter((c: string) => c !== 'Time' && c !== 'Label');
          if (dataColumns.length > 0) {
            setActiveColumns([dataColumns[0]]);
          }

          // 2. Jeśli plik jest poprawny, pobieramy właściwe punkty danych do wykresu
          if (infoData.is_valid) {
            const dataRes = await fetch('http://127.0.0.1:8000/api/file-data', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: selectedFilePath })
            });
            if (dataRes.ok) {
              const data = await dataRes.json();
              setChartData(data);
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

  // Funkcja obsługująca kliknięcie w "Checkbox" (pill) kolumny
  const toggleColumn = (colName: string) => {
    setActiveColumns(prev => 
      prev.includes(colName) 
        ? prev.filter(c => c !== colName) // Usuń jeśli było
        : [...prev, colName]              // Dodaj jeśli nie było
    );
  };

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
              {/* Informacje statyczne */}
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

              {/* INTERAKTYWNE WYBIERANIE KOLUMN (CHECKBOXY) */}
              <div style={{ marginTop: '2rem', padding: '1rem', background: '#222', borderRadius: '8px', border: '1px solid #333' }}>
                <p style={{ color: '#aaa', marginTop: 0, marginBottom: '10px' }}>Wybierz sygnały do wyświetlenia na wykresie:</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {fileInfo.columns
                    .filter((c: string) => c !== 'Time') // Ignorujemy czas (oś X) i etykiety tekstowe
                    .map((col: string, idx: number) => {
                      const isSelected = activeColumns.includes(col);
                      const colColor = COLORS[idx % COLORS.length];

                      return (
                        <div 
                          key={col}
                          onClick={() => toggleColumn(col)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            background: isSelected ? `${colColor}33` : '#333', // Przezroczyste tło gdy aktywne
                            padding: '6px 12px', borderRadius: '20px', cursor: 'pointer',
                            border: `1px solid ${isSelected ? colColor : '#555'}`,
                            transition: 'all 0.2s'
                          }}
                        >
                          {/* Ikona Checkboxa */}
                          <div style={{
                            width: '14px', height: '14px', borderRadius: '3px',
                            background: isSelected ? colColor : '#222',
                            border: `2px solid ${isSelected ? colColor : '#888'}`,
                            display: 'flex', justifyContent: 'center', alignItems: 'center'
                          }}>
                            {isSelected && <span style={{ color: '#fff', fontSize: '10px', fontWeight: 'bold' }}>✓</span>}
                          </div>
                          <span style={{ color: isSelected ? '#fff' : '#aaa', fontWeight: isSelected ? 'bold' : 'normal' }}>
                            {col}
                          </span>
                        </div>
                      );
                  })}
                </div>
              </div>

              {/* WYKRES DANYCH */}
              {chartData.length > 0 && (
                <div style={{ marginTop: '2rem', height: '450px', background: '#111', padding: '1rem', borderRadius: '8px', border: '1px solid #333' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      
                      <XAxis 
                        dataKey="Time" 
                        type="number" 
                        domain={['dataMin', 'dataMax']} 
                        tickFormatter={(val) => val.toFixed(1) + 's'}
                        stroke="#888" 
                        label={{ value: 'Czas nagrania [s]', position: 'insideBottom', offset: -10, fill: '#aaa' }}
                      />
                      
                      {/* domian=['auto', 'auto'] sprawia, że oś Y dopasowuje się do klikniętych kolumn */}
                      <YAxis domain={['auto', 'auto']} stroke="#888" />
                      
                      {/* Ciemny motyw dla dymka (tooltip) */}
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1a1a1a', borderColor: '#444', borderRadius: '8px' }}
                        itemStyle={{ fontWeight: 'bold' }}
                        labelFormatter={(label) => `Czas: ${Number(label).toFixed(3)}s`}
                      />
                      
                      <Legend verticalAlign="top" height={36} />
                      
                      {/* Dynamiczne renderowanie linii */}
                      {fileInfo.columns
                        .filter((c: string) => c !== 'Time')
                        .map((col: string, idx: number) => (
                          activeColumns.includes(col) && (
                            <Line 
                              key={col} 
                              type="monotone" 
                              dataKey={col} 
                              stroke={COLORS[idx % COLORS.length]} 
                              strokeWidth={2}
                              dot={false} // Wyłączamy kropki na łączeniach dla lepszej wydajności przy wielu punktach
                              isAnimationActive={false} // Wyłączamy animacje wjazdowe, by wykres rysował się błyskawicznie
                            />
                          )
                      ))}
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

export const MainPanel = ({ 
  activeModule, setActiveModule, selectedFilePath, systemNotification 
}: any) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const modules = [
    { id: 'konfiguracja', name: '⚙️ Konfiguracja robota' },
    { id: 'podglad_danych', name: '📊 Podgląd danych' },
    { id: 'ostatnie_operacje', name: '🕒 Ostatnie operacje' },
    { id: 'rezerwa_1', name: '📦 Rezerwa 1' },
    { id: 'rezerwa_2', name: '📦 Rezerwa 2' },
  ];

  const renderActiveModule = () => {
    switch (activeModule) {
      case 'konfiguracja': return <KonfiguracjaRobota />;
      case 'podglad_danych': return <PodgladDanych selectedFilePath={selectedFilePath} />;
      case 'ostatnie_operacje': return <OstatnieOperacje />;
      case 'rezerwa_1': return <Rezerwa numer={1} />;
      case 'rezerwa_2': return <Rezerwa numer={2} />;
      default: return <PodgladDanych selectedFilePath={selectedFilePath} />;
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#242424', height: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 2rem', backgroundColor: '#1e1e1e', borderBottom: '1px solid #444' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#fff' }}>Panel Diagnostyczny</h1>
        
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
                  onClick={() => {
                    setActiveModule(mod.id);
                    setIsMenuOpen(false);
                  }}
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