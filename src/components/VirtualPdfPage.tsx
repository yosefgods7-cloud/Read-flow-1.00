import React, { useState, useEffect, useRef, memo } from 'react';
import { useIntersection } from 'react-use';
import * as pdfjsLib from 'pdfjs-dist';
import { PdfPage } from './PdfPage';

interface VirtualPdfPageProps {
  pdf: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  defaultHeight: number;
  readingMode?: 'standard' | 'manga';
  onVisible: (pageNumber: number) => void;
}

export const VirtualPdfPage = memo(({ pdf, pageNumber, defaultHeight, readingMode = 'standard', onVisible }: VirtualPdfPageProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
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
      id={`page-${pageNumber}`}
      ref={containerRef}
      className={`w-full flex justify-center ${readingMode === 'manga' ? '' : 'mb-4'}`}
      style={{ minHeight: actualHeight || defaultHeight }}
    >
      <PdfPage
        pdf={pdf}
        pageNumber={pageNumber}
        scale={readingMode === 'manga' ? (window.innerWidth < 768 ? 1.5 : 2.5) : (window.innerWidth < 768 ? 1.2 : 2.0)}
        readingMode={readingMode}
        onPageRendered={(_, __, height) => setActualHeight(height)}
      />
    </div>
  );
});

VirtualPdfPage.displayName = 'VirtualPdfPage';
