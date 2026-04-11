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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderTask, setRenderTask] = useState<pdfjsLib.RenderTask | null>(null);

  useEffect(() => {
    let isMounted = true;
    let currentRenderTask: pdfjsLib.RenderTask | null = null;
    let currentPageObj: pdfjsLib.PDFPageProxy | null = null;

    const renderPage = async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        currentPageObj = page;
        if (!isMounted) return;

        const baseViewport = page.getViewport({ scale: 1.0 });
        
        // Calculate scale to fit within hardware limits (e.g., 4000px max dimension for mobile safety)
        const MAX_DIMENSION = 4000;
        let finalScale = scale;
        
        if (baseViewport.height * finalScale > MAX_DIMENSION || baseViewport.width * finalScale > MAX_DIMENSION) {
          const scaleFactor = Math.min(
            MAX_DIMENSION / baseViewport.height,
            MAX_DIMENSION / baseViewport.width
          );
          finalScale = scaleFactor;
        }

        const viewport = page.getViewport({ scale: finalScale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        if (onPageRendered) {
          // Pass the original unscaled dimensions for accurate aspect ratio
          onPageRendered(pageNumber, baseViewport.width, baseViewport.height);
        }

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        currentRenderTask = page.render(renderContext);
        setRenderTask(currentRenderTask);

        await currentRenderTask.promise;
      } catch (err: any) {
        if (err.name === 'RenderingCancelledException') {
          // Expected when unmounting
        } else {
          console.error(`Error rendering page ${pageNumber}:`, err);
        }
      }
    };

    renderPage();

    return () => {
      isMounted = false;
      if (currentRenderTask && typeof currentRenderTask.cancel === 'function') {
        try {
          currentRenderTask.cancel();
        } catch (e) {
          // Ignore cancellation errors
        }
      }
      if (currentPageObj) {
        try {
          currentPageObj.cleanup();
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
  }, [pdf, pageNumber, scale]);

  return (
    <canvas
      ref={canvasRef}
      className={`max-w-full h-auto mx-auto bg-white ${readingMode === 'manga' ? 'w-full object-contain' : 'shadow-md'}`}
      style={{ display: 'block' }}
    />
  );
};
