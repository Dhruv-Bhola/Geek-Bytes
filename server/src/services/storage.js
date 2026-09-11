const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

/*
 * ============================================================
 * ALLOWED DOCUMENT TYPES
 * ============================================================
 */
const ALLOWED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',

  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-msvideo': 'avi',
  'video/webm': 'webm',

  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',

  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'application/json': 'json',

  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',

  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    'xlsx',
};

/*
 * ============================================================
 * SIZE LIMITS
 * ============================================================
 */

const VICTIM_LIMIT = 50 * 1024 * 1024; // 50 MB
const POLICE_LIMIT = 5 * 1024 * 1024 * 1024; // 5 GB

/*
 * Generic Secure DMS upload limit.
 *
 * The large limit is required for CCTV/video evidence.
 */
const DOCUMENT_LIMIT = POLICE_LIMIT;

/*
 * ============================================================
 * STAGING DIRECTORY
 * ============================================================
 */

const stagingDir = path.join(
  __dirname,
  '..',
  '..',
  'data',
  'staging'
);

fs.mkdirSync(stagingDir, {
  recursive: true,
});

/*
 * ============================================================
 * STORAGE ENGINE
 * ============================================================
 *
 * Files are written only to the private staging directory.
 *
 * They are NOT publicly served.
 * The document controller later:
 *
 *   staging file
 *       ↓
 *   SHA-256
 *       ↓
 *   AES-256-GCM encryption
 *       ↓
 *   encrypted storage
 *       ↓
 *   delete staging file
 */
function diskStorage() {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, stagingDir);
    },

    filename: (req, file, cb) => {
      const extension =
        ALLOWED_TYPES[file.mimetype] || 'bin';

      /*
       * UUID prevents filename collisions and avoids trusting
       * the original filename supplied by the client.
       */
      cb(
        null,
        `${uuidv4()}.${extension}`
      );
    },
  });
}

/*
 * ============================================================
 * FILE FILTER
 * ============================================================
 */

function fileFilter(req, file, cb) {
  if (ALLOWED_TYPES[file.mimetype]) {
    return cb(null, true);
  }

  const error = new Error(
    `File type ${file.mimetype} not allowed`
  );

  /*
   * Let the existing application error handler identify this
   * as an upload validation problem.
   */
  error.name = 'MulterError';
  error.code = 'LIMIT_UNEXPECTED_FILE';

  return cb(error, false);
}

/*
 * ============================================================
 * GENERIC SECURE DOCUMENT UPLOAD
 * ============================================================
 *
 * Field name:
 *   file
 *
 * Used by the new Secure DMS Document API.
 */
const documentUpload = multer({
  storage: diskStorage(),
  fileFilter,
  limits: {
    fileSize: DOCUMENT_LIMIT,
  },
});

/*
 * ============================================================
 * VICTIM UPLOAD
 * ============================================================
 *
 * Smaller uploads such as:
 *   screenshots
 *   PDFs
 *   chat exports
 */
const victimUpload = multer({
  storage: diskStorage(),
  fileFilter,
  limits: {
    fileSize: VICTIM_LIMIT,
  },
});

/*
 * ============================================================
 * POLICE / FORENSIC UPLOAD
 * ============================================================
 *
 * Supports large CCTV/video files up to 5 GB.
 *
 * Multer writes directly to disk instead of buffering the
 * complete file in memory.
 */
const policeUpload = multer({
  storage: diskStorage(),
  fileFilter,
  limits: {
    fileSize: POLICE_LIMIT,
  },
});

/*
 * ============================================================
 * SOCIAL MEDIA PRESERVATION
 * ============================================================
 *
 * Snapshot is optional.
 */
const socialUpload = multer({
  storage: diskStorage(),
  fileFilter,
  limits: {
    fileSize: VICTIM_LIMIT,
  },
});

module.exports = {
  documentUpload,
  victimUpload,
  policeUpload,
  socialUpload,

  ALLOWED_TYPES,
  VICTIM_LIMIT,
  POLICE_LIMIT,
  DOCUMENT_LIMIT,

  stagingDir,
};