import React, { useState, useEffect, useRef } from 'react';
import { useIntersection } from 'react-use';
import * as pdfjsLib from 'pdfjs-dist';
import { PdfPage } from './PdfPage';

interface VirtualPdfPageProps {
  pdf: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  defaultHeight: number;
  onVisible: (pageNumber: number) => void;
}

export const VirtualPdfPage: React.FC<VirtualPdfPageProps> = ({ pdf, pageNumber, defaultHeight, onVisible }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const intersection = useIntersection(containerRef, {
    root: null,
    rootMargin: '1000px 0px', // Render 1000px above and below viewport
    threshold: 0,
  });

  const isVisible = intersection && intersection.isIntersecting;
  const [actualHeight, setActualHeight] = useState<number | null>(null);

  // Track visibility for reading progress
  const strictIntersection = useIntersection(containerRef, {
    root: null,
    rootMargin: '-10% 0px -50% 0px', // Consider visible when top is near top of screen
    threshold: 0,
  });

  useEffect(() => {
    if (strictIntersection?.isIntersecting) {
      onVisible(pageNumber);
    }
  }, [strictIntersection?.isIntersecting, pageNumber, onVisible]);

  return (
    <div
      ref={containerRef}
      className="w-full flex justify-center mb-4"
      style={{ minHeight: actualHeight || defaultHeight }}
    >
      {isVisible ? (
        <PdfPage
          pdf={pdf}
          pageNumber={pageNumber}
          scale={window.innerWidth < 768 ? 1.2 : 2.0}
          onPageRendered={(_, __, height) => setActualHeight(height)}
        />
      ) : (
        <div className="w-full h-full bg-zinc-900 animate-pulse" />
      )}
    </div>
  );
};
