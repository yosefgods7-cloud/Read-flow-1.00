import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function generatePdfThumbnail(file: File): Promise<string | undefined> {
  try {
    const url = URL.createObjectURL(file);
    const loadingTask = pdfjsLib.getDocument(url);
    const pdf = await loadingTask.promise;
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
    URL.revokeObjectURL(url);
    
    return dataUrl;
  } catch (err) {
    console.error('Error generating thumbnail:', err);
    return undefined;
  }
}
