// MainPanel.tsx
import { useState } from 'react';
import { Notifications } from './Notifications';

// Importujemy Twoje nowo wydzielone pliki:
import { KonfiguracjaRobota } from './KonfiguracjaRobota';
import { PodgladDanych } from './PodgladDanych';
import { AnalizaPrzebiegow } from './AnalizaPrzebiegow';

// --- BARDZO MAŁE MODUŁY (Pozostawione w głównym pliku dla wygody) ---
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
  
  // const [notifications] = useState<NotificationItem[]>([
  //   { id: '1', type: 'progress', message: 'Analiza FFT dla pliku przejazd_24.csv w toku...', timestamp: '14:23:10', progress: 68 },
  //   { id: '2', type: 'warning', message: 'Wykryto anomalię prądową w osi A3 (Robot_1).', timestamp: '14:20:05' },
  //   { id: '3', type: 'error', message: 'Błąd połączenia z serwerem archiwizacji OPC UA.', timestamp: '14:15:00' },
  // ]);

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
         <Notifications />

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

      

      <div style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
        {systemNotification && <div style={{ backgroundColor: '#ff9800', color: 'black', padding: '1rem', margin: '0 auto 1.5rem auto', maxWidth: '600px', borderRadius: '8px', fontWeight: 'bold', textAlign: 'center' }}>{systemNotification}</div>}
        {renderActiveModule()}
      </div>
    </div>
  );
};