import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function generatePdfThumbnail(file: File): Promise<string | undefined> {
  let url = '';
  let loadingTask: pdfjsLib.PDFDocumentLoadingTask | null = null;
  try {
    url = URL.createObjectURL(file);
    loadingTask = pdfjsLib.getDocument(url);
    
    // Add a timeout to prevent hanging
    const pdf = await Promise.race([
      loadingTask.promise,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Thumbnail generation timed out')), 5000))
    ]);
    
    const page = await pdf.getPage(1);
    
    const viewport = page.getViewport({ scale: 1.0 });
    const scale = 120 / viewport.width; // Max width ~120px
    const scaledViewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    
    canvas.height = scaledViewport.height;
    canvas.width = scaledViewport.width;
    
    await page.render({ canvasContext: context, viewport: scaledViewport }).promise;
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    
    await pdf.destroy();
    
    return dataUrl;
  } catch (err) {
    console.error('Error generating thumbnail:', err);
    if (loadingTask) {
      loadingTask.destroy().catch(console.error);
    }
    return undefined;
  } finally {
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}
