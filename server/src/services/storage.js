const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

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
};

// Limits
const VICTIM_LIMIT = 50 * 1024 * 1024;        // 50 MB
const POLICE_LIMIT = 5 * 1024 * 1024 * 1024;  // 5 GB

const stagingDir = path.join(__dirname, '..', '..', 'data', 'staging');
require('fs').mkdirSync(stagingDir, { recursive: true });

function diskStorage() {
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, stagingDir),
    filename: (req, file, cb) => {
      const ext = ALLOWED_TYPES[file.mimetype] || 'bin';
      cb(null, `${uuidv4()}.${ext}`);
    },
  });
}

function fileFilter(req, file, cb) {
  if (ALLOWED_TYPES[file.mimetype]) {
    cb(null, true);
  } else {
    const err = new Error(`File type ${file.mimetype} not allowed`);
    err.name = 'MulterError';
    err.code = 'LIMIT_UNEXPECTED_FILE';
    cb(err, false);
  }
}

/**
 * Victim evidence uploader — light files (screenshots, PDFs, chat exports)
 * up to 50MB. Single field "file".
 */
const victimUpload = multer({
  storage: diskStorage(),
  fileFilter,
  limits: { fileSize: VICTIM_LIMIT },
});

/**
 * Police/forensic uploader — heavy CCTV/video up to 5GB. Multer streams to
 * disk, so memory stays bounded. Single field "file".
 */
const policeUpload = multer({
  storage: diskStorage(),
  fileFilter,
  limits: { fileSize: POLICE_LIMIT },
});

/**
 * Optional-uploader used by social preservation (snapshot may be absent).
 */
const socialUpload = multer({
  storage: diskStorage(),
  fileFilter,
  limits: { fileSize: VICTIM_LIMIT },
});

module.exports = {
  victimUpload,
  policeUpload,
  socialUpload,
  ALLOWED_TYPES,
  VICTIM_LIMIT,
  POLICE_LIMIT,
  stagingDir,
};
