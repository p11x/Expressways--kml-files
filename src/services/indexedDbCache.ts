import { OSMWayElement } from '../types';

const DB_NAME = 'IndiaRoadsOverpassCacheDB';
const STORE_NAME = 'overpass_responses';
const DB_VERSION = 2; // upgraded for expiry & metadata

const EMPTY_CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface CachedItem {
  key: string; // stateCode_queryHash
  stateCode: string;
  queryHash: string;
  elements: OSMWayElement[];
  elementCount: number;
  timestamp: number;
  server: string;
  isEmpty: boolean;
  expiresAt?: number; // expiry timestamp in ms (used for 0-element empty results)
}

class IndexedDbCache {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB not supported in this environment'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('stateCode', 'stateCode', { unique: false });
          store.createIndex('isEmpty', 'isEmpty', { unique: false });
        } else {
          // If upgrading from v1
          const store = (event.target as IDBOpenDBRequest).transaction?.objectStore(STORE_NAME);
          if (store && !store.indexNames.contains('isEmpty')) {
            store.createIndex('isEmpty', 'isEmpty', { unique: false });
          }
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error || new Error('Failed to open IndexedDB'));
      };
    });

    return this.dbPromise;
  }

  /**
   * Retrieves a cached item only if valid and not expired.
   * If an empty cache entry is older than 24h, automatically deletes it and returns null.
   */
  async get(key: string): Promise<CachedItem | null> {
    try {
      const db = await this.open();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);

        req.onsuccess = () => {
          const item = req.result as CachedItem | undefined;
          if (!item) {
            resolve(null);
            return;
          }

          // Check expiry for empty entries
          if (item.isEmpty && item.expiresAt && Date.now() > item.expiresAt) {
            // Expired empty cache entry -> delete it so fresh query is run
            store.delete(key);
            resolve(null);
            return;
          }

          resolve(item);
        };
        req.onerror = () => {
          resolve(null);
        };
      });
    } catch {
      return null;
    }
  }

  /**
   * Stores a VALIDATED success in the cache.
   * NEVER stores failures, aborts, or error payloads.
   * If elements array has 0 items, sets isEmpty = true and expiresAt = now + 24 hours.
   */
  async setValidated(params: {
    key: string;
    stateCode: string;
    queryHash: string;
    elements: OSMWayElement[];
    server: string;
  }): Promise<void> {
    const { key, stateCode, queryHash, elements, server } = params;

    // Safety check: ensure elements is a valid array
    if (!Array.isArray(elements)) {
      return;
    }

    const isEmpty = elements.length === 0;
    const now = Date.now();

    const item: CachedItem = {
      key,
      stateCode,
      queryHash,
      elements,
      elementCount: elements.length,
      timestamp: now,
      server: server || 'unknown',
      isEmpty,
      expiresAt: isEmpty ? now + EMPTY_CACHE_EXPIRY_MS : undefined,
    };

    try {
      const db = await this.open();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(item);

        req.onsuccess = () => resolve();
        req.onerror = () => resolve(); // fail silently on quota
      });
    } catch {
      // ignore
    }
  }

  /**
   * Deletes a single cache entry by key
   */
  async delete(key: string): Promise<void> {
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(key);

        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // ignore
    }
  }

  /**
   * Clears only empty cache entries (0 raw ways)
   */
  async clearEmptyEntries(): Promise<number> {
    try {
      const db = await this.open();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.openCursor();
        let deletedCount = 0;

        req.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const item = cursor.value as CachedItem;
            if (item.isEmpty || item.elementCount === 0 || !item.elements || item.elements.length === 0) {
              cursor.delete();
              deletedCount++;
            }
            cursor.continue();
          } else {
            resolve(deletedCount);
          }
        };

        req.onerror = () => resolve(0);
      });
    } catch {
      return 0;
    }
  }

  /**
   * Clears entire IndexedDB cache store
   */
  async clear(): Promise<void> {
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.clear();

        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // ignore
    }
  }

  /**
   * Gets all stored items with metadata
   */
  async getAllItems(): Promise<CachedItem[]> {
    try {
      const db = await this.open();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();

        req.onsuccess = () => {
          resolve((req.result as CachedItem[]) || []);
        };
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }

  async getAllKeys(): Promise<string[]> {
    try {
      const db = await this.open();
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAllKeys();

        req.onsuccess = () => {
          resolve((req.result as string[]) || []);
        };
        req.onerror = () => resolve([]);
      });
    } catch {
      return [];
    }
  }
}

export const idbCache = new IndexedDbCache();
