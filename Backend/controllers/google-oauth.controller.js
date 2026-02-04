import { OAuth2Client } from 'google-auth-library';
import User from '../models/User.js';
import { createAccessToken, createRefreshToken } from '../services/token.service.js';

import dotenv from 'dotenv';
dotenv.config();

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

export async function googleLogin(req, res) {
  try {
    const { credential } = req.body;
    
    if (!credential) {
      return res.status(400).json({ message: 'Missing Google credential' });
    }

    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const {
      sub: googleId,
      email,
      name,
      picture: avatarUrl,
      email_verified,
    } = payload;

    console.log(' Google login verified:', { email, name, googleId });

    // Check if email is verified
    if (!email_verified) {
      return res.status(400).json({ message: 'Email not verified by Google' });
    }

    // Find or create user
    let user = await User.findOne({ 
      $or: [
        { email: email.toLowerCase().trim() },
        { googleId }
      ]
    });

    if (user) {
      // Update existing user with Google info if needed
      let updated = false;
      
      if (!user.googleId) {
        user.googleId = googleId;
        updated = true;
      }
      
      if (!user.avatarUrl && avatarUrl) {
        user.avatarUrl = avatarUrl;
        updated = true;
      }
      
      if (!user.name && name) {
        user.name = name;
        updated = true;
      }

      if (user.provider !== 'google') {
        user.provider = 'google';
        updated = true;
      }

      if (updated) {
        await user.save();
        console.log(' Updated existing user with Google info');
      }
    } else {
      // Create new user
      user = await User.create({
        email: email.toLowerCase().trim(),
        googleId,
        name: name || '',
        avatarUrl: avatarUrl || '',
        provider: 'google',
        // No password needed for Google OAuth users
      });
      
      console.log(' Created new user from Google login');
    }

    // Generate tokens
    const accessToken = createAccessToken(user);
    const refreshToken = await createRefreshToken(user._id.toString());

    res.json({
      ok: true,
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        provider: user.provider,
      },
    });
  } catch (err) {
    console.error(' Google login error:', err);
    res.status(500).json({ 
      message: err.message || 'Google authentication failed' 
    });
  }
}