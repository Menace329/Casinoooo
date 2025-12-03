import express from "express";
import bcrypt from "bcryptjs";
import Joi from "joi";
import User from "../models/User.js";
import { ensureAuth } from "../middleware/auth.js";

const router = express.Router();

const regSchema = Joi.object({
  username: Joi.string().min(3).max(20).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  age: Joi.number().min(18).required()
});

router.post("/register", async (req, res) => {
  try {
    const { error } = regSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { username, email, password, age } = req.body;

    if (age < 18) return res.status(403).json({ error: "Must be 18+." });

    const existEmail = await User.findOne({ email });
    if (existEmail) return res.status(400).json({ error: "Email already used." });

    const existUsername = await User.findOne({ username });
    if (existUsername) return res.status(400).json({ error: "Username already taken." });

    const passwordHash = await bcrypt.hash(password, 10);

    await User.create({
      username,
      email,
      passwordHash,
      age,
      balance: 0
    });

    return res.json({ success: true, message: "Account created successfully!" });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: "Registration failed." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required." });
    }

    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: "User not found." });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(400).json({ error: "Wrong password." });

    req.session.userId = user._id;
    req.session.isAdmin = user.isAdmin;
    req.session.isOwner = user.isOwner;

    res.json({ success: true, isAdmin: user.isAdmin, isOwner: user.isOwner });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: "Login failed." });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Logout failed" });
    }
    res.clearCookie('storm.sid');
    res.json({ success: true });
  });
});

router.get("/me", ensureAuth, (req, res) => {
  const user = req.user;
  res.json({
    id: user._id,
    username: user.username,
    email: user.email,
    balance: user.balance / 100,
    isAdmin: user.isAdmin,
    isOwner: user.isOwner
  });
});

export default router;
