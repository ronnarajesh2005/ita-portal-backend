const bcrypt = require('bcrypt');
const { z } = require('zod');
const pool = require('../config/db');
const { signToken } = require('../utils/jwt.utils');

const registerSchema = z.object({
  username: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['admin', 'ta']).default('ta'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

async function register(req, res, next) {
  try {
    const data = registerSchema.parse(req.body);

    const [existing] = await pool.query(
      'SELECT user_id FROM users WHERE email = ?',
      [data.email]
    );
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Email already in use' });
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const [result] = await pool.query(
      'INSERT INTO users (username, email, password, role, status) VALUES (?, ?, ?, ?, ?)',
      [data.username, data.email, hashedPassword, data.role, 'active']
    );

    res.status(201).json({
      success: true,
      data: { user_id: result.insertId, username: data.username, email: data.email, role: data.role },
    });
  } catch (err) {
    next(err);
  }
}

async function login(req, res, next) {
  try {
    const data = loginSchema.parse(req.body);

    const [rows] = await pool.query(
      'SELECT * FROM users WHERE email = ?',
      [data.email]
    );
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const user = rows[0];

    if (user.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Account is inactive' });
    }

    const match = await bcrypt.compare(data.password, user.password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = signToken({ user_id: user.user_id, role: user.role });

    res.json({
      success: true,
      data: {
        token,
        user: {
          user_id: user.user_id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { register, login };