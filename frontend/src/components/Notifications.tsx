import React from 'react';

// Typy danych dla naszych powiadomień
export interface NotificationItem {
  id: string;
  type: 'info' | 'warning' | 'error' | 'progress';
  message: string;
  timestamp: string;
  progress?: number; // Wartość od 0 do 100 (używana tylko gdy type === 'progress')
}

interface NotificationsProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
}

export const Notifications = ({ isOpen, onClose, notifications }: NotificationsProps) => {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'absolute', 
      top: '70px', 
      right: '2rem', 
      width: '350px',
      backgroundColor: '#2a2a2a', 
      border: '1px solid #444', 
      borderRadius: '8px',
      boxShadow: '0 8px 16px rgba(0,0,0,0.5)', 
      zIndex: 1001,
      display: 'flex', 
      flexDirection: 'column', 
      maxHeight: '500px'
    }}>
      {/* Nagłówek okna powiadomień */}
      <div style={{ padding: '1rem', borderBottom: '1px solid #444', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#fff' }}>🔔 Centrum powiadomień</h3>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '1.2rem', padding: '0 5px' }}>
          ✕
        </button>
      </div>

      {/* Lista powiadomień */}
      <div style={{ padding: '1rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {notifications.length === 0 ? (
          <p style={{ color: '#aaa', textAlign: 'center', margin: 0 }}>Brak nowych powiadomień.</p>
        ) : (
          notifications.map(notif => {
            // Kolor zależny od typu komunikatu
            const borderColor = 
              notif.type === 'error' ? '#f44336' : 
              notif.type === 'warning' ? '#ff9800' : 
              notif.type === 'progress' ? '#2196f3' : '#4caf50';

            return (
              <div key={notif.id} style={{ 
                padding: '12px', borderRadius: '6px', fontSize: '0.9rem',
                borderLeft: `4px solid ${borderColor}`,
                backgroundColor: '#333'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <strong style={{ color: borderColor }}>
                    {notif.type === 'error' ? 'AWARIA' : notif.type === 'warning' ? 'OSTRZEŻENIE' : notif.type === 'progress' ? 'PRZETWARZANIE' : 'INFO'}
                  </strong>
                  <span style={{ fontSize: '0.8rem', color: '#888' }}>{notif.timestamp}</span>
                </div>
                
                <div style={{ color: '#ddd', marginBottom: notif.type === 'progress' ? '10px' : '0', lineHeight: '1.4' }}>
                  {notif.message}
                </div>
                
                {/* Pasek postępu (jeśli wymagany) */}
                {notif.type === 'progress' && notif.progress !== undefined && (
                  <div style={{ width: '100%', height: '6px', backgroundColor: '#222', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${notif.progress}%`, height: '100%', backgroundColor: borderColor, transition: 'width 0.3s ease' }}></div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};