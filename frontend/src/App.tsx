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

  // --- STANY DO ZMIANY SZEROKOŚCI DRZEWKA ---
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [isResizing, setIsResizing] = useState(false);

  // --- NOWA, KULOODPORNA LOGIKA PRZECIĄGANIA MYSZKĄ ---
  const handleSidebarResizeStart = (e: React.MouseEvent) => {
    e.preventDefault(); // Blokuje irytujące zaznaczanie tekstu na niebiesko
    setIsResizing(true); // Włącza zielony kolor paska
    
    // Zmieniamy kursor w całym oknie przeglądarki, żeby nie mrugał przy szybkim ruchu
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = startWidth + (moveEvent.clientX - startX);
      // Zabezpieczenie: min 200px, max 800px szerokości sidebaru
      setSidebarWidth(Math.max(200, Math.min(newWidth, 800))); 
    };

    const handleMouseUp = () => {
      setIsResizing(false); // Wyłącza zielony kolor
      
      // Sprzątamy "nasłuchiwacze" po puszczeniu klawisza myszy
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      // Przywracamy domyślne zachowanie strony
      document.body.style.userSelect = 'auto';
      document.body.style.cursor = 'default';
    };

    // Przypinamy nasłuchiwanie do CAŁEGO DOKUMENTU, a nie tylko do małego paska
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

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
      display: 'flex', 
      height: '100vh', 
      width: '100%',
      fontFamily: 'sans-serif'
    }}>
      <Sidebar 
        treeData={treeData} 
        highlightedPath={highlightedPath} 
        fetchTree={fetchTree}
        activeModule={activeModule}
        selectedFilePath={selectedFilePath}
        onFileSelect={(path) => setSelectedFilePath(path)}
        width={sidebarWidth}
      />
      
      {/* PASEK DO ZMIANY SZEROKOŚCI (RESIZER) */}
      <div 
        onMouseDown={handleSidebarResizeStart} // Podpinamy nową logikę tutaj!
        style={{
          width: '5px',
          cursor: 'col-resize',
          backgroundColor: isResizing ? '#4caf50' : '#2a2a2a', 
          zIndex: 10,
          transition: 'background-color 0.2s',
          borderLeft: '1px solid #111',
          borderRight: '1px solid #111'
        }}
        onMouseEnter={(e) => { if(!isResizing) e.currentTarget.style.backgroundColor = '#444' }}
        onMouseLeave={(e) => { if(!isResizing) e.currentTarget.style.backgroundColor = '#2a2a2a' }}
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