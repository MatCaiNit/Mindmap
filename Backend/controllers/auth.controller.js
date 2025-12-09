import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import RefreshTokenModel from '../models/RefreshToken.js';
import { createAccessToken, createRefreshToken, rotateRefreshToken } from '../services/token.service.js';

export async function register(req, res) {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Missing fields' });
    const exist = await User.findOne({ email });
    if (exist) return res.status(400).json({ message: 'Email exists' });
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password: hashed, name });
    const access = createAccessToken(user._id.toString());
    const refresh = await createRefreshToken(user._id.toString());
    res.json({ ok: true, accessToken: access, refreshToken: refresh, user: { id: user._id, email: user.email, name: user.name } });
  } catch (err) { res.status(500).json({ message: err.message }); }
}

export async function login(req, res) {
  try {
    console.log('req.body:', req.body);
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Missing fields' });

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password || '');
    if (!ok) return res.status(400).json({ message: 'Invalid credentials' });

    const access = createAccessToken(user._id.toString());
    const refresh = await createRefreshToken(user._id.toString());
    res.json({ ok: true, accessToken: access, refreshToken: refresh, user: { id: user._id, email: user.email, name: user.name } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}


export async function refresh(req, res) {
  try {
    const { refreshToken } = req.body;
    const newToken = await rotateRefreshToken(refreshToken);
    if (!newToken) return res.status(400).json({ message: 'Invalid refresh token' });
    const rec = await RefreshTokenModel.findOne({ token: newToken });
    const access = createAccessToken(rec.userId.toString());
    res.json({ ok: true, accessToken: access, refreshToken: newToken });
  } catch (err) { res.status(500).json({ message: err.message }); }
}
