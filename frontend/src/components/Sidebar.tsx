import React, { useState, useEffect, useMemo } from 'react';
import type { FileNode } from '../types';
import { emitAppLog } from './Notifications';

const API_BASE_URL = 'http://127.0.0.1:8000/api';
const MAX_BREADCRUMB_LEN = 15;

const truncateMiddle = (text: string, maxLength: number) => {
  if (text.length <= maxLength) return text;
  const charsToShow = maxLength - 3;
  const frontChars = Math.ceil(charsToShow / 2);
  const backChars = Math.floor(charsToShow / 2);
  return text.substring(0, frontChars) + '...' + text.substring(text.length - backChars);
};

// ZMODYFIKOWANE STYLE: Ultraciasny, profesjonalny "IDE Look"
const globalStyles = `
  .sidebar-container::-webkit-scrollbar { width: 4px; height: 4px; }
  .sidebar-container::-webkit-scrollbar-track { background: transparent; }
  .sidebar-container::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }
  .sidebar-container::-webkit-scrollbar-thumb:hover { background: #666; }

  .styled-sdr-logo {
    background: linear-gradient(135deg, #646cff 0%, #a8ffca 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    font-size: 1.3rem;
    font-weight: 900;
    letter-spacing: -1px;
    margin: 0;
  }

  .triangle-spinner { transform-origin: center; animation: spinSmooth 8s linear infinite; }
  @keyframes spinSmooth { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  .triangle-path { animation: colorPulse 4s infinite alternate ease-in-out; }
  .triangle-path:nth-child(1) { animation-delay: 0s; }
  .triangle-path:nth-child(2) { animation-delay: -1.33s; }
  .triangle-path:nth-child(3) { animation-delay: -2.66s; }

  @keyframes colorPulse {
    0% { stroke: #646cff; }
    50% { stroke: #a8ffca; }
    100% { stroke: #ff80ab; }
  }

  .slide-enter-forward { animation: fadeInRight 0.15s ease-out forwards; }
  @keyframes fadeInRight { from { opacity: 0; transform: translateX(5px); } to { opacity: 1; transform: translateX(0); } }
  .slide-enter-backward { animation: fadeInLeft 0.15s ease-out forwards; }
  @keyframes fadeInLeft { from { opacity: 0; transform: translateX(-5px); } to { opacity: 1; transform: translateX(0); } }
  .animate-slide-down { animation: slideDown 0.1s ease-out forwards; }
  @keyframes slideDown { from { opacity: 0; transform: translateY(-2px) scale(0.99); } to { opacity: 1; transform: translateY(0) scale(1); } }

  /* KOMPAKTOWE ELEMENTY DRZEWA */
  .drill-down-item {
    padding: 3px 6px; /* Zredukowane paddingi */
    border-radius: 2px; /* Ostrzejsze, mniejsze zaokrąglenia */
    cursor: pointer;
    display: flex; 
    align-items: center; 
    justify-content: space-between;
    transition: all 0.05s ease; 
    margin-bottom: 0px; /* BRAK PRZERW między elementami */
    border-left: 2px solid transparent;
    font-size: 0.8rem; /* Mniejsza czcionka */
    color: #ccc;
  }
  .drill-down-item:hover { background-color: rgba(255, 255, 255, 0.05); color: #fff; }
  
  .drill-down-item.selected {
    background-color: rgba(100, 108, 255, 0.15);
    border-left: 2px solid #646cff;
    color: #fff;
  }
  .drill-down-item.highlighted {
    background-color: rgba(76, 175, 80, 0.1);
    border-left: 2px solid #4caf50;
  }

  /* Malutkie etykiety */
  .status-badge {
    font-size: 0.55rem; padding: 1px 4px; border-radius: 2px; font-weight: bold; margin-left: 6px; letter-spacing: 0.5px;
  }
  .status-badge.ok { background: rgba(76, 175, 80, 0.15); color: #4caf50; border: 1px solid rgba(76, 175, 80, 0.3); }
  .status-badge.awaria { background: rgba(244, 67, 54, 0.15); color: #f44336; border: 1px solid rgba(244, 67, 54, 0.3); }

  .add-robot-input {
    flex: 1; padding: 4px 6px; border-radius: 3px; border: 1px solid #333; background-color: #1a1a1a; color: white; font-size: 0.8rem; outline: none;
  }
  .add-robot-input:focus { border-color: #646cff; }
  .add-robot-btn {
    padding: 4px 8px; background-color: transparent; color: #646cff; border: 1px solid #646cff; border-radius: 3px; cursor: pointer; font-weight: bold; font-size: 0.8rem; transition: background-color 0.1s;
  }
  .add-robot-btn:hover:not(:disabled) { background-color: #646cff; color: #fff; }
  .add-robot-btn:disabled { border-color: #444; color: #555; cursor: not-allowed; }

  .context-menu-wrapper {
    position: fixed; z-index: 9999; background-color: rgba(30, 30, 30, 0.9); backdrop-filter: blur(8px); border: 1px solid #444; border-radius: 4px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); padding: 4px 0; min-width: 180px; display: flex; flexDirection: column;
  }
  .context-menu-btn {
    background: transparent; border: none; padding: 4px 12px; text-align: left; cursor: pointer; font-size: 0.8rem; transition: background-color 0.1s; display: flex; align-items: center; gap: 6px;
  }
  .context-menu-btn:hover { background-color: rgba(255, 255, 255, 0.1); color: #fff; }
  .context-menu-header { font-size: 0.6rem; color: #666; padding: 4px 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: bold; margin-bottom: 2px; }

  .nav-btn {
    background: transparent; border: none; color: #888; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; margin-right: 4px; font-size: 0.8rem;
  }
  .nav-btn:hover:not(:disabled) { color: #fff; }
  .nav-btn:disabled { opacity: 0.3; cursor: not-allowed; }
`;

