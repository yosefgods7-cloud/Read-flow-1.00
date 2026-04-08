import { useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Set worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export function usePdf(blob: Blob | undefined) {
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);

  useEffect(() => {
    if (!blob) {
      setPdf(null);
      setLoadProgress(0);
      return;
    }

    let isMounted = true;
    const url = URL.createObjectURL(blob);
    
    const loadingTask = pdfjsLib.getDocument(url);
    
    loadingTask.onProgress = (p) => {
      if (isMounted && p.total) {
        setLoadProgress(Math.round((p.loaded / p.total) * 100));
      }
    };

    loadingTask.promise.then(
      (doc) => {
        if (isMounted) setPdf(doc);
      },
      (err) => {
        if (isMounted) setError(err);
      }
    );

    return () => {
      isMounted = false;
      loadingTask.destroy();
      URL.revokeObjectURL(url);
    };
  }, [blob]);

  return { pdf, error, loadProgress };
}
