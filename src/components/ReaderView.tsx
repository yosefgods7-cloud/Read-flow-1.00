import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useIntersection, useLocalStorage } from 'react-use';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { VolumeButtons } from '@capacitor-community/volume-buttons';
import { Capacitor } from '@capacitor/core';
import { usePdf } from '../lib/usePdf';
import { VirtualPdfPage } from './VirtualPdfPage';
import { PdfDocument, updatePdf, getPdf } from '../lib/db';
import { ArrowLeft, Maximize, Minimize, Settings, Bookmark, BookmarkCheck, List, Volume2, Pause, Play, Square } from 'lucide-react';
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
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [bookmarks, setBookmarks] = useState<number[]>(currentPdf.bookmarks || []);
  const [autoAdvanceDelay, setAutoAdvanceDelay] = useLocalStorage<number>('readflow-auto-advance', 1500);
  const [autoScrollSpeed, setAutoScrollSpeed] = useLocalStorage<number>('readflow-auto-scroll', 0);
  const [volumeScroll, setVolumeScroll] = useLocalStorage<boolean>('readflow-volume-scroll', false);
  const [speechRate, setSpeechRate] = useLocalStorage<number>('readflow-speech-rate', 1.0);
  const [readingMode, setReadingMode] = useLocalStorage<'standard' | 'manga'>('readflow-reading-mode', 'standard');
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const endMarkerRef = useRef<HTMLDivElement>(null);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const isReadingRef = useRef(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const [currentSource, setCurrentSource] = useState<Blob | string | undefined>();

  const currentIndex = allPdfs.findIndex(p => p.id === currentPdf.id);
  const nextPdfDoc = currentIndex < allPdfs.length - 1 ? allPdfs[currentIndex + 1] : null;

  // Load current source
  useEffect(() => {
    let isMounted = true;
    setCurrentSource(undefined);
    getPdf(currentPdf.id).then(doc => {
      if (isMounted && doc) {
        if (doc.blob) {
          setCurrentSource(doc.blob);
        } else if (doc.url && !doc.url.startsWith('opfs://')) {
          setCurrentSource(doc.url);
        }
      }
    });
    return () => { isMounted = false; };
  }, [currentPdf.id]);

  const { pdf, error, loadProgress } = usePdf(currentSource);

  // TTS Logic
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
      isReadingRef.current = false;
    };
  }, []);

  const extractPageText = async (pageNum: number) => {
    if (!pdf) return '';
    try {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      let text = '';
      let lastY = -1;

      for (const item of textContent.items) {
        if (!('str' in item)) continue;
        
        const currentY = item.transform[5];
        
        // Detect new line based on Y coordinate change
        if (lastY !== -1 && Math.abs(currentY - lastY) > 5) {
          text += '\n';
        } else if (lastY !== -1 && !text.endsWith(' ') && !text.endsWith('\n')) {
          // Add space between items on the same line to prevent words merging
          text += ' ';
        }
        
        text += item.str;
        lastY = currentY;
      }

      // Post-processing for natural TTS reading
      return text
        // 1. Fix hyphenated words broken across lines (e.g., "ex-\ntract" -> "extract")
        .replace(/-\s*\n\s*/g, '')
        // 2. Replace remaining newlines with spaces to avoid awkward pauses
        .replace(/\n/g, ' ')
        // 3. Remove multiple consecutive spaces
        .replace(/\s+/g, ' ')
        // 4. Clean up invisible control characters
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
        .trim();
    } catch (e) {
      console.error(e);
      return '';
    }
  };

  const stopSpeaking = () => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    setIsPaused(false);
    isReadingRef.current = false;
  };

  const startSpeaking = async (startPage = currentPage) => {
    if (!pdf) return;
    isReadingRef.current = true;
    setIsSpeaking(true);
    setIsPaused(false);
    
    const readNext = async (pageNum: number) => {
      if (!isReadingRef.current || pageNum > numPages) {
        stopSpeaking();
        return;
      }
      
      scrollToPage(pageNum);
      
      const text = await extractPageText(pageNum);
      if (!text.trim()) {
        readNext(pageNum + 1);
        return;
      }
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = speechRate || 1.0;
      utteranceRef.current = utterance;
      
      utterance.onend = () => {
        if (isReadingRef.current) {
          readNext(pageNum + 1);
        }
      };
      
      utterance.onerror = (e) => {
        console.error("Speech synthesis error", e);
        stopSpeaking();
      };
      
      window.speechSynthesis?.speak(utterance);
    };
    
    window.speechSynthesis?.cancel();
    readNext(startPage);
  };

  const togglePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSpeaking) {
      if (isPaused) {
        window.speechSynthesis?.resume();
        setIsPaused(false);
      } else {
        window.speechSynthesis?.pause();
        setIsPaused(true);
      }
    } else {
      startSpeaking(currentPage);
    }
  };

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

  const [isEndVisible, setIsEndVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsEndVisible(entry.isIntersecting);
      },
      { root: null, rootMargin: '0px', threshold: 0.1 }
    );

    if (endMarkerRef.current) {
      observer.observe(endMarkerRef.current);
    }

    return () => observer.disconnect();
  }, [endMarkerRef.current]);

  useEffect(() => {
    if (pdf) {
      setNumPages(pdf.numPages);
      // Scroll to last page on load
      if (currentPdf.lastPage > 1) {
        setTimeout(() => {
          if (virtuosoRef.current) {
            virtuosoRef.current.scrollToIndex({
              index: currentPdf.lastPage - 1,
              align: 'start'
            });
          }
        }, 100);
      }
    }
  }, [pdf, currentPdf.lastPage]);

  // Save progress
  useEffect(() => {
    if (numPages > 0) {
      const currentProgress = (currentPage / numPages) * 100;
      const status = currentProgress >= 85 ? 'completed' : 'reading';
      updatePdf(currentPdf.id, { 
        lastPage: currentPage, 
        progress: currentProgress,
        status: status === 'completed' ? 'completed' : currentPdf.status === 'to-read' ? 'reading' : currentPdf.status,
        bookmarks
      });
    }
  }, [currentPage, numPages, currentPdf.id, currentPdf.status, bookmarks]);

  const toggleBookmark = (e: React.MouseEvent) => {
    e.stopPropagation();
    setBookmarks(prev => {
      const newBookmarks = prev.includes(currentPage) 
        ? prev.filter(p => p !== currentPage)
        : [...prev, currentPage].sort((a, b) => a - b);
      return newBookmarks;
    });
  };

  const scrollToPage = (page: number) => {
    if (virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({
        index: page - 1,
        align: 'start',
        behavior: 'smooth'
      });
      setShowBookmarks(false);
    }
  };

  // Auto open next
  useEffect(() => {
    if (isEndVisible && nextPdfDoc && autoAdvanceDelay && autoAdvanceDelay > 0) {
      const timer = setTimeout(() => {
        onNextPdf(nextPdfDoc.id);
      }, autoAdvanceDelay);
      return () => clearTimeout(timer);
    }
  }, [isEndVisible, currentPdf.id, allPdfs, onNextPdf, autoAdvanceDelay, nextPdfDoc]);

  // Auto-scroll logic
  useEffect(() => {
    if (!autoScrollSpeed || autoScrollSpeed <= 0) return;
    
    let animationFrameId: number;
    let lastTime = performance.now();

    const scrollStep = (time: number) => {
      const delta = time - lastTime;
      lastTime = time;
      
      if (scrollElement) {
        // autoScrollSpeed 1 = 20px/s, 2 = 40px/s, 3 = 60px/s
        const pixelsToScroll = (autoScrollSpeed * 20 * delta) / 1000;
        scrollElement.scrollBy({ top: pixelsToScroll });
      }
      animationFrameId = requestAnimationFrame(scrollStep);
    };

    animationFrameId = requestAnimationFrame(scrollStep);
    return () => cancelAnimationFrame(animationFrameId);
  }, [autoScrollSpeed, scrollElement]);

  useEffect(() => {
    if (scrollElement) {
      scrollElement.focus();
    }
  }, [scrollElement]);

  // Volume button scroll logic
  const scrollElementRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    scrollElementRef.current = scrollElement;
  }, [scrollElement]);

  useEffect(() => {
    if (!volumeScroll) return;

    let callbackId: any = null;

    const setupNativeVolumeButtons = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          callbackId = await VolumeButtons.watchVolume({ disableSystemVolumeHandler: true }, (result, err) => {
            if (err) {
              console.error('Volume button error:', err);
              return;
            }
            if (scrollElementRef.current && result) {
              const scrollAmount = window.innerHeight * 0.8;
              if (result.direction === 'up') {
                scrollElementRef.current.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
              } else if (result.direction === 'down') {
                scrollElementRef.current.scrollBy({ top: scrollAmount, behavior: 'smooth' });
              }
            }
          });
        } catch (e) {
          console.error('Failed to setup volume buttons:', e);
        }
      }
    };

    setupNativeVolumeButtons();

    const handleKeyDown = (e: KeyboardEvent) => {
      // Catch standard volume keys and common keycodes for volume buttons (fallback for web/some devices)
      if (e.key === 'AudioVolumeUp' || e.key === 'AudioVolumeDown' || e.key === 'VolumeUp' || e.key === 'VolumeDown' || e.keyCode === 24 || e.keyCode === 25) {
        e.preventDefault();
        
        if (!scrollElementRef.current) return;
        
        const scrollAmount = window.innerHeight * 0.8;
        
        if (e.key === 'AudioVolumeUp' || e.key === 'VolumeUp' || e.keyCode === 24) {
          // Volume up scrolls upward
          scrollElementRef.current.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
        } else if (e.key === 'AudioVolumeDown' || e.key === 'VolumeDown' || e.keyCode === 25) {
          // Volume down scrolls downward
          scrollElementRef.current.scrollBy({ top: scrollAmount, behavior: 'smooth' });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (callbackId && Capacitor.isNativePlatform()) {
        VolumeButtons.clearWatch().catch(console.error);
      }
    };
  }, [volumeScroll]);

  const handleVisible = React.useCallback((pageNumber: number) => {
    setCurrentPage(pageNumber);
  }, []);

  const handleTap = (e: React.MouseEvent) => {
    // Ignore clicks on buttons or interactive elements
    if ((e.target as HTMLElement).closest('button, input, a')) return;

    const clientX = e.clientX;
    const width = window.innerWidth;
    
    if (!scrollElement) return;

    const scrollAmount = window.innerHeight * 0.8;

    if (clientX > width * 0.65) {
      // Tap right -> scroll down
      scrollElement.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    } else if (clientX < width * 0.35) {
      // Tap left -> scroll up
      scrollElement.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
    } else {
      // Center tap -> toggle UI
      setShowUi(prev => {
        if (prev) {
          setShowSettings(false);
          setShowBookmarks(false);
        }
        return !prev;
      });
    }
  };

  if (error) {
    return <div className="p-4 text-red-500">Error loading PDF: {error.message}</div>;
  }

  return (
    <div className="fixed inset-0 bg-zinc-950 flex flex-col z-50">
      {/* Top Bar */}
      <div className={clsx(
        "absolute top-0 left-0 right-0 p-2 sm:p-4 bg-gradient-to-b from-black/80 to-transparent z-10 flex items-center text-white transition-opacity duration-300",
        showUi ? "opacity-100" : "opacity-0 pointer-events-none"
      )}>
        <button onClick={onBack} className="p-1.5 sm:p-2 rounded-full bg-black/50 hover:bg-black/80 shrink-0">
          <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>
        <div className="ml-2 sm:ml-4 truncate flex-1 font-medium text-sm sm:text-base">{currentPdf.name}</div>
        <div className="text-xs sm:text-sm font-mono mr-2 sm:mr-4 shrink-0">{currentPage} / {numPages || '?'}</div>
        
        <div className="flex items-center shrink-0">
          <div className="flex items-center bg-black/50 rounded-full p-0.5 sm:p-1 mr-1 sm:mr-2">
            {isSpeaking ? (
              <>
                <button onClick={togglePlayPause} className="p-1.5 sm:p-2 rounded-full hover:bg-black/80 transition-colors" title={isPaused ? "Resume Reading" : "Pause Reading"}>
                  {isPaused ? <Play className="w-4 h-4 sm:w-5 sm:h-5" /> : <Pause className="w-4 h-4 sm:w-5 sm:h-5" />}
                </button>
                <button onClick={(e) => { e.stopPropagation(); stopSpeaking(); }} className="p-1.5 sm:p-2 rounded-full hover:bg-black/80 transition-colors text-red-400" title="Stop Reading">
                  <Square className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </>
            ) : (
              <button onClick={(e) => { e.stopPropagation(); startSpeaking(currentPage); }} className="p-1.5 sm:p-2 rounded-full hover:bg-black/80 transition-colors" title="Read Aloud">
                <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}
          </div>

          <button onClick={toggleBookmark} className={clsx("p-1.5 sm:p-2 rounded-full mr-1 sm:mr-2 transition-colors", bookmarks.includes(currentPage) ? "bg-blue-500/80 hover:bg-blue-500" : "bg-black/50 hover:bg-black/80")}>
            {bookmarks.includes(currentPage) ? <BookmarkCheck className="w-5 h-5 sm:w-6 sm:h-6" /> : <Bookmark className="w-5 h-5 sm:w-6 sm:h-6" />}
          </button>
          
          <button onClick={(e) => { e.stopPropagation(); setShowBookmarks(!showBookmarks); setShowSettings(false); }} className="p-1.5 sm:p-2 rounded-full bg-black/50 hover:bg-black/80 mr-1 sm:mr-2">
            <List className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>

          <button onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings); setShowBookmarks(false); }} className="p-1.5 sm:p-2 rounded-full bg-black/50 hover:bg-black/80 mr-1 sm:mr-2">
            <Settings className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
          <button onClick={toggleFullscreen} className="p-1.5 sm:p-2 rounded-full bg-black/50 hover:bg-black/80 hidden sm:block">
            {isFullscreen ? <Minimize className="w-5 h-5 sm:w-6 sm:h-6" /> : <Maximize className="w-5 h-5 sm:w-6 sm:h-6" />}
          </button>
        </div>
      </div>

      {/* Bookmarks Panel */}
      {showBookmarks && (
        <div className="absolute top-14 sm:top-20 right-2 sm:right-16 w-[calc(100vw-1rem)] sm:w-64 max-h-[60vh] sm:max-h-96 overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-2xl z-50 text-sm" onClick={e => e.stopPropagation()}>
          <h3 className="font-medium text-zinc-100 mb-3 flex items-center gap-2">
            <Bookmark size={16} /> Bookmarks
          </h3>
          {bookmarks.length === 0 ? (
            <p className="text-zinc-500 italic">No bookmarks yet.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {bookmarks.map(page => (
                <button
                  key={page}
                  onClick={() => scrollToPage(page)}
                  className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-zinc-800 text-left transition-colors"
                >
                  <span className="text-zinc-300">Page {page}</span>
                  {currentPage === page && <span className="w-2 h-2 rounded-full bg-blue-500"></span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <div className="absolute top-14 sm:top-20 right-2 sm:right-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-2xl z-50 text-sm w-[calc(100vw-1rem)] sm:w-72 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <h3 className="font-medium text-zinc-100 mb-4">Reader Settings</h3>
          <div className="flex flex-col gap-4">
            
            <div className="flex flex-col gap-2">
              <label className="text-zinc-400">Reading Mode</label>
              <div className="flex gap-2">
                <button 
                  onClick={() => setReadingMode('standard')}
                  className={clsx("flex-1 py-1.5 rounded-full transition-colors", readingMode === 'standard' ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700")}
                >Standard</button>
                <button 
                  onClick={() => setReadingMode('manga')}
                  className={clsx("flex-1 py-1.5 rounded-full transition-colors", readingMode === 'manga' ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700")}
                >Manga / Webtoon</button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-zinc-400 flex justify-between">
                <span>Speech Rate (TTS)</span>
                <span className="text-zinc-500">{speechRate?.toFixed(1)}x</span>
              </label>
              <input 
                type="range" 
                min="0.5" 
                max="2.5" 
                step="0.1" 
                value={speechRate || 1.0}
                onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-zinc-400 flex justify-between">
                <span>Auto-scroll Speed</span>
                <span className="text-zinc-500">{autoScrollSpeed === 0 ? 'Off' : `${autoScrollSpeed}x`}</span>
              </label>
              <input 
                type="range" 
                min="0" 
                max="50" 
                step="1" 
                value={autoScrollSpeed || 0}
                onChange={(e) => setAutoScrollSpeed(parseInt(e.target.value))}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-xs text-zinc-600 mt-1">
                <span>Off</span>
                <span>Standard</span>
                <span>Manga Fast</span>
                <span>Ultra</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-zinc-400">Volume Button Scroll</label>
              <div className="flex gap-2">
                <button 
                  onClick={() => setVolumeScroll(false)}
                  className={clsx("flex-1 py-1.5 rounded-full transition-colors", !volumeScroll ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700")}
                >Off</button>
                <button 
                  onClick={() => setVolumeScroll(true)}
                  className={clsx("flex-1 py-1.5 rounded-full transition-colors", volumeScroll ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700")}
                >On</button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-zinc-400">Auto-advance to next PDF</label>
              <div className="flex gap-2">
                <button 
                  onClick={() => setAutoAdvanceDelay(0)}
                  className={clsx("flex-1 py-1.5 rounded-full transition-colors", autoAdvanceDelay === 0 ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700")}
                >Off</button>
                <button 
                  onClick={() => setAutoAdvanceDelay(1500)}
                  className={clsx("flex-1 py-1.5 rounded-full transition-colors", autoAdvanceDelay === 1500 ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700")}
                >1.5s</button>
                <button 
                  onClick={() => setAutoAdvanceDelay(5000)}
                  className={clsx("flex-1 py-1.5 rounded-full transition-colors", autoAdvanceDelay === 5000 ? "bg-zinc-100 text-zinc-900" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700")}
                >5s</button>
              </div>
            </div>
            
          </div>
        </div>
      )}

      {/* Scroll Container */}
      <div 
        ref={setScrollElement}
        tabIndex={-1}
        className="flex-1 overflow-y-auto overflow-x-hidden outline-none"
        onClick={handleTap}
        onScroll={(e) => {
          const target = e.currentTarget;
          // If we are within 200px of the bottom, consider it the last page
          if (target.scrollHeight - target.scrollTop - target.clientHeight < 200) {
            if (currentPage !== numPages && numPages > 0) {
              setCurrentPage(numPages);
            }
          }
        }}
      >
        {!pdf ? (
          <div className="flex items-center justify-center h-full px-6">
            <div className="flex flex-col items-center w-full max-w-sm">
              <div className="text-center w-full mb-6">
                <h2 className="text-zinc-100 font-medium text-lg mb-2 truncate px-4" title={currentPdf.name}>
                  {currentPdf.name}
                </h2>
                <p className="text-zinc-400 text-sm">
                  {loadProgress > 0 && loadProgress < 100 
                    ? `Reading file... ${loadProgress}%` 
                    : `Preparing page ${currentPdf.lastPage || 1}...`}
                </p>
              </div>
              
              <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-zinc-200 h-full rounded-full transition-all duration-300 ease-out" 
                  style={{ width: `${Math.max(5, loadProgress)}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className={clsx("mx-auto flex flex-col h-full", readingMode === 'manga' ? "w-full" : "py-8 max-w-4xl px-4")}>
            {scrollElement && (
              <Virtuoso
                ref={virtuosoRef}
                useWindowScroll={false}
                customScrollParent={scrollElement}
                totalCount={numPages}
                overscan={window.innerHeight * 5}
                endReached={() => {
                  if (currentPage !== numPages && numPages > 0) {
                    setCurrentPage(numPages);
                  }
                }}
                itemContent={(index) => (
                <VirtualPdfPage
                  key={index + 1}
                  pdf={pdf}
                  pageNumber={index + 1}
                  defaultHeight={window.innerHeight}
                  readingMode={readingMode || 'standard'}
                  onVisible={handleVisible}
                />
              )}
              components={{
                Footer: () => {
                  const isNearEnd = numPages > 0 && (currentPage >= numPages - 1 || (currentPage / numPages) >= 0.85);
                  return isNearEnd && nextPdfDoc ? (
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
                  ) : <div />;
                }
              }}
            />
            )}
          </div>
        )}
      </div>

      {/* Progress Bar (Bottom) */}
      <div className={clsx(
        "absolute bottom-0 left-0 right-0 z-40 transition-transform duration-300 bg-zinc-900/95 backdrop-blur-md border-t border-zinc-800",
        showUi ? "translate-y-0" : "translate-y-full"
      )}>
        <div className="h-1 w-full bg-zinc-800">
          <div 
            className="h-full bg-blue-500 transition-all duration-300 ease-out" 
            style={{ width: `${numPages > 0 ? (currentPage / numPages) * 100 : 0}%` }} 
          />
        </div>
        <div className="px-4 py-2 flex justify-between items-center text-xs text-zinc-400 font-medium">
          <span>{Math.round(numPages > 0 ? (currentPage / numPages) * 100 : 0)}%</span>
          <span>Page {currentPage} of {numPages || '?'}</span>
        </div>
      </div>
    </div>
  );
};
