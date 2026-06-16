/** DI token for the active storage backend. */
export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

/**
 * Storage abstraction. The rest of the module depends only on this interface,
 * so the backend can be swapped (local disk → S3 → GCS) by binding a different
 * provider to STORAGE_PROVIDER — no changes to FilesService.
 */
export interface StorageProvider {
  /** Persist bytes under `key`. */
  save(key: string, data: Buffer): Promise<void>;
  /** Read the bytes stored at `key`. */
  read(key: string): Promise<Buffer>;
  /** Remove the object at `key` (idempotent — missing key is not an error). */
  remove(key: string): Promise<void>;
}
