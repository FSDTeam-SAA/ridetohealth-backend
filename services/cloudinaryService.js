// ============================================
// cloudinaryService.js - Optimized Version
// ============================================

const { Readable } = require('stream');
const { cloudinaryCloudName, cloudinaryApiKey, cloudinarySecret } = require('../config/config');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: cloudinaryCloudName,
  api_key: cloudinaryApiKey,
  api_secret: cloudinarySecret,
  // Add timeout configuration
  timeout: 60000 // 60 seconds
});

const uploadToCloudinary = (buffer, folder) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        public_id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        resource_type: 'auto',
        // Optimize for faster uploads
        quality: 'auto:good', // Reduced from 'auto' to 'auto:good'
        transformation: [
          { width: 1500, height: 1500, crop: 'limit' }, // Resize large images
          { quality: 'auto:good' }
        ]
      },
      (error, result) => {
        if (error) {
          console.error("Cloudinary upload error:", error);
          reject(error);
        } else {
          console.log("Upload successful:", result.public_id);
          resolve(result);
        }
      }
    );

    // Convert buffer to stream
    Readable.from(buffer).pipe(stream);
  });
};

module.exports = {
  uploadToCloudinary
};