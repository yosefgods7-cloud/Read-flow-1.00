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

    const renderPage = async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (!isMounted) return;

        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        if (onPageRendered) {
          onPageRendered(pageNumber, viewport.width, viewport.height);
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
