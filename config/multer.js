const multer = require('multer');
const path =  require('path');

// Use memory storage instead of disk storage
const storage = multer.memoryStorage();

// File filter with validation
const fileFilter = (req, file, cb) => {
  const imageTypes = /jpeg|jpg|png|gif|webp|bmp|svg/i;
  const videoTypes = /mp4|avi|mov|mkv|flv|wmv|webm|m4v|3gp/i;
  const audioTypes = /mp3|wav|aac|flac|ogg|m4a|wma|aiff|opus/i;
  const documentTypes = /pdf|doc|docx|txt|xlsx|xls|ppt|pptx|csv|zip|rar/i;

  const extname = path.extname(file.originalname).toLowerCase().substring(1);

  if (
    imageTypes.test(extname) ||
    videoTypes.test(extname) ||
    audioTypes.test(extname) ||
    documentTypes.test(extname)
  ) {
    return cb(null, true);
  } else {
    cb(new Error('File type not supported. Please upload image, video, audio, or document files only.'));
  }
};

const multerUpload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit
  },
  fileFilter: fileFilter,
});

export { multerUpload };

