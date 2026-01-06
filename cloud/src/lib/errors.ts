/**
 * Storage module error classes
 */

export class StorageError extends Error {
  public readonly code: string;
  public readonly cause?: Error;

  constructor(message: string, code: string, cause?: Error) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    this.cause = cause;
    Object.setPrototypeOf(this, StorageError.prototype);
  }
}

export class ConfigurationError extends StorageError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONFIGURATION_ERROR', cause);
    this.name = 'ConfigurationError';
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

export class UploadError extends StorageError {
  public readonly key?: string;

  constructor(message: string, key?: string, cause?: Error) {
    super(message, 'UPLOAD_ERROR', cause);
    this.name = 'UploadError';
    this.key = key;
    Object.setPrototypeOf(this, UploadError.prototype);
  }
}

export class DownloadError extends StorageError {
  public readonly key: string;

  constructor(message: string, key: string, cause?: Error) {
    super(message, 'DOWNLOAD_ERROR', cause);
    this.name = 'DownloadError';
    this.key = key;
    Object.setPrototypeOf(this, DownloadError.prototype);
  }
}

export class DeleteError extends StorageError {
  public readonly keys: string[];

  constructor(message: string, keys: string[], cause?: Error) {
    super(message, 'DELETE_ERROR', cause);
    this.name = 'DeleteError';
    this.keys = keys;
    Object.setPrototypeOf(this, DeleteError.prototype);
  }
}

export class NotFoundError extends StorageError {
  public readonly key: string;

  constructor(key: string) {
    super(`File not found: ${key}`, 'NOT_FOUND');
    this.name = 'NotFoundError';
    this.key = key;
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}
