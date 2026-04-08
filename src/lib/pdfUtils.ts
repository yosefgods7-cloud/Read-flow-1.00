let worker: Worker | null = null;
let messageIdCounter = 0;
const pendingResolvers = new Map<number, { resolve: (url?: string) => void, reject: (err: any) => void }>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./thumbnail.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, dataUrl, success, error } = e.data;
      const resolver = pendingResolvers.get(id);
      if (resolver) {
        if (success) {
          resolver.resolve(dataUrl);
        } else {
          resolver.reject(new Error(error));
        }
        pendingResolvers.delete(id);
      }
    };
  }
  return worker;
}

export async function generatePdfThumbnail(file: File): Promise<string | undefined> {
  return new Promise((resolve) => {
    try {
      const w = getWorker();
      const id = messageIdCounter++;
      
      pendingResolvers.set(id, { 
        resolve, 
        reject: (err) => {
          console.error('Worker thumbnail error:', err);
          resolve(undefined); // Fallback to undefined on error
        } 
      });
      
      w.postMessage({ file, id });
      
      // Safety timeout on the main thread side
      setTimeout(() => {
        if (pendingResolvers.has(id)) {
          console.error('Worker thumbnail generation timed out');
          pendingResolvers.delete(id);
          resolve(undefined);
        }
      }, 10000);
    } catch (err) {
      console.error('Error dispatching to worker:', err);
      resolve(undefined);
    }
  });
}
