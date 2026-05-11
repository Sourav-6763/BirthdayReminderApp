import CryptoJS from 'crypto-js';
import dotenv from 'dotenv';
dotenv.config();

export const encryptText = (text) => {
  if (!text) return '';

  const encrypted = CryptoJS.AES.encrypt(text,process.env.SECRET_KEY).toString();
  return encrypted;
};

export const decryptText = (cipher) => {
  if (!cipher) return '';

  const bytes = CryptoJS.AES.decrypt(cipher,process.env.SECRET_KEY);
  const originalText = bytes.toString(CryptoJS.enc.Utf8);

  return originalText;
};
