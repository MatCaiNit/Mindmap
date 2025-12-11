// Realtime/utils/jwt.js
import jwt from 'jsonwebtoken';
import { CONFIG } from '../config.js';

/**
 * Xác thực JWT Token từ URL
 * @param {string} token 
 * @returns {object|null} Payload user
 */
export function verifyToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, CONFIG.JWT_SECRET);
  } catch (err) {
    return null;
  }
}