const NodeItem = ({ 
  node, highlightedPath, activeModule, selectedFilePath, 
  onFileSelect, onContextMenu, onDrillDown, isRoot 
}: { 
  node: FileNode, highlightedPath: string | null, activeModule: string, 
  selectedFilePath: string | null, onFileSelect: (path: string) => void,
  onContextMenu: (e: React.MouseEvent, path: string) => void,
  onDrillDown: (node: FileNode) => void, isRoot: boolean
}) => {
  const normalizedNodePath = node.path.replace(/\\/g, '/');
  const normalizedHighlighted = highlightedPath ? highlightedPath.replace(/\\/g, '/') : '';
  const normalizedSelected = selectedFilePath ? selectedFilePath.replace(/\\/g, '/') : '';

  const isExactlyHighlighted = highlightedPath !== null && normalizedNodePath === normalizedHighlighted;
  const isPartOfHighlightedPath = highlightedPath !== null && normalizedHighlighted.startsWith(normalizedNodePath);
  const isSelected = selectedFilePath !== null && normalizedNodePath === normalizedSelected;
  
  const isConfigMode = activeModule === 'konfiguracja';
  const isPreviewMode = activeModule === 'podglad_danych';
  const isAnalysisMode = activeModule === 'analiza_przebiegow';
  const isFolder = node.type === 'folder';

  const isSelectedRobot = isFolder && isRoot && (isAnalysisMode || isConfigMode) && selectedFilePath?.startsWith(node.path);
  
  let itemClass = "drill-down-item";
  if (isSelected || isSelectedRobot) itemClass += " selected";
  else if (isExactlyHighlighted || isPartOfHighlightedPath) itemClass += " highlighted";

  const getAutoLabelBadge = (status?: string) => {
    if (!status) return null;
    const isOk = status === 'OK';
    return <span className={`status-badge ${isOk ? 'ok' : 'awaria'}`}>SYS: {status}</span>;
  };

  const getManualIcon = () => {
    if (isFolder) return '📁';
    if (node.status === 'AWARIA') return '🔴';
    if (node.status === 'OK') return '🟢';
    return '📄';
  };

  const handleClick = () => {
    if (isFolder) {
      if (isRoot && (isAnalysisMode || isConfigMode)) onFileSelect(node.path);
      onDrillDown(node);
    } else if (isPreviewMode || isAnalysisMode) {
      onFileSelect(node.path);
    }
  };

  const handleContext = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isFolder || (isFolder && !isRoot)) onContextMenu(e, node.path);
  };

  return (
    <div className={itemClass} onClick={handleClick} onContextMenu={handleContext}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', flex: 1 }}>
        {/* Pomniejszona ikona */}
        <span style={{ fontSize: '0.85rem', opacity: isFolder ? 0.8 : 1 }}>{getManualIcon()}</span>
        <span style={{ 
          color: (isSelected || isExactlyHighlighted || node.status) ? '#fff' : 'inherit', 
          fontWeight: (isSelected || isExactlyHighlighted || isSelectedRobot) ? '600' : 'normal', 
          textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' 
        }}>
          {node.name}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        {getAutoLabelBadge((node as any).auto_status)}
        {isFolder && <span style={{ color: '#555', marginLeft: '4px', fontSize: '0.65rem' }}>▶</span>}
      </div>
    </div>
  );
};

