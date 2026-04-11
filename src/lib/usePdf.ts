import { useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Set worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export function usePdf(source: Blob | string | undefined) {
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);

  useEffect(() => {
    if (!source) {
      setPdf(null);
      setLoadProgress(0);
      return;
    }

    let isMounted = true;
    let urlToUse: string;
    let isBlobUrl = false;

    if (typeof source === 'string') {
      urlToUse = source;
    } else {
      urlToUse = URL.createObjectURL(source);
      isBlobUrl = true;
    }
    
    const loadingTask = pdfjsLib.getDocument(urlToUse);
    
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
      if (isBlobUrl) {
        URL.revokeObjectURL(urlToUse);
      }
    };
  }, [source]);

  return { pdf, error, loadProgress };
}
