import { openDB, DBSchema, IDBPDatabase } from 'idb';

export interface PdfDocument {
  id: string;
  name: string;
  blob?: Blob;
  size: number;
  order: number;
  status: 'to-read' | 'reading' | 'completed';
  progress: number;
  lastPage: number;
  priority: boolean;
  addedAt: number;
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
}

let dbPromise: Promise<IDBPDatabase<ReadFlowDB>> | null = null;

export async function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<ReadFlowDB>('readflow-db', 1, {
      upgrade(db) {
        const store = db.createObjectStore('pdfs', { keyPath: 'id' });
        store.createIndex('by-order', 'order');
        store.createIndex('by-status', 'status');
      },
    });
  }
  return dbPromise;
}

export async function addPdf(file: File) {
  const db = await getDb();
  const id = crypto.randomUUID();
  
  // Use a cursor to find max order without loading all blobs
  const tx = db.transaction('pdfs', 'readonly');
  const index = tx.store.index('by-order');
  let cursor = await index.openCursor(null, 'prev'); // Get highest order first
  const maxOrder = cursor ? cursor.value.order : 0;
  
  const doc: PdfDocument = {
    id,
    name: file.name,
    blob: file,
    size: file.size,
    order: maxOrder + 1,
    status: 'to-read',
    progress: 0,
    lastPage: 1,
    priority: false,
    addedAt: Date.now(),
  };
  await db.put('pdfs', doc);
  return doc;
}

export async function getAllPdfs() {
  const db = await getDb();
  const tx = db.transaction('pdfs', 'readonly');
  const index = tx.store.index('by-order');
  let cursor = await index.openCursor();
  const results: PdfDocument[] = [];
  while (cursor) {
    const { blob, ...rest } = cursor.value;
    results.push(rest as PdfDocument);
    cursor = await cursor.continue();
  }
  return results;
}

export async function getPdf(id: string) {
  const db = await getDb();
  return db.get('pdfs', id);
}

export async function updatePdf(id: string, updates: Partial<PdfDocument>) {
  const db = await getDb();
  const doc = await db.get('pdfs', id);
  if (!doc) return;
  const updated = { ...doc, ...updates };
  await db.put('pdfs', updated);
  return updated;
}

export async function deletePdf(id: string) {
  const db = await getDb();
  await db.delete('pdfs', id);
}