export const Sidebar = ({ 
  treeData, highlightedPath, fetchTree, activeModule, selectedFilePath, onFileSelect, width 
}: { 
  treeData: FileNode[], highlightedPath: string | null, fetchTree: () => void, 
  activeModule: string, selectedFilePath: string | null, onFileSelect: (path: string) => void, width: number
}) => {
  const [newRobotName, setNewRobotName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, path: string } | null>(null);
  
  const [breadcrumbPaths, setBreadcrumbPaths] = useState<string[]>([]);
  const [navDirection, setNavDirection] = useState<'forward' | 'backward'>('forward');
  
  const [heartbeatTick, setHeartbeatTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setHeartbeatTick(prev => prev + 1), 600);
    const handleRefresh = () => fetchTree();
    const handleClickOut = () => setContextMenu(null);
    window.addEventListener('refreshFileTree', handleRefresh);
    document.addEventListener('click', handleClickOut);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('refreshFileTree', handleRefresh);
      document.removeEventListener('click', handleClickOut);
    };
  }, [fetchTree]);

  const { currentNodes, breadcrumbs } = useMemo(() => {
    let nodes = treeData;
    const crumbs: { name: string, path: string }[] = [];

    for (const path of breadcrumbPaths) {
      const found = nodes.find(n => n.path === path);
      if (found) {
        crumbs.push({ name: found.name, path: found.path });
        nodes = found.children || [];
      } else {
        break;
      }
    }
    return { currentNodes: nodes, breadcrumbs: crumbs };
  }, [treeData, breadcrumbPaths]);

  const handleDrillDown = (node: FileNode) => {
    setNavDirection('forward');
    setBreadcrumbPaths(prev => [...prev, node.path]);
  };

  const navigateToCrumb = (index: number) => {
    setNavDirection('backward');
    if (index < 0) setBreadcrumbPaths([]);
    else setBreadcrumbPaths(breadcrumbPaths.slice(0, index + 1));
  };

  const handleAddRobot = async () => {
    if (!newRobotName.trim()) return;
    setIsAdding(true);
    try {
      const response = await fetch(`${API_BASE_URL}/robots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newRobotName })
      });
      if (response.ok) {
        setNewRobotName('');
        emitAppLog('success', `Dodano nowe urządzenie do floty: ${newRobotName}`);
        fetchTree();
      } else {
        emitAppLog('error', `Błąd podczas dodawania urządzenia.`);
      }
    } catch (err) {
      emitAppLog('error', `Błąd komunikacji z serwerem: Nie można dodać urządzenia.`);
    } finally {
      setIsAdding(false);
    }
  };

  const actionSetStatus = async (path: string, status: string) => {
    try {
      await fetch(`${API_BASE_URL}/file/set-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, status })
      });
      emitAppLog('success', `Zmieniono manualny status pliku na: ${status}`);
      fetchTree(); 
    } catch (err) {
      emitAppLog('error', `Błąd podczas zmiany statusu pliku.`);
    }
  };

  const actionDelete = async (path: string) => {
    if (!confirm("Czy na pewno chcesz usunąć ten plik?")) return;
    try {
      await fetch(`${API_BASE_URL}/file/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      if (selectedFilePath === path) onFileSelect(null as any);
      emitAppLog('warning', `Trwale usunięto plik: ${path.split('/').pop()}`);
      fetchTree();
    } catch (err) {
      emitAppLog('error', `Błąd podczas usuwania pliku.`);
    }
  };

  const actionSetReference = async (path: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/file/set-reference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      if (!res.ok) {
        const error = await res.json();
        emitAppLog('error', error.detail || "Nie można ustawić pliku referencyjnego.");
      } else {
        if (selectedFilePath === path) onFileSelect(null as any);
        emitAppLog('success', `Zdefiniowano nowy przebieg referencyjny.`);
        fetchTree(); 
      }
    } catch (err) {
      emitAppLog('error', `Błąd komunikacji: Nie ustawiono pliku referencyjnego.`);
    }
  };

  const isRootLevel = breadcrumbPaths.length === 0;
  const listKey = breadcrumbPaths.join('/') || 'root';

  return (
    <div className="sidebar-container" style={{ width: `${width}px`, backgroundColor: '#181818', padding: '12px 6px 0 6px', overflow: 'hidden', display: 'flex', flexDirection: 'column', flexShrink: 0, borderRight: '1px solid #2a2a2a' }}>
      <style>{globalStyles}</style>

      {/* Kontener dla części statycznej (Nagłówek, input, breadcrumbs) */}
      <div style={{ flexShrink: 0 }}>

      {/* --- NAGŁÓWEK --- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', padding: '0 4px' }}>
        <h1 className="styled-sdr-logo">SDR</h1>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="triangle-spinner">
          <path className="triangle-path" d="M12 3 L21 18" />
          <path className="triangle-path" d="M21 18 L3 18" />
          <path className="triangle-path" d="M3 18 L12 3" />
        </svg>
      </div>
    </div>
      
      {/* --- KOMPAKTOWE DODAWANIE ROBOTA --- */}
      <div style={{ 
        display: 'flex', gap: '4px', marginBottom: '12px', padding: '0 2px',
        opacity: isRootLevel ? 1 : 0.3, pointerEvents: isRootLevel ? 'auto' : 'none', transition: 'opacity 0.3s'
      }}>
        <input 
          type="text" className="add-robot-input" value={newRobotName} onChange={(e) => setNewRobotName(e.target.value)} 
          placeholder="Nazwa nowego..." disabled={!isRootLevel} onKeyDown={(e) => e.key === 'Enter' && handleAddRobot()} 
        />
        <button className="add-robot-btn" onClick={handleAddRobot} disabled={!isRootLevel || isAdding || !newRobotName.trim()} title="Dodaj do Floty">
          {isAdding ? '...' : '+ Dodaj'}
        </button>
      </div>

      {/* --- NAWIGACJA (BREADCRUMBS) --- */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', padding: '0 4px', fontSize: '0.75rem', color: '#888', whiteSpace: 'nowrap', overflowX: 'auto' }}>
        <button className="nav-btn" onClick={() => navigateToCrumb(-1)} disabled={isRootLevel} title="Strona główna">🏠</button>
        {!isRootLevel && <span style={{ margin: '0 3px', color: '#444' }}>/</span>}
        
        {breadcrumbs.map((crumb, idx) => {
          const isLast = idx === breadcrumbs.length - 1;
          const truncatedName = truncateMiddle(crumb.name, MAX_BREADCRUMB_LEN);
          
          return (
            <React.Fragment key={idx}>
              <span 
                onClick={() => navigateToCrumb(idx)} 
                style={{ cursor: 'pointer', color: isLast ? '#ccc' : '#646cff', fontWeight: isLast ? 'bold' : 'normal' }}
              >
                {truncatedName}
              </span>
              {!isLast && <span style={{ margin: '0 3px', color: '#444' }}>/</span>}
            </React.Fragment>
          );
        })}
      </div>

      {/* --- LISTA ELEMENTÓW Z ZEROWYMI MARGINESAMI --- (Tylko to ma się scrollować) */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '12px' }}> 
        <div key={listKey} className={navDirection === 'forward' ? 'slide-enter-forward' : 'slide-enter-backward'} style={{ display: 'flex', flexDirection: 'column' }}>
        {currentNodes.length === 0 && <div style={{ color: '#555', fontSize: '0.75rem', fontStyle: 'italic', padding: '10px 6px' }}>Folder pusty.</div>}
        {currentNodes.map((node, idx) => (
          <NodeItem 
            key={idx} node={node} highlightedPath={highlightedPath} activeModule={activeModule} 
            selectedFilePath={selectedFilePath} onFileSelect={onFileSelect} 
            onContextMenu={(e, path) => setContextMenu({ x: e.clientX, y: e.clientY, path })} 
            onDrillDown={handleDrillDown} isRoot={isRootLevel} 
          />
        ))}
      </div>
      </div>

      {/* --- MENU KONTEKSTOWE --- */}
      {contextMenu && (
        <div className="animate-slide-down context-menu-wrapper" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <div className="context-menu-header">Ocena manualna (Label)</div>
          <button className="context-menu-btn" style={{ color: '#4caf50' }} onClick={() => { actionSetStatus(contextMenu.path, 'OK'); setContextMenu(null); }}>
            🟢 Oznacz jako: OK
          </button>
          <button className="context-menu-btn" style={{ color: '#f44336' }} onClick={() => { actionSetStatus(contextMenu.path, 'AWARIA'); setContextMenu(null); }}>
            🔴 Oznacz jako: AWARIA
          </button>
          <div style={{ height: '1px', backgroundColor: '#444', margin: '4px 0' }} />
          <div className="context-menu-header">Akcje systemowe</div>
          <button className="context-menu-btn" style={{ color: '#ffeb3b' }} onClick={() => { actionSetReference(contextMenu.path); setContextMenu(null); }}>
            ⭐ Ustaw jako referencję
          </button>
          <button className="context-menu-btn" style={{ color: '#aaa' }} onClick={() => { actionDelete(contextMenu.path); setContextMenu(null); }}>
            🗑️ Usuń z dysku
          </button>
        </div>
      )}
    </div>
  );
};