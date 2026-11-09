import multer from "multer";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import cloudinary, { isCloudinaryConfigured } from "../config/cloudinary.js";
import { discardAvatarUpload } from "../services/avatarImages.js";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

const filterImage = (req, file, cb) => {
    if (!IMAGE_TYPES.includes(file.mimetype)) {
      const error = new Error("Only JPEG, PNG or WEBP images are allowed");
      error.statusCode = 400;
      return cb(error);
    }
    return cb(null, true);
};

const upload = (handler) => (req, res, next) => {
  if (!isCloudinaryConfigured()) {
    return res.status(503).json({
      statusCode: 503,
      success: false,
      message: "File uploads are not configured",
    });
  }
  return handler(req, res, (error) => (error ? next(error) : next()));
};

const storeAvatar = async (req, file) => {
  let transfer;
  const uploaded = new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      folder: `${process.env.CLOUDINARY_FOLDER || "fixly"}/avatars/${req.user._id}`,
      public_id: randomUUID(),
      resource_type: "image",
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
      format: "webp",
      transformation: [{ width: 512, height: 512, crop: "fill", gravity: "auto", quality: "auto" }],
      timeout: 30000,
    }, (error, result) => error ? reject(error) : resolve(result));
    transfer = pipeline(file.stream, stream);
  });
  const [result] = await Promise.all([uploaded, transfer]);
  return { path: result.secure_url, size: result.bytes, filename: result.public_id };
};

export const avatarStorage = {
  _handleFile(req, file, callback) {
    storeAvatar(req, file).then((result) => callback(null, result), callback);
  },
  _removeFile(req, file, callback) {
    discardAvatarUpload(req.user._id, file.filename).then(() => callback(), callback);
  },
};

export const uploadAvatar = upload(multer({
  storage: avatarStorage,
  fileFilter: filterImage,
  limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 0, parts: 1 },
}).single("image"));
