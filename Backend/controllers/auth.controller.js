// Backend/controllers/auth.controller.js - UPDATED WITH AVATAR & PROFILE
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import RefreshTokenModel from '../models/RefreshToken.js';
import { createAccessToken, createRefreshToken, rotateRefreshToken } from '../services/token.service.js';

export async function register(req, res) {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Missing fields' });
    
    const exist = await User.findOne({ email: email.toLowerCase().trim() });
    if (exist) return res.status(400).json({ message: 'Email already exists' });
    
    const hashed = await bcrypt.hash(password, 10);
    
    const userData = { 
      email: email.toLowerCase().trim(), 
      password: hashed, 
      name: name || ''
    };
    
    // Handle avatar if uploaded
    if (req.file) {
      // Store as base64 or use cloud storage URL
      userData.avatarUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }
    
    const user = await User.create(userData);
    const access = createAccessToken(user);
    const refresh = await createRefreshToken(user._id.toString());
    
    res.json({ 
      ok: true, 
      accessToken: access, 
      refreshToken: refresh, 
      user: { 
        id: user._id, 
        email: user.email, 
        name: user.name,
        avatarUrl: user.avatarUrl
      } 
    });
  } catch (err) { 
    res.status(500).json({ message: err.message }); 
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Missing fields' });

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password || '');
    if (!ok) return res.status(400).json({ message: 'Invalid credentials' });

    const access = createAccessToken(user);
    const refresh = await createRefreshToken(user._id.toString());
    
    res.json({ 
      ok: true, 
      accessToken: access, 
      refreshToken: refresh, 
      user: { 
        id: user._id, 
        email: user.email, 
        name: user.name,
        avatarUrl: user.avatarUrl
      } 
    });
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
    const user = await User.findById(rec.userId);
    const access = createAccessToken(user);
    
    res.json({ ok: true, accessToken: access, refreshToken: newToken });
  } catch (err) { 
    res.status(500).json({ message: err.message }); 
  }
}

export async function getProfile(req, res) {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    res.json({ 
      ok: true, 
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

export async function updateProfile(req, res) {
  try {
    const { name } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    if (name) user.name = name;
    
    // Handle avatar upload
    if (req.file) {
      user.avatarUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }
    
    await user.save();
    
    res.json({ 
      ok: true, 
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

export async function updatePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Missing fields' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }
    
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }
    
    // Update password
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    
    res.json({ ok: true, message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}