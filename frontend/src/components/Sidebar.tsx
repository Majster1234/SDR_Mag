import { useState, useEffect } from 'react';
import type { FileNode } from '../types';
import { emitAppLog } from './Notifications';
const TreeNode = ({ 
  node, highlightedPath, activeModule, selectedFilePath, onFileSelect, onContextMenu , depth=0
}: { 
  node: FileNode, highlightedPath: string | null, activeModule: string, 
  selectedFilePath: string | null, onFileSelect: (path: string) => void,
  onContextMenu: (e: React.MouseEvent, path: string) => void, depth?: number 
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const normalizedNodePath = node.path.replace(/\\/g, '/');
  const normalizedHighlighted = highlightedPath ? highlightedPath.replace(/\\/g, '/') : '';
  const normalizedSelected = selectedFilePath ? selectedFilePath.replace(/\\/g, '/') : '';

  const isExactlyHighlighted = highlightedPath !== null && normalizedNodePath === normalizedHighlighted;
  const isPartOfHighlightedPath = highlightedPath !== null && normalizedHighlighted.startsWith(normalizedNodePath);
  const isSelected = selectedFilePath !== null && normalizedNodePath === normalizedSelected;
  
  const isConfigMode = activeModule === 'konfiguracja';
  const isPreviewMode = activeModule === 'podglad_danych';
  const isAnalysisMode = activeModule === 'analiza_przebiegow';
  const isRobotFolder = node.type === 'folder' && depth === 0;
  


  useEffect(() => {
    if (node.type === 'folder' && isPartOfHighlightedPath) setIsOpen(true);
  }, [isPartOfHighlightedPath, node.type]);

  const glowStyle = isPartOfHighlightedPath ? { textShadow: '0 0 10px #4caf50', color: '#a8ffca', transition: 'all 0.5s' } : { transition: 'all 0.5s' };

  if (node.type === 'folder') {
    const isSelectedRobot = (isAnalysisMode || isConfigMode) && selectedFilePath && selectedFilePath.startsWith(node.path);
    const folderGlow = isSelectedRobot 
      ? { textShadow: '0 0 10px #e91e63', color: '#ff80ab', transition: 'all 0.5s' } 
      : glowStyle;

    return (
      <div style={{ marginLeft: '15px', textAlign: 'left', marginTop: '5px' }}>
        <div 
          onClick={() => {
            setIsOpen(!isOpen);
            if ((isAnalysisMode || isConfigMode) && isRobotFolder) {
              onFileSelect(node.path);
            }
          }} 
          style={{ cursor: 'pointer', fontWeight: (isPartOfHighlightedPath || isSelectedRobot) ? 'bold' : 'normal', display: 'flex', alignItems: 'center', gap: '8px', ...folderGlow }}
        >
          {isOpen ? '📂' : '📁'} {node.name}
        </div>
        {isOpen && node.children?.map((child, idx) => (
          <TreeNode key={idx} node={child} highlightedPath={highlightedPath} activeModule={activeModule} selectedFilePath={selectedFilePath} onFileSelect={onFileSelect} onContextMenu={onContextMenu} depth={depth + 1} />
        ))}
      </div>
    );
  }

  // Zaktualizowany render pliku z kolorami statusów i ikonami
  const getAutoLabelBadge = (status?: string) => {
    if (!status || status === "") return null;
    
    const badgeStyle: React.CSSProperties = {
      fontSize: '0.65rem',
      padding: '2px 6px',
      borderRadius: '3px',
      fontWeight: 'bold',
      marginLeft: '8px',
      textTransform: 'uppercase'
    };
    
    if (status === 'OK') {
      return <span style={{ ...badgeStyle, backgroundColor: '#4caf5022', color: '#4caf50', border: '1px solid #4caf5044' }}>SYS: OK</span>;
    }
    // Wyświetla konkretną klasę błędu (KOLIZJA, DRGANIA itp.) na czerwono
    return <span style={{ ...badgeStyle, backgroundColor: '#f4433622', color: '#f44336', border: '1px solid #f4433644' }}>SYS: {status}</span>;
  };

  return (
    <div 
      onClick={() => (isPreviewMode || isAnalysisMode) && onFileSelect(node.path)}
      onContextMenu={(e) => {
        e.preventDefault(); 
        onContextMenu(e, node.path);
      }}
      style={{ 
        marginLeft: '35px', textAlign: 'left', fontSize: '0.9em', marginTop: '3px',
        backgroundColor: isSelected ? 'rgba(255, 235, 59, 0.15)' : (isExactlyHighlighted ? 'rgba(76, 175, 80, 0.15)' : 'transparent'),
        padding: '4px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        transition: 'all 0.2s ease',
        boxShadow: isSelected ? '0 0 8px rgba(255, 235, 59, 0.3)' : (isExactlyHighlighted ? '0 0 12px rgba(76, 175, 80, 0.4)' : 'none'),
        cursor: (isPreviewMode || isAnalysisMode) ? 'pointer' : 'context-menu'
      }}
    >
      {/* LEWA STRONA: Status manualny operatora */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
        {node.status === 'OK' && <span title="Manualny: Poprawny">✅</span>}
        {node.status === 'AWARIA' && <span title="Manualny: Awaria">⚠️</span>}
        {!node.status && <span>📄</span>}
        
        <span style={{ 
          color: isSelected ? '#ffeb3b' : (node.status === 'OK' ? '#4caf50' : node.status === 'AWARIA' ? '#f44336' : (isExactlyHighlighted ? '#a8ffca' : '#aaa')),
          fontWeight: (isSelected || isExactlyHighlighted || node.status) ? 'bold' : 'normal',
          textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap'
        }}>
          {node.name}
        </span>
      </div>

      {/* PRAWA STRONA: Werdykt automatyczny z systemu */}
      <div style={{ flexShrink: 0 }}>
        {getAutoLabelBadge((node as any).auto_status)}
      </div>
    </div>
  );
};

export const Sidebar = ({ 
  treeData, highlightedPath, fetchTree, activeModule, selectedFilePath, onFileSelect, width 
}: { 
  treeData: FileNode[], highlightedPath: string | null, fetchTree: () => void, 
  activeModule: string, selectedFilePath: string | null, onFileSelect: (path: string) => void,
  width: number
}) => {
  const [newRobotName, setNewRobotName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  
  const [heartbeatTick, setHeartbeatTick] = useState(0);

  useEffect(() => {
    emitAppLog('info', 'Zainicjowano animowany wskaźnik aktywności (Heartbeat) głównego wątku UI.');
    
    // Uderzenie serca co 500ms - napędza obrót trójkąta
    const interval = setInterval(() => {
      setHeartbeatTick(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, path: string } | null>(null);

  useEffect(() => {
  const handleRefresh = () => fetchTree();
  window.addEventListener('refreshFileTree', handleRefresh);
  return () => window.removeEventListener('refreshFileTree', handleRefresh);
  }, [fetchTree]);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const handleAddRobot = async () => {
    if (!newRobotName.trim()) return;
    setIsAdding(true);
    try {
      const response = await fetch('http://127.0.0.1:8000/api/robots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newRobotName })
      });
      if (response.ok) {
        setNewRobotName('');
        fetchTree();
      }
    } finally {
      setIsAdding(false);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, path: string) => {
    setContextMenu({ x: e.clientX, y: e.clientY, path });
  };

  // NOWA FUNKCJA: Zmiana statusu
  const actionSetStatus = async (path: string, status: string) => {
    try {
      await fetch('http://127.0.0.1:8000/api/file/set-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, status })
      });
      fetchTree(); // Odśwież drzewko, by pokazać nowe kolory
      setContextMenu(null);
    } catch (err) {
      console.error("Błąd aktualizacji statusu", err);
    }
  };

  const actionDelete = async (path: string) => {
    if (!confirm("Czy na pewno chcesz usunąć ten plik?")) return;
    try {
      await fetch('http://127.0.0.1:8000/api/file/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      if (selectedFilePath === path) onFileSelect(null as any);
      fetchTree();
    } catch (err) {
      console.error(err);
    }
  };

  const actionSetReference = async (path: string) => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/file/set-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      if (!res.ok) {
        const error = await res.json();
        alert(error.detail || "Nie można ustawić pliku referencyjnego.");
      } else {
        if (selectedFilePath === path) onFileSelect(null as any);
        fetchTree(); 
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ width: `${width}px`, backgroundColor: '#1e1e1e', padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      
      <h3 style={{ color: '#646cff', borderBottom: '1px solid #444', paddingBottom: '0.5rem', marginTop: 0 }}> Roboty</h3>
 
      <div style={{ display: 'flex', gap: '5px', marginTop: '10px', marginBottom: '15px' }}>
             {/* ANIMOWANY TRÓJKĄT DIAGNOSTYCZNY */}
          <svg 
            width="30" height="30" viewBox="0 0 24 24" fill="none" 
            strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
            style={{ 
              // Mechanizm serca: obrót o 120 stopni co każde tyknięcie JS
              transform: `rotate(${heartbeatTick * 120}deg)`, 
              transition: 'transform 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)' // Lekki efekt sprężystości (bounce)
            }}
          >
            {/* Krawędź 1 */}
            <path d="M12 3 L21 18" stroke={heartbeatTick % 3 === 0 ? '#ffffff' : '#333'} style={{ transition: 'stroke 0.3s' }} />
            {/* Krawędź 2 */}
            <path d="M21 18 L3 18" stroke={heartbeatTick % 3 === 1 ? '#ffffff' : '#333'} style={{ transition: 'stroke 0.3s' }} />
            {/* Krawędź 3 */}
            <path d="M3 18 L12 3" stroke={heartbeatTick % 3 === 2 ? '#ffffff' : '#333'} style={{ transition: 'stroke 0.3s' }} />
            
            {/* Kropka w środku */}
            {/* <circle cx="12" cy="13" r="1.5" fill={heartbeatTick % 2 === 0 ? '#ffffff' : '#444'} style={{ transition: 'fill 0.2s' }} /> */}
          </svg>
        <input type="text" value={newRobotName} onChange={(e) => setNewRobotName(e.target.value)} placeholder="Nazwa robota..." style={{ flex: 1, padding: '5px 8px', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#2a2a2a', color: 'white' }} onKeyDown={(e) => e.key === 'Enter' && handleAddRobot()} />
        <button onClick={handleAddRobot} disabled={isAdding || !newRobotName.trim()} style={{ padding: '5px 10px', backgroundColor: newRobotName.trim() ? '#4caf50' : '#555', color: 'white', border: 'none', borderRadius: '4px', cursor: newRobotName.trim() ? 'pointer' : 'not-allowed', fontWeight: 'bold' }}>{isAdding ? '...' : '+'}</button>
      </div>
      
      <div style={{ marginTop: '0.5rem' }}>
        {treeData.map((node, idx) => (
          <TreeNode key={idx} node={node} highlightedPath={highlightedPath} activeModule={activeModule} selectedFilePath={selectedFilePath} onFileSelect={onFileSelect} onContextMenu={handleContextMenu} depth={0} />
        ))}
      </div>

      {/* ROZBUDOWANE MENU KONTEKSTOWE */}
      {contextMenu && (
        <div style={{
          position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 9999,
          backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '6px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)', padding: '5px 0', minWidth: '220px',
          display: 'flex', flexDirection: 'column'
        }}>
          {/* Opcje zmiany statusu */}
          <div style={{ fontSize: '0.75rem', color: '#888', padding: '4px 15px', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #444', marginBottom: '4px' }}>
            Oznacz plik
          </div>
          <button 
            onClick={() => actionSetStatus(contextMenu.path, 'OK')}
            style={{ background: 'transparent', border: 'none', color: '#4caf50', padding: '8px 15px', textAlign: 'left', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#333'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            ✅ Status: OK
          </button>
          
          <button 
            onClick={() => actionSetStatus(contextMenu.path, 'AWARIA')}
            style={{ background: 'transparent', border: 'none', color: '#f44336', padding: '8px 15px', textAlign: 'left', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#333'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            ⚠️ Status: AWARIA
          </button>

          <div style={{ height: '1px', backgroundColor: '#444', margin: '4px 0' }} />

          {/* Stare opcje operacji na pliku */}
          <div style={{ fontSize: '0.75rem', color: '#888', padding: '4px 15px', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #444', marginBottom: '4px' }}>
            Akcje systemu
          </div>
          <button 
            onClick={() => { actionSetReference(contextMenu.path); setContextMenu(null); }}
            style={{ background: 'transparent', border: 'none', color: '#fff', padding: '8px 15px', textAlign: 'left', cursor: 'pointer', fontSize: '0.9rem' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#4caf50'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            ⭐ Ustaw jako referencyjny
          </button>
          
          <button 
            onClick={() => { actionDelete(contextMenu.path); setContextMenu(null); }}
            style={{ background: 'transparent', border: 'none', color: '#f44336', padding: '8px 15px', textAlign: 'left', cursor: 'pointer', fontSize: '0.9rem' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#5c1611'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            🗑️ Usuń plik
          </button>
        </div>
      )}
    
    </div>
  );
};