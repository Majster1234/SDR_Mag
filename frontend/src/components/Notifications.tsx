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

// --- NOWA IKONA: Profesjonalna skrzynka odbiorcza / Dziennik ---
const InboxIcon = ({ color }: { color: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="20" 
    height="20" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={color} 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    style={{ transition: 'stroke 0.3s ease' }}
  >
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="9 9 13 12 9 15"/>
    <line x1="15" y1="15" x2="19" y2="15"/>
  </svg>
);

export const Notifications = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  
  // --- ZOPTYMALIZOWANE STANY WIZUALNE (Czekają na uderzenie dymka) ---
  const [unreadCount, setUnreadCount] = useState(0);
  const [iconColor, setIconColor] = useState('#aaa');
  const [isBumping, setIsBumping] = useState(false);
  
  const popupRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null); // Magnes (Cel lotu)
  const toastRef = useRef<HTMLDivElement>(null); // Latający dymek
  
  // Referencja na otwarcie menu, potrzebna do timerów
  const isOpenRef = useRef(isOpen);
  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);

  // --- STANY LATAJĄCEGO DYMKA ---
  const [toastState, setToastState] = useState<'hidden' | 'entering' | 'visible' | 'flying'>('hidden');
  const [toastData, setToastData] = useState({ msg: '', bg: '', border: '' });
  const [targetTransform, setTargetTransform] = useState('');
  
  // Zabezpieczone timery (Używamy ReturnType żeby nie było błędu NodeJS)
  const timers = useRef<{ show: ReturnType<typeof setTimeout> | null, fly: ReturnType<typeof setTimeout> | null, hide: ReturnType<typeof setTimeout> | null }>({ show: null, fly: null, hide: null });

  // 1. Nasłuchiwanie na globalne zdarzenia 'appLog'
  useEffect(() => {
    const handleLog = (e: any) => {
      const { type, message } = e.detail;

      // Zapisujemy log do ukrytej historii w tle (to dzieje się od razu)
      const newLog: LogEntry = {
        id: Date.now() + Math.random(),
        timestamp: new Date(),
        type: type || 'info',
        message: message
      };
      setLogs((prev) => [newLog, ...prev]);

      let prefix = '📬';
      let bg = 'rgba(33, 150, 243, 0.95)';
      let border = 'rgba(33, 150, 243, 1)';
      let targetColor = '#00bcd4';

      if (type === 'success') { prefix = '✅'; bg = 'rgba(76, 175, 80, 0.95)'; border = 'rgba(76, 175, 80, 1)'; targetColor = '#4caf50'; }
      else if (type === 'error') { prefix = '❌'; bg = 'rgba(244, 67, 54, 0.95)'; border = 'rgba(244, 67, 54, 1)'; targetColor = '#f44336'; }
      else if (type === 'warning') { prefix = '⚠️'; bg = 'rgba(255, 152, 0, 0.95)'; border = 'rgba(255, 152, 0, 1)'; targetColor = '#ff9800'; }

      // --- WYPUSZCZANIE LATAJĄCEGO DYMKA ---
      if (timers.current.show) clearTimeout(timers.current.show);
      if (timers.current.fly) clearTimeout(timers.current.fly);
      if (timers.current.hide) clearTimeout(timers.current.hide);

      setToastData({ msg: `${prefix} ${message}`, bg, border });
      setToastState('entering'); 

      timers.current.show = setTimeout(() => setToastState('visible'), 50); 
      timers.current.fly = setTimeout(() => setToastState('flying'), 2500); 
      timers.current.hide = setTimeout(() => setToastState('hidden'), 3100); 

      // --- EFEKT BUMP: Uderzenie i zmiana koloru po 3100ms ---
      // Jest to niezależny timer, który wykona się DOKŁADNIE wtedy gdy dymek dotrze do przycisku
      setTimeout(() => {
        if (!isOpenRef.current) {
          setUnreadCount(c => c + 1);
          setIconColor(targetColor);
        }
        
        // Animacja podskoczenia przycisku
        setIsBumping(true);
        setTimeout(() => setIsBumping(false), 400); // Trwa 400ms i opada

      }, 3100);
    };

    window.addEventListener('appLog', handleLog);
    return () => window.removeEventListener('appLog', handleLog);
  }, []);

  // 2. OBLICZANIE PERFEKCYJNEJ TRAJEKTORII LOTU
  useEffect(() => {
    if (toastState === 'visible') {
      // Czekamy 800ms aż wejściowa animacja (bouncy) powiadomienia całkowicie się zatrzyma, 
      // żeby przeglądarka odczytała idealne, sztywne współrzędne ekranowe, a nie te w trakcie lotu.
      const calcTimer = setTimeout(() => {
        if (btnRef.current && toastRef.current) {
          const targetRect = btnRef.current.getBoundingClientRect();
          const toastRect = toastRef.current.getBoundingClientRect();

          // Idealny wektor środek -> środek
          const dx = (targetRect.left + targetRect.width / 2) - (toastRect.left + toastRect.width / 2);
          const dy = (targetRect.top + targetRect.height / 2) - (toastRect.top + toastRect.height / 2);

          // Skurczenie do zera w centrum przycisku (Magia idealnego trafienia!)
          setTargetTransform(`translate(${dx}px, ${dy}px) scale(0)`);
        }
      }, 800);
      
      return () => clearTimeout(calcTimer);
    }
  }, [toastState, toastData]);

  // Zamknięcie popupu logów i zresetowanie ikony
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
    if (!isOpen) {
      setUnreadCount(0); 
      setIconColor('#aaa');
    }
  };

  const clearLogs = () => {
    setLogs([]);
    setUnreadCount(0);
    setIconColor('#aaa');
  };

  const getLogStyle = (type: LogType) => {
    switch (type) {
      case 'error': return { borderLeft: '4px solid #f44336', bg: '#f4433611', icon: '❌', color: '#f44336' };
      case 'warning': return { borderLeft: '4px solid #ff9800', bg: '#ff980011', icon: '⚠️', color: '#ff9800' };
      case 'success': return { borderLeft: '4px solid #4caf50', bg: '#4caf5011', icon: '✅', color: '#4caf50' };
      default: return { borderLeft: '4px solid #00bcd4', bg: '#00bcd411', icon: 'ℹ️', color: '#00bcd4' };
    }
  };

  // --- STYLE LATAJĄCEGO DYMKA ---
  let currentTransform = '';
  let currentOpacity = 0;
  let currentTransition = '';

  if (toastState === 'entering') {
    currentTransform = 'translate(0px, -30px) scale(0.9)'; 
    currentOpacity = 0; 
    currentTransition = 'none';
  } else if (toastState === 'visible') {
    currentTransform = 'translate(0px, 0px) scale(1)'; 
    currentOpacity = 1; 
    currentTransition = 'all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)'; 
  } else if (toastState === 'flying') {
    currentTransform = targetTransform; 
    currentOpacity = 0; 
    currentTransition = 'transform 0.6s cubic-bezier(0.5, 0, 0.2, 1), opacity 0.5s ease-in 0.1s'; 
  }

  return (
    <div style={{ position: 'relative' }} ref={popupRef}>
      
      {/* LATAJĄCY DYMEK: Wychodzi z wirtualnego środka ekranu na górze */}
      <div style={{ position: 'fixed', top: '80px', left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 999999 }}>
        {toastState !== 'hidden' && (
          <div
            ref={toastRef}
            style={{
              background: toastData.bg, border: `1px solid ${toastData.border}`, color: '#fff',
              padding: '12px 24px', borderRadius: '8px', backdropFilter: 'blur(12px)',
              display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1rem', fontWeight: 600,
              boxShadow: `0 10px 30px rgba(0,0,0,0.5)`, whiteSpace: 'nowrap',
              transform: currentTransform, opacity: currentOpacity, transition: currentTransition,
              transformOrigin: 'center center' // Kurczy się symetrycznie w trakcie lotu
            }}
          >
            {toastData.msg}
          </div>
        )}
      </div>

      {/* --- RESPONSYWNY PRZYCISK DZIENNIKA (MAGNES) --- */}
      <button 
        ref={btnRef}
        onClick={togglePopup}
        style={{
          background: isOpen ? '#222' : (isBumping ? `${iconColor}33` : 'transparent'), 
          border: '1px solid transparent',
          borderRadius: '6px', 
          padding: '6px', 
          cursor: 'pointer', 
          position: 'relative', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          
          // Animacja przycisku w momencie uderzenia
          transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          transform: isBumping ? 'scale(1.25) translateY(-2px)' : 'scale(1) translateY(0)',
          boxShadow: isBumping ? `0 5px 20px ${iconColor}66` : 'none',
          
          width: '34px', height: '34px'
        }}
        title="Dziennik zdarzeń systemu"
        onMouseEnter={e => { if(!isBumping) e.currentTarget.style.background = '#222' }} 
        onMouseLeave={e => { if(!isBumping) e.currentTarget.style.background = isOpen ? '#222' : 'transparent' }}
      >
        {/* Kolor ikony aktualizowany dopiero w momencie uderzenia */}
        <InboxIcon color={iconColor} />

        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: '-4px', right: '-4px', background: '#f44336', 
            color: 'white', fontSize: '0.65rem', fontWeight: 'bold', padding: '2px 5px',
            borderRadius: '10px', border: '2px solid #1a1a1a', zIndex: 10
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* KONTENER LOGÓW (POPUP) */}
      {isOpen && (
        <div style={{
          position: 'absolute', top: '130%', right: '0', width: '350px', maxHeight: '500px',
          background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column', zIndex: 99999
        }}>
          <div style={{ padding: '10px 15px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#222', borderTopLeftRadius: '8px', borderTopRightRadius: '8px' }}>
            <h4 style={{ margin: 0, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <InboxIcon color="#888" /> Dziennik zdarzeń
            </h4>
            <button onClick={clearLogs} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline' }}>Wyczyść</button>
          </div>

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