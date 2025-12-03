import express from "express";
import { ensureAuth } from "../middleware/auth.js";
import User from "../models/User.js";
import Deposit from "../models/Deposit.js";
import Withdrawal from "../models/Withdrawal.js";
import Transaction from "../models/Transaction.js";
import CryptoService from "../services/cryptoService.js";

const router = express.Router();

router.get("/deposit-address/:currency", ensureAuth, (req, res) => {
  const { currency } = req.params;
  
  if (!['BTC', 'LTC'].includes(currency.toUpperCase())) {
    return res.status(400).json({ error: "Only BTC and LTC are supported" });
  }

  const address = CryptoService.getWalletAddress(currency.toUpperCase());
  if (!address) {
    return res.status(500).json({ error: "Wallet not configured" });
  }

  res.json({ 
    currency: currency.toUpperCase(), 
    address,
    requiredConfirmations: CryptoService.getRequiredConfirmations(currency.toUpperCase())
  });
});

router.post("/deposit/report", ensureAuth, async (req, res) => {
  try {
    const { currency, txHash } = req.body;
    
    if (!['BTC', 'LTC'].includes(currency.toUpperCase())) {
      return res.status(400).json({ error: "Only BTC and LTC are supported" });
    }

    if (!txHash || txHash.length < 60) {
      return res.status(400).json({ error: "Invalid transaction hash" });
    }

    const existing = await Deposit.findByTxHash(txHash);
    if (existing) {
      return res.status(400).json({ error: "This transaction has already been reported" });
    }

    const deposit = await Deposit.create({
      userId: req.user._id,
      currency: currency.toUpperCase(),
      txHash,
      status: 'pending',
      confirmations: 0
    });

    res.json({ 
      success: true, 
      depositId: deposit.id,
      message: "Deposit detected! Awaiting confirmations.",
      requiredConfirmations: CryptoService.getRequiredConfirmations(currency.toUpperCase())
    });
  } catch (err) {
    console.error('Deposit report error:', err);
    res.status(500).json({ error: "Failed to report deposit" });
  }
});

router.get("/deposit/status/:depositId", ensureAuth, async (req, res) => {
  try {
    const { depositId } = req.params;
    const deposit = await Deposit.findById(depositId);
    
    if (!deposit) {
      return res.status(404).json({ error: "Deposit not found" });
    }

    if (deposit.user_id !== req.user._id) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (deposit.status === 'confirmed') {
      return res.json({
        status: 'confirmed',
        message: "Transaction Complete!",
        amount: deposit.amount_satoshi,
        confirmations: deposit.confirmations
      });
    }

    const checkResult = await CryptoService.checkConfirmations(deposit.currency, deposit.tx_hash);
    
    await Deposit.updateConfirmations(depositId, checkResult.confirmations);

    if (checkResult.confirmed && deposit.status === 'pending') {
      await Deposit.confirm(depositId, checkResult.amount);
      
      const usdCents = CryptoService.satoshiToUsd(checkResult.amount, deposit.currency);
      await User.updateBalance(deposit.user_id, usdCents);
      
      await Transaction.create({
        userId: deposit.user_id,
        type: 'deposit',
        amountCents: usdCents,
        currency: deposit.currency,
        referenceType: 'deposit',
        referenceId: depositId
      });

      return res.json({
        status: 'confirmed',
        message: "Transaction Complete!",
        amount: checkResult.amount,
        amountUsd: usdCents / 100,
        confirmations: checkResult.confirmations
      });
    }

    res.json({
      status: 'pending',
      message: "Deposit detected! Awaiting confirmations.",
      confirmations: checkResult.confirmations,
      required: checkResult.required
    });
  } catch (err) {
    console.error('Deposit status error:', err);
    res.status(500).json({ error: "Failed to check deposit status" });
  }
});

router.get("/deposits", ensureAuth, async (req, res) => {
  const deposits = await Deposit.findByUserId(req.user._id);
  res.json(deposits);
});

router.post("/withdraw", ensureAuth, async (req, res) => {
  try {
    const { currency, amount, address } = req.body;

    if (!['BTC', 'LTC'].includes(currency.toUpperCase())) {
      return res.status(400).json({ error: "Only BTC and LTC are supported" });
    }

    const amountUsd = parseFloat(amount);
    if (isNaN(amountUsd) || amountUsd < 1) {
      return res.status(400).json({ error: "Minimum withdrawal is $1.00" });
    }

    const amountCents = Math.round(amountUsd * 100);
    const user = await User.findById(req.user._id);
    
    if (user.balance < amountCents) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    if (!address || address.length < 25) {
      return res.status(400).json({ error: "Invalid wallet address" });
    }

    await User.updateBalance(user._id, -amountCents);

    const amountSatoshi = CryptoService.usdToSatoshi(amountCents, currency.toUpperCase());

    const withdrawal = await Withdrawal.create({
      userId: user._id,
      currency: currency.toUpperCase(),
      amountSatoshi,
      address,
      status: 'pending'
    });

    await Transaction.create({
      userId: user._id,
      type: 'withdrawal',
      amountCents: -amountCents,
      currency: currency.toUpperCase(),
      referenceType: 'withdrawal',
      referenceId: withdrawal.id
    });

    res.json({ 
      success: true, 
      withdrawalId: withdrawal.id,
      message: "Withdrawal request submitted. Please wait for admin approval.",
      amountCrypto: CryptoService.formatSatoshi(amountSatoshi, currency.toUpperCase())
    });
  } catch (err) {
    console.error('Withdrawal error:', err);
    res.status(500).json({ error: "Failed to process withdrawal" });
  }
});

router.get("/withdrawals", ensureAuth, async (req, res) => {
  const withdrawals = await Withdrawal.findByUserId(req.user._id);
  res.json(withdrawals);
});

router.get("/transactions", ensureAuth, async (req, res) => {
  const transactions = await Transaction.findByUserId(req.user._id, 50);
  res.json(transactions);
});

export default router;
