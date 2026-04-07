/**
 * IndexedDB local cache for offline support.
 * Data is cached locally and synced to cloud only when user clicks "Save".
 */

const DB_NAME = 'inmaa_cache';
const DB_VERSION = 1;

const STORES = {
  students: 'students',
  hifzHistory: 'hifz_history',
  yearData: 'year_data',
  settings: 'settings',
  meta: 'meta',
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

const openDB = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.students)) {
        db.createObjectStore(STORES.students, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.hifzHistory)) {
        db.createObjectStore(STORES.hifzHistory, { keyPath: ['student_id', 'year_key'] });
      }
      if (!db.objectStoreNames.contains(STORES.yearData)) {
        db.createObjectStore(STORES.yearData, { keyPath: ['student_id', 'year'] });
      }
      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
};

const tx = async (storeName: string, mode: IDBTransactionMode = 'readonly') => {
  const db = await openDB();
  return db.transaction(storeName, mode).objectStore(storeName);
};

const reqToPromise = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

// ========== Generic helpers ==========

export const putItem = async (storeName: string, item: any) => {
  const store = await tx(storeName, 'readwrite');
  await reqToPromise(store.put(item));
};

export const getItem = async <T>(storeName: string, key: any): Promise<T | undefined> => {
  const store = await tx(storeName);
  return reqToPromise(store.get(key));
};

export const getAllItems = async <T>(storeName: string): Promise<T[]> => {
  const store = await tx(storeName);
  return reqToPromise(store.getAll());
};

export const deleteItem = async (storeName: string, key: any) => {
  const store = await tx(storeName, 'readwrite');
  await reqToPromise(store.delete(key));
};

export const clearStore = async (storeName: string) => {
  const store = await tx(storeName, 'readwrite');
  await reqToPromise(store.clear());
};

// ========== Students ==========

export interface CachedStudent {
  id: number;
  name: string;
  teacher: string;
  user_id: string;
}

export const cacheStudents = async (students: CachedStudent[]) => {
  const db = await openDB();
  const transaction = db.transaction(STORES.students, 'readwrite');
  const store = transaction.objectStore(STORES.students);
  // Clear existing
  store.clear();
  students.forEach(s => store.put(s));
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const getCachedStudents = () => getAllItems<CachedStudent>(STORES.students);

export const deleteCachedStudent = (id: number) => deleteItem(STORES.students, id);

export const putCachedStudent = (student: CachedStudent) => putItem(STORES.students, student);

// ========== Hifz History ==========

export interface CachedHifzRow {
  student_id: number;
  year_key: string;
  value: string;
}

export const cacheHifzHistory = async (rows: CachedHifzRow[]) => {
  const db = await openDB();
  const transaction = db.transaction(STORES.hifzHistory, 'readwrite');
  const store = transaction.objectStore(STORES.hifzHistory);
  store.clear();
  rows.forEach(r => store.put(r));
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const getCachedHifzHistory = () => getAllItems<CachedHifzRow>(STORES.hifzHistory);

export const putCachedHifzRow = (row: CachedHifzRow) => putItem(STORES.hifzHistory, row);

// ========== Year Data ==========

export interface CachedYearData {
  student_id: number;
  year: string;
  base_hifz: string;
  total_hifz: string;
  parts: string;
  annual: string;
  recitation: string;
  memorization: string;
  total: string;
  grade: string;
  prize: string;
  status_prize: string;
  rank: string;
  teacher: string;
}

export const cacheYearData = async (rows: CachedYearData[]) => {
  const db = await openDB();
  const transaction = db.transaction(STORES.yearData, 'readwrite');
  const store = transaction.objectStore(STORES.yearData);
  store.clear();
  rows.forEach(r => store.put(r));
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const getCachedYearData = () => getAllItems<CachedYearData>(STORES.yearData);

export const putCachedYearData = (row: CachedYearData) => putItem(STORES.yearData, row);

// ========== Settings ==========

export const setCachedSetting = async (key: string, value: any) => {
  await putItem(STORES.settings, { key, value });
};

export const getCachedSetting = async <T>(key: string): Promise<T | undefined> => {
  const item = await getItem<{ key: string; value: T }>(STORES.settings, key);
  return item?.value;
};

// ========== Meta (last sync time etc) ==========

export const setLastSyncTime = async () => {
  await putItem(STORES.meta, { key: 'lastSync', time: Date.now() });
};

export const getLastSyncTime = async (): Promise<number | null> => {
  const item = await getItem<{ key: string; time: number }>(STORES.meta, 'lastSync');
  return item?.time || null;
};

export const isCachePopulated = async (): Promise<boolean> => {
  const lastSync = await getLastSyncTime();
  return lastSync !== null;
};

// ========== Clear all ==========

export const clearAllCache = async () => {
  const db = await openDB();
  const storeNames = Object.values(STORES);
  const transaction = db.transaction(storeNames, 'readwrite');
  storeNames.forEach(name => transaction.objectStore(name).clear());
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};
