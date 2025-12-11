// Backend/services/token.service.js
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import RefreshToken from '../models/RefreshToken.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

export function createAccessToken(user) {
  return jwt.sign(
    {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
    },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

export async function createRefreshToken(userId) {
  const token = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  await RefreshToken.create({ userId, token, expiresAt });
  return token;
}

export async function rotateRefreshToken(oldToken) {
  const rec = await RefreshToken.findOne({ token: oldToken });
  if (!rec) return null;
  if (rec.expiresAt < new Date()) return null;
  await RefreshToken.deleteOne({ token: oldToken });
  return createRefreshToken(rec.userId.toString());
}
