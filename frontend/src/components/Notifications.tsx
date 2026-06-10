import { useState, useEffect, useRef } from 'react';

export type LogType = 'info' | 'error' | 'warning' | 'success';

export interface LogEntry {
  id: number;
  timestamp: Date;
  type: LogType;
  message: string;
}

// Funkcja pomocnicza do emitowania logów
export const emitAppLog = (type: LogType, message: string) => {
  window.dispatchEvent(new CustomEvent('appLog', { detail: { type, message } }));
};

// --- NOWY ELEMENT: Płaska ikona SVG robaka/pająka ---
const BugIcon = ({ color }: { color: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="22" 
    height="22" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={color} 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    style={{ transition: 'stroke 0.3s ease' }}
  >
    <path d="m8 2 1.88 1.88"/>
    <path d="M14.12 3.88 16 2"/>
    <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/>
    <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/>
    <path d="M12 20v-9"/>
    <path d="M6.53 9C4.6 8.8 3 7.1 3 5"/>
    <path d="M17.47 9c1.93-.2 3.53-1.9 3.53-4"/>
    <path d="M8 14H4"/>
    <path d="M16 14h4"/>
    <path d="M9.5 19c-2.3 1.2-4.5 1-4.5 1"/>
    <path d="M14.5 19c2.3 1.2 4.5 1 4.5 1"/>
  </svg>
);

export const Notifications = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const popupRef = useRef<HTMLDivElement>(null);

  // Nasłuchiwanie na globalne zdarzenia 'appLog'
  useEffect(() => {
    const handleLog = (e: any) => {
      const newLog: LogEntry = {
        id: Date.now() + Math.random(),
        timestamp: new Date(),
        type: e.detail.type || 'info',
        message: e.detail.message
      };
      
      setLogs((prev) => [newLog, ...prev]);
      
      // Zwiększ licznik, jeśli okno jest zamknięte
      setIsOpen((currentlyOpen) => {
        if (!currentlyOpen) setUnreadCount((c) => c + 1);
        return currentlyOpen;
      });
    };

    window.addEventListener('appLog', handleLog);
    return () => window.removeEventListener('appLog', handleLog);
  }, []);

  // Zamknięcie popupu po kliknięciu poza nim
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const togglePopup = () => {
    setIsOpen(!isOpen);
    if (!isOpen) setUnreadCount(0); // Zerujemy powiadomienia po otwarciu
  };

  const clearLogs = () => {
    setLogs([]);
    setUnreadCount(0);
  };

  const getLogStyle = (type: LogType) => {
    switch (type) {
      case 'error': return { borderLeft: '4px solid #f44336', bg: '#f4433611', icon: '❌', color: '#f44336' };
      case 'warning': return { borderLeft: '4px solid #ff9800', bg: '#ff980011', icon: '⚠️', color: '#ff9800' };
      case 'success': return { borderLeft: '4px solid #4caf50', bg: '#4caf5011', icon: '✅', color: '#4caf50' };
      default: return { borderLeft: '4px solid #00bcd4', bg: '#00bcd411', icon: 'ℹ️', color: '#00bcd4' };
    }
  };

  // --- OBLICZANIE KOLORU IKONY NA PODSTAWIE STANU ---
  const getIconColor = () => {
    if (unreadCount === 0) return '#4caf50'; // Zielony, gdy wszystko OK (brak powiadomień)
    const lastLog = logs[0];
    if (lastLog?.type === 'error') return '#f44336'; // Czerwony przy błędzie
    if (lastLog?.type === 'warning') return '#ff9800'; // Pomarańczowy przy ostrzeżeniu
    return '#ccc'; // Standardowy przy info/success
  };

  return (
    <div style={{ position: 'relative' }} ref={popupRef}>
      {/* Przycisk Robaczka */}
      <button 
        onClick={togglePopup}
        style={{
          background: '#1a1a1a',          // Ciemne tło
          border: '2px solid #444',      // Wyraźne, grubsze obramowanie
          borderRadius: '10px',          // Zaokrąglone rogi (bardziej kwadratowe niż pigułka)
          padding: '10px',               // Kwadratowy padding
          cursor: 'pointer', 
          position: 'relative', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          transition: 'all 0.2s ease',
          boxShadow: '0 2px 5px rgba(0,0,0,0.3)' // Lekki cień
        }}
        title="Dziennik zdarzeń i błędów"
        onMouseEnter={e => e.currentTarget.style.borderColor = '#666'} // Jaśniejsze obramowanie przy hover
        onMouseLeave={e => e.currentTarget.style.borderColor = '#444'}
      >
        {/* Renderowanie ikony SVG z obliczonym kolorem */}
        <BugIcon color={getIconColor()} />

        {/* Licznik powiadomień */}
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', 
            top: '-6px', 
            right: '-6px', 
            background: '#e91e63', // Kolor tła licznika (ciemny róż)
            color: 'white', 
            fontSize: '0.7rem', 
            fontWeight: 'bold', 
            padding: '2px 6px',
            borderRadius: '10px', 
            border: '2px solid #111' // Obramowanie licznika pasujące do paska App
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Okno Popup (pozostaje bez zmian stylistycznych, tylko dodano zIndex) */}
      {isOpen && (
        <div style={{
          position: 'absolute', top: '130%', right: '0', width: '350px', maxHeight: '500px',
          background: '#222', border: '1px solid #444', borderRadius: '8px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', zIndex: 99999 // Bardzo wysoki z-index
        }}>
          {/* Nagłówek Popupu */}
          <div style={{ padding: '10px 15px', borderBottom: '1px solid #444', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#2a2a2a', borderTopLeftRadius: '8px', borderTopRightRadius: '8px' }}>
            <h4 style={{ margin: 0, color: '#fff' }}>Dziennik zdarzeń</h4>
            <button onClick={clearLogs} style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline' }}>Wyczyść</button>
          </div>

          {/* Lista logów */}
          <div style={{ overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
            {logs.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#666', fontSize: '0.9rem', margin: '20px 0' }}>Brak nowych zdarzeń.</p>
            ) : (
              logs.map((log) => {
                const style = getLogStyle(log.type);
                return (
                  <div key={log.id} style={{ background: style.bg, borderLeft: style.borderLeft, padding: '8px 10px', borderRadius: '4px', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 'bold', color: style.color }}>{style.icon} {log.type.toUpperCase()}</span>
                      <span style={{ color: '#888', fontSize: '0.75rem' }}>{log.timestamp.toLocaleTimeString()}</span>
                    </div>
                    <div style={{ color: '#ddd' }}>{log.message}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};