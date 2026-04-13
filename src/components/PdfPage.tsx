import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

interface PdfPageProps {
  pdf: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  scale?: number;
  readingMode?: 'standard' | 'manga';
  onPageRendered?: (pageNumber: number, width: number, height: number) => void;
}

export const PdfPage: React.FC<PdfPageProps> = ({ pdf, pageNumber, scale = 1.5, readingMode = 'standard', onPageRendered }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [slices, setSlices] = useState<{ height: number; width: number }[]>([]);
  const renderTasksRef = useRef<pdfjsLib.RenderTask[]>([]);
  const pageObjRef = useRef<pdfjsLib.PDFPageProxy | null>(null);

  useEffect(() => {
    let isMounted = true;

    const renderPage = async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        pageObjRef.current = page;
        if (!isMounted) return;

        const baseViewport = page.getViewport({ scale: 1.0 });
        
        const MAX_CANVAS_WIDTH = 4096; // iOS max width limit
        const MAX_CANVAS_HEIGHT = 2048; // Keep slices small for memory safety
        
        // Calculate optimal scale for crisp rendering on high-DPI displays
        const pixelRatio = window.devicePixelRatio || 1;
        let targetScale = scale;
        
        if (readingMode === 'manga') {
          // Exact physical pixels needed to fill screen width
          targetScale = (window.innerWidth * pixelRatio) / baseViewport.width;
        } else {
          // Standard mode (usually has margins)
          targetScale = (window.innerWidth * 0.95 * pixelRatio) / baseViewport.width;
        }
        
        // Clamp scale so width doesn't exceed MAX_CANVAS_WIDTH
        let finalScale = targetScale;
        if (baseViewport.width * finalScale > MAX_CANVAS_WIDTH) {
          finalScale = MAX_CANVAS_WIDTH / baseViewport.width;
        }
        
        const fullViewport = page.getViewport({ scale: finalScale });
        
        if (onPageRendered) {
          onPageRendered(pageNumber, baseViewport.width, baseViewport.height);
        }
        
        const totalWidth = Math.ceil(fullViewport.width);
        const totalHeight = Math.ceil(fullViewport.height);
        const numSlices = Math.ceil(totalHeight / MAX_CANVAS_HEIGHT);
        const newSlices = [];
        
        for (let i = 0; i < numSlices; i++) {
          const sliceHeight = Math.min(MAX_CANVAS_HEIGHT, totalHeight - i * MAX_CANVAS_HEIGHT);
          newSlices.push({ width: totalWidth, height: sliceHeight });
        }
        
        setSlices(newSlices);

        // Wait for state to update and canvases to be rendered in DOM
        setTimeout(() => {
          if (!isMounted || !containerRef.current) return;
          
          const canvases = containerRef.current.querySelectorAll('canvas');
          if (canvases.length !== numSlices) return;

          for (let i = 0; i < numSlices; i++) {
            const canvas = canvases[i];
            const context = canvas.getContext('2d');
            if (!context) continue;

            const sliceHeight = newSlices[i].height;
            const sliceWidth = newSlices[i].width;
            canvas.width = sliceWidth;
            canvas.height = sliceHeight;

            // Clone viewport and adjust transform to shift content UP by i * MAX_CANVAS_HEIGHT
            const offsetY = i * MAX_CANVAS_HEIGHT;
            
            const sliceViewport = fullViewport.clone({ dontFlip: false });
            // Manually modify transform if clone doesn't work as expected
            sliceViewport.transform[5] -= offsetY;

            const renderContext = {
              canvasContext: context,
              viewport: sliceViewport,
            };

            const renderTask = page.render(renderContext);
            renderTasksRef.current.push(renderTask);
            
            renderTask.promise.catch(err => {
              if (err.name !== 'RenderingCancelledException') {
                console.error(`Error rendering page ${pageNumber} slice ${i}:`, err);
              }
            });
          }
        }, 0);

      } catch (err: any) {
        console.error(`Error loading page ${pageNumber}:`, err);
      }
    };

    renderPage();

    return () => {
      isMounted = false;
      renderTasksRef.current.forEach(task => {
        if (task && typeof task.cancel === 'function') {
          try { task.cancel(); } catch (e) {}
        }
      });
      renderTasksRef.current = [];
      
      if (pageObjRef.current) {
        try { pageObjRef.current.cleanup(); } catch (e) {}
      }
      
      // Free canvas memory
      if (containerRef.current) {
        const canvases = containerRef.current.querySelectorAll('canvas');
        canvases.forEach(c => {
          c.width = 0;
          c.height = 0;
        });
      }
    };
  }, [pdf, pageNumber, scale]);

  return (
    <div ref={containerRef} className={`flex flex-col items-center ${readingMode === 'manga' ? 'w-full' : 'shadow-md'}`}>
      {slices.map((slice, i) => (
        <canvas
          key={i}
          width={slice.width}
          height={slice.height}
          className={`max-w-full h-auto bg-white ${readingMode === 'manga' ? 'w-full' : ''}`}
          style={{ display: 'block' }}
        />
      ))}
    </div>
  );
};
