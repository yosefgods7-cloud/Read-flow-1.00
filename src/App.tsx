import React, { useState, useEffect } from 'react';
import { LockScreen } from './components/LockScreen';
import { LibraryView } from './components/LibraryView';
import { ReaderView } from './components/ReaderView';
import { PdfDocument, getAllPdfs } from './lib/db';

export default function App() {
  const [isLocked, setIsLocked] = useState(true);
  const [pdfs, setPdfs] = useState<PdfDocument[]>([]);
  const [currentPdfId, setCurrentPdfId] = useState<string | null>(null);

  const loadPdfs = async () => {
    try {
      const all = await getAllPdfs();
      setPdfs(all);
    } catch (error) {
      console.error('Failed to load PDFs from IndexedDB:', error);
      setPdfs([]);
    }
  };

  useEffect(() => {
    if (!isLocked) {
      loadPdfs();
      
      const handleThumbnailGenerated = () => {
        loadPdfs();
      };
      window.addEventListener('pdf-thumbnail-generated', handleThumbnailGenerated);
      return () => window.removeEventListener('pdf-thumbnail-generated', handleThumbnailGenerated);
    }
  }, [isLocked]);

  if (isLocked) {
    return <LockScreen onUnlock={() => setIsLocked(false)} />;
  }

  const currentPdf = currentPdfId ? pdfs.find(p => p.id === currentPdfId) : null;

  return (
    <div className="h-screen w-full bg-zinc-950 text-zinc-50">
      {currentPdf ? (
        <ReaderView 
          key={currentPdf.id}
          currentPdf={currentPdf} 
          allPdfs={pdfs}
          onBack={() => {
            setCurrentPdfId(null);
            loadPdfs(); // Refresh to update progress
          }}
          onNextPdf={(id) => setCurrentPdfId(id)}
        />
      ) : (
        <LibraryView 
          pdfs={pdfs} 
          onRefresh={loadPdfs} 
          onOpenPdf={setCurrentPdfId} 
        />
      )}
    </div>
  );
}
