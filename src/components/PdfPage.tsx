import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Global cache for rendered page slices (Blob URLs) to prevent white flashes and speed up scrolling
const pageImageCache = new Map<string, string[]>();
const MAX_CACHE_PAGES = 40; // Keep last 40 pages in memory

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
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const renderTasksRef = useRef<pdfjsLib.RenderTask[]>([]);
  const pageObjRef = useRef<pdfjsLib.PDFPageProxy | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    // Create a unique cache key for this specific PDF, page, and scale
    // @ts-ignore - fingerprint exists on PDFDocumentProxy
    const cacheKey = `${pdf.fingerprint || 'doc'}_${pageNumber}_${readingMode}`;

    const renderPage = async () => {
      try {
        // 1. Check if we already have this page cached
        if (pageImageCache.has(cacheKey)) {
          const cachedUrls = pageImageCache.get(cacheKey)!;
          
          // We need the dimensions to set the slices correctly
          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1.0 });
          
          const pixelRatio = window.devicePixelRatio || 1;
          let targetScale = scale;
          if (readingMode === 'manga') {
            targetScale = (window.innerWidth * pixelRatio) / baseViewport.width;
          } else {
            targetScale = (window.innerWidth * 0.95 * pixelRatio) / baseViewport.width;
          }
          
          const MAX_CANVAS_WIDTH = 4096;
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
          const MAX_CANVAS_HEIGHT = 2048;
          const numSlices = Math.ceil(totalHeight / MAX_CANVAS_HEIGHT);
          const newSlices = [];
          
          for (let i = 0; i < numSlices; i++) {
            const sliceHeight = Math.min(MAX_CANVAS_HEIGHT, totalHeight - i * MAX_CANVAS_HEIGHT);
            newSlices.push({ width: totalWidth, height: sliceHeight });
          }
          
          if (isMounted) {
            setSlices(newSlices);
            setImageUrls(cachedUrls);
          }
          return;
        }

        // 2. If not cached, render it
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
        setTimeout(async () => {
          if (!isMounted || !containerRef.current) return;
          
          const canvases = containerRef.current.querySelectorAll('canvas');
          if (canvases.length !== numSlices) return;

          const newImageUrls: string[] = new Array(numSlices).fill('');
          let completedSlices = 0;

          for (let i = 0; i < numSlices; i++) {
            const canvas = canvases[i];
            const context = canvas.getContext('2d', { alpha: false }); // Optimize for opaque content
            if (!context) continue;

            const sliceHeight = newSlices[i].height;
            const sliceWidth = newSlices[i].width;
            canvas.width = sliceWidth;
            canvas.height = sliceHeight;

            // Fill white background
            context.fillStyle = 'white';
            context.fillRect(0, 0, sliceWidth, sliceHeight);

            // Clone viewport and adjust transform to shift content UP by i * MAX_CANVAS_HEIGHT
            const offsetY = i * MAX_CANVAS_HEIGHT;
            
            const sliceViewport = fullViewport.clone({ dontFlip: false });
            sliceViewport.transform[5] -= offsetY;

            const renderContext = {
              canvasContext: context,
              viewport: sliceViewport,
            };

            const renderTask = page.render(renderContext);
            renderTasksRef.current.push(renderTask);
            
            try {
              await renderTask.promise;
              
              // Convert canvas to Blob URL to save GPU memory and allow caching
              if (isMounted) {
                canvas.toBlob((blob) => {
                  if (blob && isMounted) {
                    const url = URL.createObjectURL(blob);
                    newImageUrls[i] = url;
                    completedSlices++;
                    
                    // If all slices are done, update state and cache
                    if (completedSlices === numSlices) {
                      setImageUrls([...newImageUrls]);
                      
                      // Manage cache size
                      if (pageImageCache.size >= MAX_CACHE_PAGES) {
                        const firstKey = pageImageCache.keys().next().value;
                        if (firstKey) {
                          const urlsToRevoke = pageImageCache.get(firstKey);
                          urlsToRevoke?.forEach(u => URL.revokeObjectURL(u));
                          pageImageCache.delete(firstKey);
                        }
                      }
                      
                      pageImageCache.set(cacheKey, [...newImageUrls]);
                    }
                  }
                }, 'image/jpeg', 0.85); // Use JPEG for smaller memory footprint
              }
            } catch (err: any) {
              if (err.name !== 'RenderingCancelledException') {
                console.error(`Error rendering page ${pageNumber} slice ${i}:`, err);
              }
            }
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
      
      // We no longer cleanup the pageObjRef here because we want PDF.js to cache the parsed page data
      // for faster re-rendering if it falls out of our image cache.
      
      // Free canvas memory immediately
      if (containerRef.current) {
        const canvases = containerRef.current.querySelectorAll('canvas');
        canvases.forEach(c => {
          c.width = 0;
          c.height = 0;
        });
      }
    };
  }, [pdf, pageNumber, scale, readingMode]);

  return (
    <div ref={containerRef} className={`flex flex-col items-center ${readingMode === 'manga' ? 'w-full' : 'shadow-md'}`}>
      {slices.map((slice, i) => (
        <div key={i} style={{ width: slice.width, height: slice.height }} className={`relative ${readingMode === 'manga' ? 'w-full max-w-full' : 'max-w-full'}`}>
          {/* Show image if available, otherwise show the canvas being rendered into */}
          {imageUrls[i] ? (
            <img 
              src={imageUrls[i]} 
              alt={`Page ${pageNumber} part ${i + 1}`}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <canvas
              width={slice.width}
              height={slice.height}
              className="absolute inset-0 w-full h-full bg-zinc-900 animate-pulse"
              style={{ display: 'block' }}
            />
          )}
        </div>
      ))}
    </div>
  );
};
