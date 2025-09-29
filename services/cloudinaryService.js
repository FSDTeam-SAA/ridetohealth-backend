const { cloudinaryCloudName, cloudinaryApiKey, cloudinarySecret } = require('../config/config');

const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: cloudinaryCloudName,
  api_key: cloudinaryApiKey,
  api_secret: cloudinarySecret
});

const uploadToCloudinary = async (buffer, folder) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto'
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result.secure_url);
        }
      }
    ).end(buffer);
  });
};

module.exports = {
  uploadToCloudinary
};