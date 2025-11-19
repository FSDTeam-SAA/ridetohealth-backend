// const { cloudinaryCloudName, cloudinaryApiKey, cloudinarySecret } = require('../config/config');

// const cloudinary = require('cloudinary').v2;

// cloudinary.config({
//   cloud_name: cloudinaryCloudName,
//   api_key: cloudinaryApiKey,
//   api_secret: cloudinarySecret
// });

// const uploadToCloudinary = async (buffer, folder) => {
//   return new Promise((resolve, reject) => {
//     cloudinary.uploader.upload_stream(
//       {
//         folder,
//         resource_type: 'auto'
//       },
//       (error, result) => {
//         if (error) {
//           reject(error);
//         } else {
//           resolve(result.secure_url);
//         }
//       }
//     ).end(buffer);
//   });
// };

// module.exports = {
//   uploadToCloudinary
// };

const { Readable } = require('stream');
// const cloudinary = require('../config/cloudinary'); // Adjust path based on your structure
const { cloudinaryCloudName, cloudinaryApiKey, cloudinarySecret } = require('../config/config');

const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: cloudinaryCloudName,
  api_key: cloudinaryApiKey,
  api_secret: cloudinarySecret
});


const uploadToCloudinary = (buffer, filename, folder) => {
  return new Promise((resolve, reject) => {
    console.log("before check");
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        public_id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        resource_type: 'auto',
        overwrite: true,
        quality: 'auto',
        fetch_format: 'auto',
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    console.log("mahabur", stream);
    // Convert buffer to stream
    Readable.from(buffer).pipe(stream);
  });
};

module.exports = {
  uploadToCloudinary
};
