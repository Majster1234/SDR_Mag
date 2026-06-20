// MainPanel.tsx
import { useState, useEffect } from 'react';
import { Notifications } from './Notifications';

// Importujemy Twoje nowo wydzielone pliki:
import { KonfiguracjaRobota } from './KonfiguracjaRobota';
import { PodgladDanych } from './PodgladDanych';
import { AnalizaPrzebiegow } from './AnalizaPrzebiegow';
import { ZarzadzanieAI } from './zarzadzanieAI';
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
  const [isLightMode, setIsLightMode] = useState(false);

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
      case 'zarzadzanie_ai': return <ZarzadzanieAI />;
      default: return <PodgladDanych selectedFilePath={selectedFilePath} />;
    }
  };

  useEffect(() => {
    if (isLightMode) {
      document.documentElement.style.filter = 'invert(1) hue-rotate(180deg)';
      document.documentElement.style.backgroundColor = '#f0f0f0'; 
    } else {
      document.documentElement.style.filter = 'none';
      document.documentElement.style.backgroundColor = '#111';
    }
    return () => {
      document.documentElement.style.filter = 'none';
      document.documentElement.style.backgroundColor = '#111';
    };
  }, [isLightMode]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#242424', height: '100vh', position: 'relative' }}>
      
      {/* NAGŁÓWEK PANELU */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 2rem', backgroundColor: '#1e1e1e', borderBottom: '1px solid #444' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#fff' }}>Panel Diagnostyczny</h1>
        
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          
          {/* --- FANCY SLIDER ZMIANY MOTYWU --- */}
          <div
            onClick={() => setIsLightMode(!isLightMode)}
            style={{
              width: '64px',
              height: '32px',
              // Kiedy włączamy jasny motyw, tło w kodzie to #1a1a1a, co po nałożeniu filtra invert() staje się pięknym jasnoszarym
              backgroundColor: isLightMode ? '#1a1a1a' : '#2a2a2a', 
              border: '1px solid #444',
              borderRadius: '20px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '2px',
              position: 'relative',
              boxSizing: 'border-box'
            }}
            title="Przełącz motyw"
          >
            {/* Statyczne tło ikonek (pod spodem) */}
            <span style={{ position: 'absolute', left: '6px', fontSize: '14px', opacity: isLightMode ? 0.3 : 1, transition: '0.3s' }}>🌙</span>
            <span style={{ position: 'absolute', right: '6px', fontSize: '14px', opacity: isLightMode ? 1 : 0.3, transition: '0.3s' }}>☀️</span>

            {/* Animowane kółeczko (Thumb) */}
            <div
              style={{
                width: '26px',
                height: '26px',
                // #000 odwróci się na śnieżnobiały kolor w trybie jasnym
                backgroundColor: isLightMode ? '#000' : '#444', 
                borderRadius: '50%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                transform: isLightMode ? 'translateX(32px)' : 'translateX(0)',
                // Efekt sprężynki z cubic-bezier
                transition: 'transform 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55), background-color 0.4s', 
                zIndex: 2,
                boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
                fontSize: '13px'
              }}
            >
              {isLightMode ? '☀️' : '🌙'}
            </div>
          </div>

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

      {/* OBSZAR ROBOCZY ZAKŁADEK */}
      <div style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
        {systemNotification && <div style={{ backgroundColor: '#ff9800', color: 'black', padding: '1rem', margin: '0 auto 1.5rem auto', maxWidth: '600px', borderRadius: '8px', fontWeight: 'bold', textAlign: 'center' }}>{systemNotification}</div>}
        {renderActiveModule()}
      </div>
      
    </div>
  );
};