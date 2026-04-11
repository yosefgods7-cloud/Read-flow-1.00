import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { generatePdfThumbnail } from './pdfUtils';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

export interface PdfDocument {
  id: string;
  name: string;
  blob?: Blob; // Kept for backwards compatibility in types
  url?: string; // URL for native filesystem streaming
  size: number;
  order: number;
  status: 'to-read' | 'reading' | 'completed';
  progress: number;
  lastPage: number;
  priority: boolean;
  addedAt: number;
  thumbnail?: string;
  bookmarks?: number[];
}

interface ReadFlowDB extends DBSchema {
  pdfs: {
    key: string;
    value: PdfDocument;
    indexes: {
      'by-order': number;
      'by-status': string;
    };
  };
  pdf_blobs: {
    key: string;
    value: Blob;
  };
}

let dbPromise: Promise<IDBPDatabase<ReadFlowDB>> | null = null;

export async function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<ReadFlowDB>('readflow-db', 2, {
      upgrade(db, oldVersion, newVersion, transaction) {
        if (oldVersion < 1) {
          const store = db.createObjectStore('pdfs', { keyPath: 'id' });
          store.createIndex('by-order', 'order');
          store.createIndex('by-status', 'status');
        }
        if (oldVersion < 2) {
          db.createObjectStore('pdf_blobs');
          const pdfStore = transaction.objectStore('pdfs');
          const blobStore = transaction.objectStore('pdf_blobs');
          
          pdfStore.openCursor().then(async function migrateCursor(cursor) {
            if (!cursor) return;
            const doc = cursor.value;
            if (doc.blob) {
              await blobStore.put(doc.blob, doc.id);
              delete doc.blob;
              await cursor.update(doc);
            }
            cursor.continue().then(migrateCursor);
          });
        }
      },
    });
  }
  return dbPromise;
}

// Helper to convert Blob to base64 for Capacitor Filesystem
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.readAsDataURL(blob);
  });
};

export async function addPdf(file: File) {
  const db = await getDb();
  const id = crypto.randomUUID();
  
  const tx = db.transaction('pdfs', 'readonly');
  const index = tx.store.index('by-order');
  let cursor = await index.openCursor(null, 'prev');
  const maxOrder = cursor ? cursor.value.order : 0;
  
  generatePdfThumbnail(file).then(async (thumbnail) => {
    if (thumbnail) {
      const currentDb = await getDb();
      const doc = await currentDb.get('pdfs', id);
      if (doc) {
        doc.thumbnail = thumbnail;
        await currentDb.put('pdfs', doc);
        window.dispatchEvent(new CustomEvent('pdf-thumbnail-generated'));
      }
    }
  }).catch(console.error);
  
  const doc: PdfDocument = {
    id,
    name: file.name,
    size: file.size,
    order: maxOrder + 1,
    status: 'to-read',
    progress: 0,
    lastPage: 1,
    priority: false,
    addedAt: Date.now(),
    bookmarks: [],
  };
  
  if (Capacitor.isNativePlatform()) {
    try {
      const base64Data = await blobToBase64(file);
      // Remove data URL prefix (e.g., "data:application/pdf;base64,")
      const base64String = base64Data.split(',')[1];
      
      await Filesystem.writeFile({
        path: `${id}.pdf`,
        data: base64String,
        directory: Directory.Data
      });
      
      const writeTx = db.transaction('pdfs', 'readwrite');
      await writeTx.objectStore('pdfs').put(doc);
      await writeTx.done;
    } catch (e) {
      console.error("Failed to save to filesystem, falling back to IDB", e);
      const writeTx = db.transaction(['pdfs', 'pdf_blobs'], 'readwrite');
      await writeTx.objectStore('pdfs').put(doc);
      await writeTx.objectStore('pdf_blobs').put(file, id);
      await writeTx.done;
    }
  } else {
    const writeTx = db.transaction(['pdfs', 'pdf_blobs'], 'readwrite');
    await writeTx.objectStore('pdfs').put(doc);
    await writeTx.objectStore('pdf_blobs').put(file, id);
    await writeTx.done;
  }
  
  return doc;
}

export async function getAllPdfs() {
  const db = await getDb();
  const tx = db.transaction('pdfs', 'readonly');
  const index = tx.store.index('by-order');
  let cursor = await index.openCursor();
  const results: PdfDocument[] = [];
  while (cursor) {
    results.push(cursor.value);
    cursor = await cursor.continue();
  }
  return results;
}

export async function getPdf(id: string) {
  const db = await getDb();
  const doc = await db.get('pdfs', id);
  if (doc) {
    if (Capacitor.isNativePlatform()) {
      try {
        const stat = await Filesystem.stat({
          path: `${id}.pdf`,
          directory: Directory.Data
        });
        doc.url = Capacitor.convertFileSrc(stat.uri);
      } catch (e) {
        // Fallback if not in filesystem
        const blob = await db.get('pdf_blobs', id);
        if (blob) doc.blob = blob;
      }
    } else {
      const blob = await db.get('pdf_blobs', id);
      if (blob) doc.blob = blob;
    }
  }
  return doc;
}

export async function updatePdf(id: string, updates: Partial<PdfDocument>) {
  const db = await getDb();
  const doc = await db.get('pdfs', id);
  if (!doc) return;
  
  const { blob, url, ...updatesWithoutBlob } = updates as any;
  const updated = { ...doc, ...updatesWithoutBlob };
  delete updated.blob;
  delete updated.url;
  
  await db.put('pdfs', updated);
  return updated;
}

export async function deletePdf(id: string) {
  const db = await getDb();
  
  if (Capacitor.isNativePlatform()) {
    try {
      await Filesystem.deleteFile({
        path: `${id}.pdf`,
        directory: Directory.Data
      });
    } catch (e) {
      console.error("Failed to delete from filesystem", e);
    }
  }
  
  const tx = db.transaction(['pdfs', 'pdf_blobs'], 'readwrite');
  await tx.objectStore('pdfs').delete(id);
  await tx.objectStore('pdf_blobs').delete(id);
  await tx.done;
}
