// const multer = require('multer');

// const storage = multer.memoryStorage();

// const fileFilter = (req, file, cb) => {
//   // Accept images only
//   if (file.mimetype.startsWith('image/')) {
//     cb(null, true);
//   } else {
//     cb(new Error('Only image files are allowed'), false);
//   }
// };

// const upload = multer({
//   storage,
//   fileFilter,
//   limits: {
//     fileSize: 5 * 1024 * 1024 // 5MB limit
//   }
// });

// const uploadMultiple = (fields) => {
//   return upload.fields(fields);
// };

// module.exports = {
//   upload,
//   uploadMultiple
// };



const multer = require('multer');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // List of allowed MIME types
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/tiff',
    'application/pdf', // Allow PDFs for documents
    'application/octet-stream' // Sometimes mobile apps send this
  ];

  // Log for debugging
  console.log(`File: ${file.fieldname}, Original: ${file.originalname}, Mimetype: ${file.mimetype}`);

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    // Additional check: verify by file extension if mimetype is generic
    const fileExtension = file.originalname.split('.').pop().toLowerCase();
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'pdf'];
    
    if (allowedExtensions.includes(fileExtension)) {
      console.log(`Accepting file by extension: ${fileExtension}`);
      cb(null, true);
    } else {
      console.error(`Rejected - Mimetype: ${file.mimetype}, Extension: ${fileExtension}`);
      cb(new Error(`Invalid file type: ${file.mimetype}. Only images and PDFs are allowed`), false);
    }
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

const uploadMultiple = (fields) => {
  return upload.fields(fields);
};

module.exports = {
  upload,
  uploadMultiple
};