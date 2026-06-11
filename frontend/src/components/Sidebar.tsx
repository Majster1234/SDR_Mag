import React, { useState, useEffect, useMemo } from 'react';
import type { FileNode } from '../types';
import { emitAppLog } from './Notifications';

// --- STAŁE I KONFIGURACJA ---
const API_BASE_URL = 'http://127.0.0.1:8000/api';
const MAX_BREADCRUMB_LEN = 15;

const truncateMiddle = (text: string, maxLength: number) => {
  if (text.length <= maxLength) return text;
  const charsToShow = maxLength - 3;
  const frontChars = Math.ceil(charsToShow / 2);
  const backChars = Math.floor(charsToShow / 2);
  return text.substring(0, frontChars) + '...' + text.substring(text.length - backChars);
};

// Wstrzyknięte style CSS
const globalStyles = `
  .logo-container { filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.3)); }
  .styled-sdr-logo {
    background: linear-gradient(135deg, #646cff 0%, #a8ffca 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    font-size: 1.8rem;
    font-weight: 900;
    letter-spacing: -1px;
    margin: 0;
    padding: 4px 0;
    line-height: 1.1;
  }

  .triangle-spinner {
    transform-origin: 12px 13px; 
    animation: spinSmooth 8s linear infinite;
  }
  @keyframes spinSmooth {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .triangle-path {
    animation: colorPulse 4s infinite alternate ease-in-out;
  }
  .triangle-path:nth-child(1) { animation-delay: 0s; }
  .triangle-path:nth-child(2) { animation-delay: -1.33s; }
  .triangle-path:nth-child(3) { animation-delay: -2.66s; }

  @keyframes colorPulse {
    0% { stroke: #646cff; filter: drop-shadow(0 0 2px rgba(100, 108, 255, 0.6)); }
    50% { stroke: #a8ffca; filter: drop-shadow(0 0 2px rgba(168, 255, 202, 0.6)); }
    100% { stroke: #ff80ab; filter: drop-shadow(0 0 2px rgba(255, 128, 171, 0.6)); }
  }

  .slide-enter-forward {
    animation: slideInRight 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
  }
  @keyframes slideInRight {
    from { opacity: 0; transform: translateX(25px); }
    to { opacity: 1; transform: translateX(0); }
  }

  .slide-enter-backward {
    animation: slideInLeft 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
  }
  @keyframes slideInLeft {
    from { opacity: 0; transform: translateX(-25px); }
    to { opacity: 1; transform: translateX(0); }
  }

  .animate-slide-down { animation: slideDown 0.3s ease-out forwards; }
  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-5px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .section-divider { border-bottom: 1px solid #333; margin: 20px 0; }

  .context-menu-btn {
    background: transparent; border: none; padding: 8px 15px;
    text-align: left; cursor: pointer; font-size: 0.9rem; font-weight: bold;
    transition: background-color 0.2s;
  }
  .context-menu-btn.success { color: #4caf50; }
  .context-menu-btn.success:hover { background-color: rgba(76, 175, 80, 0.2); }
  .context-menu-btn.danger { color: #f44336; }
  .context-menu-btn.danger:hover { background-color: rgba(244, 67, 54, 0.2); }
  .context-menu-btn.neutral { color: #fff; }
  .context-menu-btn.neutral:hover { background-color: rgba(255, 255, 255, 0.1); }

  .drill-down-item {
    padding: 8px 12px;
    background-color: #2a2a2a;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border: 1px solid transparent;
    transition: all 0.2s ease;
    margin-bottom: 4px;
  }
  .drill-down-item:hover { background-color: #333; border-color: #555; }
  
  .breadcrumb-container {
    display: flex; align-items: center; gap: 8px; margin-bottom: 15px;
    font-size: 0.85rem; color: #888; background-color: #151515; padding: 8px 10px;
    border-radius: 6px; border: 1px solid #2a2a2a; overflow-x: auto;
    white-space: nowrap; scrollbar-width: none;
  }
  .breadcrumb-container::-webkit-scrollbar { display: none; }
  
  .breadcrumb-link { cursor: pointer; transition: color 0.2s; display: flex; align-items: center; }
  .breadcrumb-link:hover { color: #a8ffca !important; text-decoration: underline; }
  
  .nav-btn {
    background: #2a2a2a; border: 1px solid #444; border-radius: 4px;
    color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;
    width: 26px; height: 26px; transition: all 0.2s; flex-shrink: 0;
  }
  .nav-btn:hover:not(:disabled) { background: #444; border-color: #666; }
  .nav-btn:disabled { opacity: 0.3; cursor: not-allowed; }
`;

