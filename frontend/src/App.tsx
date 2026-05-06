import { useState, useEffect } from 'react';
import './App.css';
import { Sidebar } from './components/Sidebar';
import { MainPanel } from './components/MainPanel';
import type { FileNode } from './types';

function App() {
  const [treeData, setTreeData] = useState<FileNode[]>([]);
  const [systemNotification, setSystemNotification] = useState<string | null>(null);
  const [highlightedPath, setHighlightedPath] = useState<string | null>(null);

  const [activeModule, setActiveModule] = useState('podglad_danych');
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);

  // --- NOWE STANY DO ZMIANY SZEROKOŚCI DRZEWKA ---
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [isResizing, setIsResizing] = useState(false);

  // Logika przeciągania myszką
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      let newWidth = e.clientX;
      if (newWidth < 200) newWidth = 200; // Minimalna szerokość drzewka
      if (newWidth > 800) newWidth = 800; // Maksymalna szerokość drzewka
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    // Jeśli zaczęliśmy ciągnąć, nasłuchujemy ruchów myszy w całym oknie
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

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

    socket.onopen = () => console.log("✅ Połączono z systemem monitorowania.");

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

    return () => {
      socket.onopen = null;
      socket.onmessage = null;
      if (socket.readyState === WebSocket.OPEN) socket.close();
    };
  }, []);

  return (
    <div style={{ 
      display: 'flex', height: '100vh', width: '100vw', fontFamily: 'sans-serif',
      cursor: isResizing ? 'col-resize' : 'default' // Zmiana kursora globalnie podczas ciągnięcia
    }}>
      <Sidebar 
        treeData={treeData} 
        highlightedPath={highlightedPath} 
        fetchTree={fetchTree}
        activeModule={activeModule}
        selectedFilePath={selectedFilePath}
        onFileSelect={(path) => setSelectedFilePath(path)}
        width={sidebarWidth} // Przekazujemy szerokość do drzewka
      />
      
      {/* PASEK DO ZMIANY SZEROKOŚCI (RESIZER) */}
      <div 
        onMouseDown={() => setIsResizing(true)}
        style={{
          width: '5px',
          cursor: 'col-resize',
          backgroundColor: isResizing ? '#4caf50' : '#444', // Podświetla się na zielono przy kliknięciu
          zIndex: 10,
          transition: 'background-color 0.2s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isResizing ? '#4caf50' : '#666'}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isResizing ? '#4caf50' : '#444'}
      />

      <MainPanel 
        systemNotification={systemNotification} 
        activeModule={activeModule}
        setActiveModule={setActiveModule}
        selectedFilePath={selectedFilePath}
      />
    </div>
  )
}

export default App;