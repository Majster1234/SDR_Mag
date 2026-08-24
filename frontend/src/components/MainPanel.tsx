import { useState, useEffect } from 'react';
import { Notifications, emitAppLog } from './Notifications'; 

import { KonfiguracjaRobota } from './KonfiguracjaRobota';
import { PodgladDanych } from './PodgladDanych';
import { AnalizaPrzebiegow } from './AnalizaPrzebiegow';
import { ZarzadzanieAI } from './zarzadzanieAI';

const MODULES = [
  { id: 'podglad_danych', icon: '📊', shortName: 'Eksplorator' },
  { id: 'analiza_przebiegow', icon: '📈', shortName: 'Analiza' },
  { id: 'zarzadzanie_ai', icon: '🧠', shortName: 'Modele ML' },
  { id: 'konfiguracja', icon: '⚙️', shortName: 'Konfiguracja' }
];

export const MainPanel = ({ activeModule, setActiveModule, selectedFilePath, systemNotification }: any) => {
  const [isLightMode, setIsLightMode] = useState(false);
  
  // Tłumaczenie powiadomień z WebSocketa (np. wgrano plik) na zdarzenie appLog, 
  // dzięki czemu nasz komponent Notifications "wyłapie" to i wypuści latający dymek!
  useEffect(() => {
    if (systemNotification) {
      emitAppLog('warning', `🤖 ${systemNotification}`);
    }
  }, [systemNotification]);

  // Logika zmiany motywu
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

  const renderActiveModule = () => {
    switch (activeModule) {
      case 'konfiguracja': return <KonfiguracjaRobota selectedFilePath={selectedFilePath} />;
      case 'podglad_danych': return <PodgladDanych selectedFilePath={selectedFilePath} />;
      case 'analiza_przebiegow': return <AnalizaPrzebiegow selectedFilePath={selectedFilePath} />;
      case 'zarzadzanie_ai': return <ZarzadzanieAI />;
      default: return <PodgladDanych selectedFilePath={selectedFilePath} />;
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#141414', height: '100vh', position: 'relative' }}>
      
      {/* --- SUPER-NOWOCZESNY NAGŁÓWEK --- */}
      <div style={{ 
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
        padding: '0.8rem 1.5rem', backgroundColor: '#1a1a1a', borderBottom: '1px solid #2a2a2a', height: '60px', boxSizing: 'border-box'
      }}>
        
        {/* LEWA STRONA: Tytuł */}
        <div style={{ display: 'flex', alignItems: 'center', width: '30%' }}>
          <h1 style={{ margin: 0, fontSize: '1.15rem', color: '#fff', fontWeight: 600, letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
            Panel Diagnostyczny
          </h1>
        </div>
        
        {/* ŚRODEK: Pasek Wyboru Modułów */}
        <div style={{ display: 'flex', background: '#111', borderRadius: '8px', padding: '4px', border: '1px solid #2a2a2a' }}>
          {MODULES.map(mod => (
            <button
              key={mod.id}
              onClick={() => setActiveModule(mod.id)}
              style={{
                background: activeModule === mod.id ? '#2a2a2a' : 'transparent',
                color: activeModule === mod.id ? '#fff' : '#888',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '0.85rem',
                fontWeight: activeModule === mod.id ? 600 : 'normal',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: activeModule === mod.id ? '0 1px 4px rgba(0,0,0,0.4)' : 'none'
              }}
            >
              <span style={{ opacity: activeModule === mod.id ? 1 : 0.6 }}>{mod.icon}</span> 
              {mod.shortName}
            </button>
          ))}
        </div>

        {/* PRAWA STRONA: Narzędzia (Motyw, Notifications) */}
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', width: '30%', justifyContent: 'flex-end' }}>
          
          <button
            onClick={() => setIsLightMode(!isLightMode)}
            style={{
              background: 'transparent',
              border: '1px solid transparent',
              color: isLightMode ? '#fff' : '#aaa',
              padding: '6px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: '0.2s',
              width: '32px',
              height: '32px',
              fontSize: '1rem'
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#222'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            title={isLightMode ? "Włącz tryb ciemny" : "Włącz tryb jasny"}
          >
            {isLightMode ? '☀️' : '🌙'}
          </button>

          {/* Twój samodzielny komponent powiadomień */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Notifications /> 
          </div>

        </div>
      </div>

      {/* --- OBSZAR ROBOCZY ZAKŁADEK --- */}
      <div style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
        {renderActiveModule()}
      </div>
      
    </div>
  );
};