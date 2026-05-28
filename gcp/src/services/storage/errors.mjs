import { writeJson } from '../../http/body.mjs';

export function storageError(status, reason, message) {
  return {
    error: {
      code: status,
      message,
      errors: [
        {
          message,
          domain: 'global',
          reason,
        },
      ],
    },
  };
}

export function writeStorageError(response, status, reason, message) {
  writeJson(response, status, storageError(status, reason, message));
}

export function missingBucketMessage() {
  return 'The specified bucket does not exist.';
}

export function missingObjectMessage() {
  return 'No such object.';
}

export function duplicateBucketMessage() {
  return 'The requested bucket name is not available.';
}

export function bucketNotEmptyMessage() {
  return 'The bucket you tried to delete is not empty.';
}
