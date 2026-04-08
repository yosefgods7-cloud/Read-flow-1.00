import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useIntersection, useLocalStorage } from 'react-use';
import { usePdf } from '../lib/usePdf';
import { VirtualPdfPage } from './VirtualPdfPage';
import { PdfDocument, updatePdf, getPdf } from '../lib/db';
import { ArrowLeft, Maximize, Minimize, Settings } from 'lucide-react';
import clsx from 'clsx';

interface ReaderViewProps {
  currentPdf: PdfDocument;
  allPdfs: PdfDocument[];
  onBack: () => void;
  onNextPdf: (nextPdfId: string) => void;
}

export const ReaderView: React.FC<ReaderViewProps> = ({ currentPdf, allPdfs, onBack, onNextPdf }) => {
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(currentPdf.lastPage || 1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showUi, setShowUi] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [autoAdvanceDelay, setAutoAdvanceDelay] = useLocalStorage<number>('readflow-auto-advance', 1500);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const endMarkerRef = useRef<HTMLDivElement>(null);

  const [currentBlob, setCurrentBlob] = useState<Blob | undefined>();
  const [nextBlob, setNextBlob] = useState<Blob | undefined>();
  const [prevBlob, setPrevBlob] = useState<Blob | undefined>();

  // Preload next PDF logic
  const currentIndex = allPdfs.findIndex(p => p.id === currentPdf.id);
  const nextPdfDoc = currentIndex < allPdfs.length - 1 ? allPdfs[currentIndex + 1] : null;
  const prevPdfDoc = currentIndex > 0 ? allPdfs[currentIndex - 1] : null;

  // Load current blob
  useEffect(() => {
    let isMounted = true;
    setCurrentBlob(undefined);
    getPdf(currentPdf.id).then(doc => {
      if (isMounted && doc?.blob) setCurrentBlob(doc.blob);
    });
    return () => { isMounted = false; };
  }, [currentPdf.id]);

  // Load prev blob
  useEffect(() => {
    let isMounted = true;
    setPrevBlob(undefined);
    if (prevPdfDoc) {
      getPdf(prevPdfDoc.id).then(doc => {
        if (isMounted && doc?.blob) setPrevBlob(doc.blob);
      });
    }
    return () => { isMounted = false; };
  }, [prevPdfDoc?.id]);

  // Load next blob
  const progress = numPages > 0 ? currentPage / numPages : 0;
  const shouldPreloadNext = progress > 0.7 && nextPdfDoc;

  useEffect(() => {
    setNextBlob(undefined);
  }, [nextPdfDoc?.id]);

  useEffect(() => {
    let isMounted = true;
    if (shouldPreloadNext && nextPdfDoc && !nextBlob) {
      getPdf(nextPdfDoc.id).then(doc => {
        if (isMounted && doc?.blob) setNextBlob(doc.blob);
      });
    }
    return () => { isMounted = false; };
  }, [shouldPreloadNext, nextPdfDoc?.id, nextBlob]);

  const { pdf, error, loadProgress } = usePdf(currentBlob);
  const { pdf: nextPdf } = usePdf(nextBlob);
  const { pdf: prevPdf } = usePdf(prevBlob);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(err => console.error(err));
    } else {
      await document.exitFullscreen().catch(err => console.error(err));
    }
  };

  const endIntersection = useIntersection(endMarkerRef, {
    root: null,
    rootMargin: '0px',
    threshold: 1.0,
  });

  useEffect(() => {
    if (pdf) {
      setNumPages(pdf.numPages);
      // Scroll to last page on load
      if (currentPdf.lastPage > 1 && scrollContainerRef.current) {
        // We can't perfectly scroll to a virtual page that hasn't rendered, 
        // but we can estimate or just let the user scroll.
        // For a robust implementation, we'd need a virtual list with known heights.
        // For now, we'll just start at the top and let the user resume.
      }
    }
  }, [pdf, currentPdf.lastPage]);

  // Save progress
  useEffect(() => {
    if (numPages > 0) {
      const currentProgress = (currentPage / numPages) * 100;
      const status = currentProgress >= 99 ? 'completed' : 'reading';
      updatePdf(currentPdf.id, { 
        lastPage: currentPage, 
        progress: currentProgress,
        status: status === 'completed' ? 'completed' : currentPdf.status === 'to-read' ? 'reading' : currentPdf.status
      });
    }
  }, [currentPage, numPages, currentPdf.id, currentPdf.status]);

  // Auto open next
  useEffect(() => {
    if (endIntersection?.isIntersecting && nextPdfDoc && autoAdvanceDelay && autoAdvanceDelay > 0) {
      const timer = setTimeout(() => {
        onNextPdf(nextPdfDoc.id);
      }, autoAdvanceDelay);
      return () => clearTimeout(timer);
    }
  }, [endIntersection?.isIntersecting, nextPdfDoc, onNextPdf, autoAdvanceDelay]);

  const handleVisible = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  const handleTap = (e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const width = window.innerWidth;
    
    if (!scrollContainerRef.current) return;

    const scrollAmount = window.innerHeight * 0.8;

    if (clientX > width * 0.6) {
      // Tap right -> scroll up
      scrollContainerRef.current.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
    } else if (clientX < width * 0.4) {
      // Tap left -> scroll down
      scrollContainerRef.current.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    } else {
      // Center tap -> toggle UI
      setShowUi(prev => !prev);
    }
  };

  if (error) {
    return <div className="p-4 text-red-500">Error loading PDF: {error.message}</div>;
  }

  return (
    <div className="fixed inset-0 bg-zinc-950 flex flex-col z-50">
      {/* Top Bar */}
      <div className={clsx(
        "absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent z-10 flex items-center text-white transition-opacity duration-300",
        showUi ? "opacity-100" : "opacity-0 pointer-events-none"
      )}>
        <button onClick={onBack} className="p-2 rounded-full bg-black/50 hover:bg-black/80">
          <ArrowLeft size={24} />
        </button>
        <div className="ml-4 truncate flex-1 font-medium">{currentPdf.name}</div>
        <div className="text-sm font-mono mr-4">{currentPage} / {numPages || '?'}</div>
        <button onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings); }} className="p-2 rounded-full bg-black/50 hover:bg-black/80 mr-2">
          <Settings size={24} />
        </button>
        <button onClick={toggleFullscreen} className="p-2 rounded-full bg-black/50 hover:bg-black/80">
          {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="absolute top-20 right-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-2xl z-50 text-sm" onClick={e => e.stopPropagation()}>
          <h3 className="font-medium text-zinc-100 mb-3">Reader Settings</h3>
          <div className="flex flex-col gap-2">
            <label className="text-zinc-400 mb-1">Auto-advance to next PDF</label>
            <div className="flex gap-2">
              <button 
                onClick={() => setAutoAdvanceDelay(0)}
                className={clsx("px-3 py-1.5 rounded-full transition-colors", autoAdvanceDelay === 0 ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700")}
              >Off</button>
              <button 
                onClick={() => setAutoAdvanceDelay(1500)}
                className={clsx("px-3 py-1.5 rounded-full transition-colors", autoAdvanceDelay === 1500 ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700")}
              >1.5s</button>
              <button 
                onClick={() => setAutoAdvanceDelay(5000)}
                className={clsx("px-3 py-1.5 rounded-full transition-colors", autoAdvanceDelay === 5000 ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700")}
              >5s</button>
            </div>
          </div>
        </div>
      )}

      {/* Scroll Container */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        onClick={handleTap}
      >
        {!pdf ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
              <div className="text-center">
                <p className="text-zinc-200 font-medium mb-1">Loading {currentPdf.name}</p>
                <p className="text-zinc-400 text-sm">
                  {loadProgress > 0 && loadProgress < 100 
                    ? `Reading file... ${loadProgress}%` 
                    : `Preparing page ${currentPdf.lastPage || 1}...`}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-8 max-w-4xl mx-auto flex flex-col items-center">
            {Array.from({ length: numPages }, (_, i) => (
              <VirtualPdfPage
                key={i + 1}
                pdf={pdf}
                pageNumber={i + 1}
                defaultHeight={window.innerHeight}
                onVisible={handleVisible}
              />
            ))}
            
            {/* End of PDF marker */}
            {currentPage === numPages && nextPdfDoc && (
              <div ref={endMarkerRef} className="py-12 text-center">
                <p className="text-zinc-400 mb-4">End of {currentPdf.name}</p>
                <button 
                  onClick={(e) => { e.stopPropagation(); onNextPdf(nextPdfDoc.id); }}
                  className={clsx("bg-zinc-100 text-zinc-900 px-6 py-3 rounded-full font-medium", autoAdvanceDelay && autoAdvanceDelay > 0 && "animate-pulse")}
                >
                  {autoAdvanceDelay && autoAdvanceDelay > 0 
                    ? `Auto-opening next in ${autoAdvanceDelay / 1000}s: ${nextPdfDoc.name}...`
                    : `Read Next: ${nextPdfDoc.name}`
                  }
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
