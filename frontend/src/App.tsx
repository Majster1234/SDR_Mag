import { useState, useEffect } from 'react';
import './App.css';
import { Sidebar } from './components/Sidebar';
import { MainPanel } from './components/MainPanel';
import type { FileNode } from './types';

function App() {
  const [treeData, setTreeData] = useState<FileNode[]>([]);
  const [systemNotification, setSystemNotification] = useState<string | null>(null);
  const [highlightedPath, setHighlightedPath] = useState<string | null>(null);

  // NOWE STANY: Aktywny moduł i ścieżka klikniętego pliku
  const [activeModule, setActiveModule] = useState('podglad_danych');
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);

  const fetchTree = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/robots');
      setTreeData(await res.json());
    } catch (error) {
      console.error("Błąd pobierania drzewa:", error);
    }
  };

  useEffect(() => {
    fetchTree();
    const socket = new WebSocket("ws://127.0.0.1:8000/ws");

    socket.onmessage = (event) => {
      const newFilePath = event.data;
      setSystemNotification(`⚠️ Wykryto nowy plik: ${newFilePath}`);
      setHighlightedPath(newFilePath);
      fetchTree(); 
      
      setTimeout(() => {
        setSystemNotification(null);
        setHighlightedPath(null);
      }, 5000);
    };

    return () => socket.close();
  }, []);

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', fontFamily: 'sans-serif' }}>
      <Sidebar 
        treeData={treeData} 
        highlightedPath={highlightedPath} 
        fetchTree={fetchTree}
        // Przekazujemy nowe dane do drzewka
        activeModule={activeModule}
        selectedFilePath={selectedFilePath}
        onFileSelect={(path) => setSelectedFilePath(path)}
      />
      <MainPanel 
        systemNotification={systemNotification} 
        // Przekazujemy sterowanie modułami do panelu
        activeModule={activeModule}
        setActiveModule={setActiveModule}
        selectedFilePath={selectedFilePath}
      />
    </div>
  )
}

export default App;