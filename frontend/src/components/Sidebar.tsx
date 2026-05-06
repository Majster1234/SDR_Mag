import { useState, useEffect } from 'react';
import type { FileNode } from '../types';

// Zmieniliśmy parametry przekazywane do drzewka, by obsłużyć kliknięcie
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
  const isPreviewMode = activeModule === 'podglad_danych';
  const isAnalysisMode = activeModule === 'analiza_przebiegow';
  const isRobotFolder = node.type === 'folder' && depth === 0;
  useEffect(() => {
    if (node.type === 'folder' && isPartOfHighlightedPath) setIsOpen(true);
  }, [isPartOfHighlightedPath, node.type]);

  const glowStyle = isPartOfHighlightedPath ? { textShadow: '0 0 10px #4caf50', color: '#a8ffca', transition: 'all 0.5s' } : { transition: 'all 0.5s' };

  if (node.type === 'folder') {
    // Specjalne podświetlenie jeśli jesteśmy w module analizy i zaznaczyliśmy tego robota
    const isSelectedRobot = isAnalysisMode && selectedFilePath && selectedFilePath.startsWith(node.path);
    const folderGlow = isSelectedRobot 
      ? { textShadow: '0 0 10px #e91e63', color: '#ff80ab', transition: 'all 0.5s' } 
      : glowStyle;

    return (
      <div style={{ marginLeft: '15px', textAlign: 'left', marginTop: '5px' }}>
        <div 
          onClick={() => {
            setIsOpen(!isOpen);
            // Jeśli tryb analizy i to jest folder robota -> wybieramy go!
            if (isAnalysisMode && isRobotFolder) {
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

  // Plik (tutaj dodajemy onContextMenu!)
  return (
    <div 
      onClick={() => isPreviewMode && onFileSelect(node.path)}
      onContextMenu={(e) => {
        e.preventDefault(); // Blokujemy standardowe menu Windows/Przeglądarki
        onContextMenu(e, node.path);
      }}
      style={{ 
        marginLeft: '35px', textAlign: 'left', fontSize: '0.9em', marginTop: '3px',
        color: isSelected ? '#ffeb3b' : (isExactlyHighlighted ? '#a8ffca' : '#aaa'),
        fontWeight: (isSelected || isExactlyHighlighted) ? 'bold' : 'normal',
        backgroundColor: isSelected ? 'rgba(255, 235, 59, 0.2)' : (isExactlyHighlighted ? 'rgba(76, 175, 80, 0.2)' : 'transparent'),
        padding: '2px 5px', borderRadius: '4px', display: 'inline-block',
        transition: 'all 0.2s ease',
        boxShadow: isSelected ? '0 0 8px rgba(255, 235, 59, 0.5)' : (isExactlyHighlighted ? '0 0 12px rgba(76, 175, 80, 0.6)' : 'none'),
        cursor: isPreviewMode ? 'pointer' : 'context-menu'
      }}
    >
      📄 {node.name} {isExactlyHighlighted && '✨ Nowy!'}
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
  
  // STAN MENU KONTEKSTOWEGO
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, path: string } | null>(null);

  // Ukrywa menu po kliknięciu gdziekolwiek w ekran
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

  // Akcje Menu Kontekstowego
  const actionDelete = async (path: string) => {
    if (!confirm("Czy na pewno chcesz usunąć ten plik?")) return;
    try {
      await fetch('http://127.0.0.1:8000/api/file/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      // Jeśli usunęliśmy plik, który był wybrany, "odklikujemy" go
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
        if (selectedFilePath === path) onFileSelect(null as any); // Resetujemy wybór, bo plik zmienił miejsce
        fetchTree(); // Odświeżamy drzewko, by pokazać rotację
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ width: `${width}px`, backgroundColor: '#1e1e1e', padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <h3 style={{ color: '#646cff', borderBottom: '1px solid #444', paddingBottom: '0.5rem', marginTop: 0 }}>🤖 Roboty</h3>
      
      <div style={{ display: 'flex', gap: '5px', marginTop: '10px', marginBottom: '15px' }}>
        <input type="text" value={newRobotName} onChange={(e) => setNewRobotName(e.target.value)} placeholder="Nazwa robota..." style={{ flex: 1, padding: '5px 8px', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#2a2a2a', color: 'white' }} onKeyDown={(e) => e.key === 'Enter' && handleAddRobot()} />
        <button onClick={handleAddRobot} disabled={isAdding || !newRobotName.trim()} style={{ padding: '5px 10px', backgroundColor: newRobotName.trim() ? '#4caf50' : '#555', color: 'white', border: 'none', borderRadius: '4px', cursor: newRobotName.trim() ? 'pointer' : 'not-allowed', fontWeight: 'bold' }}>{isAdding ? '...' : '+'}</button>
      </div>
      
      <div style={{ marginTop: '0.5rem' }}>
        {treeData.map((node, idx) => (
          <TreeNode key={idx} node={node} highlightedPath={highlightedPath} activeModule={activeModule} selectedFilePath={selectedFilePath} onFileSelect={onFileSelect} onContextMenu={handleContextMenu} depth={0} />
        ))}
      </div>

      {/* RENDEROWANIE MENU KONTEKSTOWEGO */}
      {contextMenu && (
        <div style={{
          position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 9999,
          backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '6px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)', padding: '5px 0', minWidth: '200px',
          display: 'flex', flexDirection: 'column'
        }}>
          <button 
            onClick={() => actionSetReference(contextMenu.path)}
            style={{ background: 'transparent', border: 'none', color: '#fff', padding: '10px 15px', textAlign: 'left', cursor: 'pointer', fontSize: '0.9rem' }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#4caf50'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            ⭐ Ustaw jako referencyjny
          </button>
          
          <button 
            onClick={() => actionDelete(contextMenu.path)}
            style={{ background: 'transparent', border: 'none', color: '#f44336', padding: '10px 15px', textAlign: 'left', cursor: 'pointer', fontSize: '0.9rem' }}
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