// --- KOMPONENT POJEDYNCZEGO WIERSZA ---
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
  const shadowGlow = isSelectedRobot ? '0 0 10px rgba(233, 30, 99, 0.5)' : (isPartOfHighlightedPath ? '0 0 10px rgba(76, 175, 80, 0.5)' : 'none');
  const textGlowColor = isSelectedRobot ? '#ff80ab' : (isPartOfHighlightedPath ? '#a8ffca' : 'inherit');

  const getAutoLabelBadge = (status?: string) => {
    if (!status) return null;
    const isOk = status === 'OK';
    const color = isOk ? '#4caf50' : '#f44336';
    return (
      <span style={{ 
        fontSize: '0.65rem', padding: '2px 6px', borderRadius: '3px', fontWeight: 'bold', marginLeft: '8px', textTransform: 'uppercase',
        backgroundColor: `${color}22`, color: color, border: `1px solid ${color}44`, flexShrink: 0
      }}>
        SYS: {status}
      </span>
    );
  };

  const getFileTextColor = () => {
    if (isSelected) return '#ffeb3b';
    if (node.status === 'OK') return '#4caf50';
    if (node.status === 'AWARIA') return '#f44336';
    if (isExactlyHighlighted) return '#a8ffca';
    return '#e0e0e0';
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
    <div 
      className="drill-down-item" onClick={handleClick} onContextMenu={handleContext}
      style={{
        backgroundColor: isSelected ? 'rgba(255, 235, 59, 0.15)' : (isExactlyHighlighted ? 'rgba(76, 175, 80, 0.15)' : undefined),
        boxShadow: isSelected ? '0 0 8px rgba(255, 235, 59, 0.3)' : shadowGlow,
        cursor: (isFolder || isPreviewMode || isAnalysisMode) ? 'pointer' : 'context-menu'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1 }}>
        <span style={{ fontSize: '1.1rem' }}>
          {isFolder ? '📁' : (node.status === 'AWARIA' ? '⚠️' : (node.status === 'OK' ? '✅' : '📄'))}
        </span>
        <span style={{ 
          color: isFolder ? textGlowColor : getFileTextColor(), 
          fontWeight: (isSelected || isExactlyHighlighted || isPartOfHighlightedPath || isSelectedRobot || node.status) ? 'bold' : 'normal', 
          textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' 
        }}>
          {node.name}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        {getAutoLabelBadge((node as any).auto_status)}
        {isFolder && <span style={{ color: '#666', marginLeft: '10px' }}>➔</span>}
      </div>
    </div>
  );
};

