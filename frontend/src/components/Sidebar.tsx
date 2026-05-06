import { useState, useEffect } from 'react';
import type { FileNode } from '../types';

const TreeNode = ({ 
  node, highlightedPath, activeModule, selectedFilePath, onFileSelect 
}: { 
  node: FileNode, highlightedPath: string | null, activeModule: string, selectedFilePath: string | null, onFileSelect: (path: string) => void 
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const normalizedNodePath = node.path.replace(/\\/g, '/');
  const normalizedHighlighted = highlightedPath ? highlightedPath.replace(/\\/g, '/') : '';
  const normalizedSelected = selectedFilePath ? selectedFilePath.replace(/\\/g, '/') : '';

  const isExactlyHighlighted = highlightedPath !== null && normalizedNodePath === normalizedHighlighted;
  const isPartOfHighlightedPath = highlightedPath !== null && normalizedHighlighted.startsWith(normalizedNodePath);
  
  // Czy ten plik jest aktualnie kliknięty?
  const isSelected = selectedFilePath !== null && normalizedNodePath === normalizedSelected;
  const isPreviewMode = activeModule === 'podglad_danych';

  useEffect(() => {
    if (node.type === 'folder' && isPartOfHighlightedPath) {
      setIsOpen(true);
    }
  }, [isPartOfHighlightedPath, node.type]);

  const glowStyle = isPartOfHighlightedPath 
    ? { textShadow: '0 0 10px #4caf50', color: '#a8ffca', transition: 'all 0.5s' } 
    : { transition: 'all 0.5s' };

  if (node.type === 'folder') {
    return (
      <div style={{ marginLeft: '15px', textAlign: 'left', marginTop: '5px' }}>
        <div 
          onClick={() => setIsOpen(!isOpen)} 
          style={{ cursor: 'pointer', fontWeight: isPartOfHighlightedPath ? 'bold' : 'normal', display: 'flex', alignItems: 'center', gap: '8px', ...glowStyle }}
        >
          {isOpen ? '📂' : '📁'} {node.name}
        </div>
        {isOpen && node.children?.map((child, idx) => (
          <TreeNode key={idx} node={child} highlightedPath={highlightedPath} activeModule={activeModule} selectedFilePath={selectedFilePath} onFileSelect={onFileSelect} />
        ))}
      </div>
    );
  }

  return (
    <div 
      // Jeśli jesteśmy w trybie podglądu, zgłaszamy kliknięcie pliku wyżej
      onClick={() => isPreviewMode && onFileSelect(node.path)}
      style={{ 
        marginLeft: '35px', textAlign: 'left', fontSize: '0.9em', marginTop: '3px',
        // Żółty dla wybranego, zielony dla nowego, szary dla reszty
        color: isSelected ? '#ffeb3b' : (isExactlyHighlighted ? '#a8ffca' : '#aaa'),
        fontWeight: (isSelected || isExactlyHighlighted) ? 'bold' : 'normal',
        backgroundColor: isSelected ? 'rgba(255, 235, 59, 0.2)' : (isExactlyHighlighted ? 'rgba(76, 175, 80, 0.2)' : 'transparent'),
        padding: '2px 5px', borderRadius: '4px', display: 'inline-block',
        transition: 'all 0.2s ease',
        boxShadow: isSelected ? '0 0 8px rgba(255, 235, 59, 0.5)' : (isExactlyHighlighted ? '0 0 12px rgba(76, 175, 80, 0.6)' : 'none'),
        cursor: isPreviewMode ? 'pointer' : 'default' // Łapka tylko w trybie podglądu
      }}
    >
      📄 {node.name} {isExactlyHighlighted && '✨ Nowy!'}
    </div>
  );
};

export const Sidebar = ({ 
  treeData, highlightedPath, fetchTree, activeModule, selectedFilePath, onFileSelect 
}: { 
  treeData: FileNode[], highlightedPath: string | null, fetchTree: () => void, activeModule: string, selectedFilePath: string | null, onFileSelect: (path: string) => void
}) => {
  const [newRobotName, setNewRobotName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

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
      } else {
        const errorData = await response.json();
        alert(errorData.detail || "Wystąpił błąd");
      }
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div style={{ width: '300px', backgroundColor: '#1e1e1e', borderRight: '1px solid #444', padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <h3 style={{ color: '#646cff', borderBottom: '1px solid #444', paddingBottom: '0.5rem', marginTop: 0 }}>🤖 Roboty</h3>
      <div style={{ display: 'flex', gap: '5px', marginTop: '10px', marginBottom: '15px' }}>
        <input type="text" value={newRobotName} onChange={(e) => setNewRobotName(e.target.value)} placeholder="Nazwa robota..." style={{ flex: 1, padding: '5px 8px', borderRadius: '4px', border: '1px solid #555', backgroundColor: '#2a2a2a', color: 'white' }} onKeyDown={(e) => e.key === 'Enter' && handleAddRobot()} />
        <button onClick={handleAddRobot} disabled={isAdding || !newRobotName.trim()} style={{ padding: '5px 10px', backgroundColor: newRobotName.trim() ? '#4caf50' : '#555', color: 'white', border: 'none', borderRadius: '4px', cursor: newRobotName.trim() ? 'pointer' : 'not-allowed', fontWeight: 'bold' }}>{isAdding ? '...' : '+'}</button>
      </div>
      <div style={{ marginTop: '0.5rem' }}>
        {treeData.map((node, idx) => (
          <TreeNode key={idx} node={node} highlightedPath={highlightedPath} activeModule={activeModule} selectedFilePath={selectedFilePath} onFileSelect={onFileSelect} />
        ))}
      </div>
    </div>
  );
};