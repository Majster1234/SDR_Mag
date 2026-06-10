import { useState, useEffect, useRef } from 'react';

export type LogType = 'info' | 'error' | 'warning' | 'success';

export interface LogEntry {
  id: number;
  timestamp: Date;
  type: LogType;
  message: string;
}

// Funkcja pomocnicza, którą możesz wywołać z KAŻDEGO miejsca w kodzie
export const emitAppLog = (type: LogType, message: string) => {
  window.dispatchEvent(new CustomEvent('appLog', { detail: { type, message } }));
};

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

  return (
    <div style={{ position: 'relative' }} ref={popupRef}>
      {/* Przycisk Robaczka */}
      <button 
        onClick={togglePopup}
        style={{
          background: '#222', border: '1px solid #444', borderRadius: '8px', 
          padding: '8px 12px', cursor: 'pointer', fontSize: '1.2rem',
          position: 'relative', display: 'flex', alignItems: 'center', transition: '0.2s'
        }}
        title="Dziennik zdarzeń i błędów"
      >
        🐛
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: '-5px', right: '-5px', background: '#e91e63',
            color: 'white', fontSize: '0.7rem', fontWeight: 'bold', padding: '2px 6px',
            borderRadius: '10px', border: '2px solid #1a1a1a'
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Okno Popup */}
      {isOpen && (
        <div style={{
          position: 'absolute', top: '120%', right: '0', width: '350px', maxHeight: '500px',
          background: '#222', border: '1px solid #444', borderRadius: '8px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', zIndex: 9999
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