// --- KOMPONENT GŁÓWNY ---
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

  useEffect(() => {
    const handleRefresh = () => fetchTree();
    const handleClickOut = () => setContextMenu(null);
    window.addEventListener('refreshFileTree', handleRefresh);
    document.addEventListener('click', handleClickOut);
    return () => {
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

  const handleAddRobot = async () => { /* API Logika */ };
  const actionSetStatus = async (path: string, status: string) => { /* API Logika */ };
  const actionDelete = async (path: string) => { /* API Logika */ };
  const actionSetReference = async (path: string) => { /* API Logika */ };

  const isRootLevel = breadcrumbPaths.length === 0;
  const listKey = breadcrumbPaths.join('/') || 'root';

  return (
    <div style={{ width: `${width}px`, backgroundColor: '#1e1e1e', padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <style>{globalStyles}</style>

      {/* --- NAGŁÓWEK --- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div className="logo-container"><h1 className="styled-sdr-logo">SDR</h1></div>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="triangle-spinner">
          <path className="triangle-path" d="M12 3 L21 18" />
          <path className="triangle-path" d="M21 18 L3 18" />
          <path className="triangle-path" d="M3 18 L12 3" />
        </svg>
      </div>
      
      {/* --- DODAWANIE URZĄDZENIA (Zawsze widoczne, płynnie wyszarzane poza baza) --- */}
      <div style={{ 
        padding: '10px', 
        backgroundColor: '#252525', 
        borderRadius: '6px', 
        border: '1px solid #333',
        opacity: isRootLevel ? 1 : 0.3, 
        pointerEvents: isRootLevel ? 'auto' : 'none', 
        transition: 'opacity 0.4s ease',
      }}>
        <h4 style={{ color: '#aaa', marginTop: 0, marginBottom: '10px', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Dodaj do Floty
        </h4>
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
          <input 
            type="text" value={newRobotName} onChange={(e) => setNewRobotName(e.target.value)} placeholder="Nazwa urządzenia..." 
            disabled={!isRootLevel}
            style={{ flex: 1, padding: '6px 10px', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#2a2a2a', color: 'white' }} 
            onKeyDown={(e) => e.key === 'Enter' && handleAddRobot()} 
          />
          <button 
            onClick={handleAddRobot} 
            disabled={!isRootLevel || isAdding || !newRobotName.trim()} 
            style={{ padding: '6px 12px', backgroundColor: newRobotName.trim() ? '#4caf50' : '#555', color: 'white', border: 'none', borderRadius: '4px', cursor: newRobotName.trim() ? 'pointer' : 'not-allowed', fontWeight: 'bold' }}
          >
            {isAdding ? '...' : '+'}
          </button>
        </div>
      </div>

      <div className="section-divider"></div>

      {/* --- NAWIGACJA (BREADCRUMBS) --- */}
      <h3 style={{ color: '#646cff', marginTop: 0, marginBottom: '10px', fontSize: '1.2rem' }}>Flota Urządzeń</h3>
      
      <div className="breadcrumb-container">
        <button className="nav-btn" onClick={() => navigateToCrumb(breadcrumbs.length - 2)} disabled={isRootLevel} title="Cofnij o jeden poziom">
          <span style={{ transform: 'rotate(180deg)' }}>➔</span>
        </button>
        <button className="nav-btn" onClick={() => navigateToCrumb(-1)} disabled={isRootLevel} style={{ borderColor: isRootLevel ? '#2a2a2a' : '#444' }} title="Powrót do bazy">
          🏠
        </button>

        {breadcrumbs.map((crumb, idx) => {
          const isLast = idx === breadcrumbs.length - 1;
          const truncatedName = truncateMiddle(crumb.name, MAX_BREADCRUMB_LEN);
          
          return (
            <React.Fragment key={idx}>
              <span style={{ color: '#444', fontWeight: 'bold' }}>/</span>
              <span className="breadcrumb-link" onClick={() => navigateToCrumb(idx)} style={{ color: isLast ? '#fff' : '#646cff', fontWeight: isLast ? 'bold' : 'normal' }} title={crumb.name}>
                {truncatedName}
              </span>
            </React.Fragment>
          );
        })}
      </div>

      {/* --- LISTA ELEMENTÓW W AKTUALNYM FOLDERZE --- */}
      <div 
        key={listKey} 
        className={navDirection === 'forward' ? 'slide-enter-forward' : 'slide-enter-backward'}
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        {currentNodes.length === 0 && <div style={{ color: '#555', fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>Brak elementów w tym folderze</div>}
        {currentNodes.map((node, idx) => (
          <NodeItem 
            key={idx} node={node} highlightedPath={highlightedPath} activeModule={activeModule} 
            selectedFilePath={selectedFilePath} onFileSelect={onFileSelect} 
            onContextMenu={(e, path) => setContextMenu({ x: e.clientX, y: e.clientY, path })} 
            onDrillDown={handleDrillDown} isRoot={isRootLevel} 
          />
        ))}
      </div>

      {/* --- MENU KONTEKSTOWE --- */}
      {contextMenu && (
        <div className="animate-slide-down" style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 9999, backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '6px', boxShadow: '0 8px 16px rgba(0,0,0,0.6)', padding: '5px 0', minWidth: '220px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '0.75rem', color: '#888', padding: '4px 15px', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #444', marginBottom: '4px' }}>Oznacz plik</div>
          <button className="context-menu-btn success" onClick={() => { actionSetStatus(contextMenu.path, 'OK'); setContextMenu(null); }}>✅ Status: OK</button>
          <button className="context-menu-btn danger" onClick={() => { actionSetStatus(contextMenu.path, 'AWARIA'); setContextMenu(null); }}>⚠️ Status: AWARIA</button>
          <div style={{ height: '1px', backgroundColor: '#444', margin: '4px 0' }} />
          <div style={{ fontSize: '0.75rem', color: '#888', padding: '4px 15px', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid #444', marginBottom: '4px' }}>Akcje systemu</div>
          <button className="context-menu-btn neutral" onClick={() => { actionSetReference(contextMenu.path); setContextMenu(null); }}>⭐ Ustaw referencję</button>
          <button className="context-menu-btn danger" onClick={() => { actionDelete(contextMenu.path); setContextMenu(null); }}>🗑️ Usuń plik</button>
        </div>
      )}
    </div>
  );
};