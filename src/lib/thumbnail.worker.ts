import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

self.onmessage = async (e: MessageEvent) => {
  const { file, id } = e.data;
  let url = '';
  let loadingTask: pdfjsLib.PDFDocumentLoadingTask | null = null;
  
  try {
    url = URL.createObjectURL(file);
    loadingTask = pdfjsLib.getDocument(url);
    
    const pdf = await Promise.race([
      loadingTask.promise,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Thumbnail generation timed out')), 5000))
    ]);
    
    const page = await pdf.getPage(1);
    
    const viewport = page.getViewport({ scale: 1.0 });
    const scale = 120 / viewport.width;
    const scaledViewport = page.getViewport({ scale });
    
    const canvas = new OffscreenCanvas(scaledViewport.width, scaledViewport.height);
    const context = canvas.getContext('2d');
    
    if (!context) {
      throw new Error('Could not get 2d context');
    }
    
    await page.render({ canvasContext: context as any, viewport: scaledViewport } as any).promise;
    
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
    const reader = new FileReader();
    reader.onloadend = () => {
      self.postMessage({ id, dataUrl: reader.result, success: true });
    };
    reader.readAsDataURL(blob);
    
    await pdf.destroy();
  } catch (err) {
    if (loadingTask) {
      loadingTask.destroy().catch(console.error);
    }
    self.postMessage({ id, error: err instanceof Error ? err.message : 'Unknown error', success: false });
  } finally {
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
};
