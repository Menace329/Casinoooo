import express from "express";
import { ensureAuth } from "../middleware/auth.js";
import User from "../models/User.js";
import GameHistory from "../models/GameHistory.js";
import Transaction from "../models/Transaction.js";
import ActiveGame from "../models/ActiveGame.js";
import GameService from "../services/gameService.js";

const router = express.Router();

const processGame = async (req, res, gameType, gameLogic) => {
  try {
    let { bet } = req.body;
    bet = Math.round(parseFloat(bet) * 100);

    if (bet <= 0 || isNaN(bet)) return res.status(400).json({ error: "Invalid bet amount" });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(400).json({ error: "User not found" });
    if (user.balance < bet) return res.status(400).json({ error: "Insufficient balance" });

    await User.updateBalance(user._id, -bet);

    const result = await gameLogic(req.body, user);
    const payout = result.win ? Math.floor(bet * result.multiplier) : 0;

    if (payout > 0) {
      await User.updateBalance(user._id, payout);
    }

    await GameHistory.create({
      userId: user._id,
      gameType,
      betCents: bet,
      payoutCents: payout,
      multiplier: result.multiplier,
      result: JSON.stringify(result),
      won: result.win
    });

    await Transaction.create({
      userId: user._id,
      type: 'bet',
      amountCents: -bet,
      referenceType: 'game',
      referenceId: gameType
    });

    if (payout > 0) {
      await Transaction.create({
        userId: user._id,
        type: 'payout',
        amountCents: payout,
        referenceType: 'game',
        referenceId: gameType
      });
    }

    const updatedUser = await User.findById(user._id);

    res.json({
      ...result,
      bet: bet / 100,
      payout: payout / 100,
      newBalance: updatedUser.balance / 100
    });
  } catch (err) {
    console.error(`${gameType} error:`, err);
    res.status(500).json({ error: "Game error occurred" });
  }
};

router.post("/dice", ensureAuth, async (req, res) => {
  const { chance } = req.body;
  if (!chance || chance < 1 || chance > 98) {
    return res.status(400).json({ error: "Chance must be between 1 and 98" });
  }
  await processGame(req, res, 'dice', async (body, user) => await GameService.dice(parseFloat(chance), user));
});

router.post("/mines/start", ensureAuth, async (req, res) => {
  try {
    let { bet, mineCount } = req.body;
    bet = Math.round(parseFloat(bet) * 100);
    mineCount = parseInt(mineCount);

    if (bet <= 0 || isNaN(bet)) return res.status(400).json({ error: "Invalid bet amount" });
    if (!mineCount || mineCount < 1 || mineCount > 24) {
      return res.status(400).json({ error: "Mine count must be between 1 and 24" });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(400).json({ error: "User not found" });
    if (user.balance < bet) return res.status(400).json({ error: "Insufficient balance" });

    const existingGame = await ActiveGame.findByUserAndType(user._id, 'mines');
    if (existingGame) {
      await ActiveGame.deleteByUserAndType(user._id, 'mines');
    }

    await User.updateBalance(user._id, -bet);

    const gameState = GameService.minesInit(mineCount);
    await ActiveGame.create(user._id, 'mines', gameState, bet);

    const updatedUser = await User.findById(user._id);

    res.json({
      success: true,
      mineCount,
      newBalance: updatedUser.balance / 100
    });
  } catch (err) {
    console.error('Mines start error:', err);
    res.status(500).json({ error: "Game error occurred" });
  }
});

router.post("/mines/reveal", ensureAuth, async (req, res) => {
  try {
    const { position } = req.body;
    
    const user = await User.findById(req.user._id);
    if (!user) return res.status(400).json({ error: "User not found" });

    const activeGame = await ActiveGame.findByUserAndType(user._id, 'mines');
    if (!activeGame) {
      return res.status(400).json({ error: "No active game. Start a new game first." });
    }

    const result = await GameService.minesReveal(activeGame.gameState, position, user);

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    await ActiveGame.update(activeGame.id, result.gameState);

    if (result.gameOver) {
      await ActiveGame.delete(activeGame.id);

      await GameHistory.create({
        userId: user._id,
        gameType: 'mines',
        betCents: activeGame.bet_cents,
        payoutCents: 0,
        multiplier: 0,
        result: JSON.stringify(result),
        won: false
      });

      await Transaction.create({
        userId: user._id,
        type: 'bet',
        amountCents: -activeGame.bet_cents,
        referenceType: 'game',
        referenceId: 'mines'
      });
    }

    const updatedUser = await User.findById(user._id);

    res.json({
      ...result,
      newBalance: updatedUser.balance / 100
    });
  } catch (err) {
    console.error('Mines reveal error:', err);
    res.status(500).json({ error: "Game error occurred" });
  }
});

router.post("/mines/cashout", ensureAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(400).json({ error: "User not found" });

    const activeGame = await ActiveGame.findByUserAndType(user._id, 'mines');
    if (!activeGame) {
      return res.status(400).json({ error: "No active game" });
    }

    const result = GameService.minesCashout(activeGame.gameState);

    if (!result.win) {
      return res.status(400).json({ error: "Cannot cashout without revealing tiles" });
    }

    const payout = Math.floor(activeGame.bet_cents * result.multiplier);
    await User.updateBalance(user._id, payout);

    await ActiveGame.delete(activeGame.id);

    await GameHistory.create({
      userId: user._id,
      gameType: 'mines',
      betCents: activeGame.bet_cents,
      payoutCents: payout,
      multiplier: result.multiplier,
      result: JSON.stringify({ ...result, revealed: activeGame.gameState.revealed.length }),
      won: true
    });

    await Transaction.create({
      userId: user._id,
      type: 'bet',
      amountCents: -activeGame.bet_cents,
      referenceType: 'game',
      referenceId: 'mines'
    });

    await Transaction.create({
      userId: user._id,
      type: 'payout',
      amountCents: payout,
      referenceType: 'game',
      referenceId: 'mines'
    });

    const updatedUser = await User.findById(user._id);

    res.json({
      success: true,
      multiplier: result.multiplier,
      payout: payout / 100,
      newBalance: updatedUser.balance / 100
    });
  } catch (err) {
    console.error('Mines cashout error:', err);
    res.status(500).json({ error: "Game error occurred" });
  }
});

router.post("/mines", ensureAuth, async (req, res) => {
  const { mineCount, revealed } = req.body;
  if (!mineCount || mineCount < 1 || mineCount > 24) {
    return res.status(400).json({ error: "Mine count must be between 1 and 24" });
  }
  
  const user = await User.findById(req.user._id);
  const gameState = GameService.minesInit(parseInt(mineCount));
  let currentState = gameState;
  
  for (const pos of (revealed || [])) {
    const result = await GameService.minesReveal(currentState, pos, user);
    currentState = result.gameState;
    if (result.gameOver) {
      await processGame(req, res, 'mines', async () => result);
      return;
    }
  }
  
  const finalResult = {
    win: true,
    multiplier: currentState.revealed.length > 0 
      ? Math.pow(25 / (25 - parseInt(mineCount)), currentState.revealed.length) * 0.98 
      : 0,
    mines: currentState.mines,
    result: 'safe',
    canCashout: true
  };
  
  await processGame(req, res, 'mines', async () => finalResult);
});

router.post("/crash", ensureAuth, async (req, res) => {
  const { cashoutAt } = req.body;
  await processGame(req, res, 'crash', async (body, user) => {
    const crashPoint = await GameService.crash(user);
    const win = parseFloat(cashoutAt) <= crashPoint;
    return { 
      crashPoint, 
      cashoutAt: parseFloat(cashoutAt),
      win, 
      multiplier: win ? parseFloat(cashoutAt) : 0 
    };
  });
});

router.post("/plinko", ensureAuth, async (req, res) => {
  const { risk, rows } = req.body;
  const validRisks = ['low', 'medium', 'high'];
  if (!validRisks.includes(risk)) {
    return res.status(400).json({ error: "Risk must be low, medium, or high" });
  }
  await processGame(req, res, 'plinko', async (body, user) => await GameService.plinko(risk, parseInt(rows) || 8, user));
});

router.post("/limbo", ensureAuth, async (req, res) => {
  const { target } = req.body;
  if (!target || target < 1.01 || target > 1000) {
    return res.status(400).json({ error: "Target must be between 1.01 and 1000" });
  }
  await processGame(req, res, 'limbo', async (body, user) => await GameService.limbo(parseFloat(target), user));
});

router.post("/wheel", ensureAuth, async (req, res) => {
  const { segments } = req.body;
  const defaultSegments = [
    { value: '0x', multiplier: 0, weight: 10 },
    { value: '1.2x', multiplier: 1.2, weight: 30 },
    { value: '1.5x', multiplier: 1.5, weight: 25 },
    { value: '2x', multiplier: 2, weight: 20 },
    { value: '3x', multiplier: 3, weight: 10 },
    { value: '10x', multiplier: 10, weight: 5 }
  ];
  await processGame(req, res, 'wheel', async (body, user) => await GameService.wheel(segments || defaultSegments, user));
});

router.post("/roulette", ensureAuth, async (req, res) => {
  const { betType, betValue } = req.body;
  const validTypes = ['number', 'red', 'black', 'even', 'odd', 'low', 'high'];
  if (!validTypes.includes(betType)) {
    return res.status(400).json({ error: "Invalid bet type" });
  }
  await processGame(req, res, 'roulette', async (body, user) => await GameService.roulette(betType, betValue, user));
});

router.post("/keno", ensureAuth, async (req, res) => {
  const { selectedNumbers, risk } = req.body;
  
  if (!selectedNumbers || !Array.isArray(selectedNumbers) || selectedNumbers.length < 1 || selectedNumbers.length > 10) {
    return res.status(400).json({ error: "Select between 1 and 10 numbers" });
  }
  
  const validNumbers = selectedNumbers.every(n => n >= 1 && n <= 40);
  if (!validNumbers) {
    return res.status(400).json({ error: "Numbers must be between 1 and 40" });
  }
  
  const uniqueNumbers = [...new Set(selectedNumbers)];
  if (uniqueNumbers.length !== selectedNumbers.length) {
    return res.status(400).json({ error: "Duplicate numbers not allowed" });
  }
  
  const validRisks = ['low', 'classic', 'medium', 'high'];
  const riskLevel = validRisks.includes(risk) ? risk : 'classic';
  
  await processGame(req, res, 'keno', async (body, user) => await GameService.keno(uniqueNumbers, riskLevel, user));
});

router.post("/slots", ensureAuth, async (req, res) => {
  await processGame(req, res, 'slots', async (body, user) => await GameService.slots(1, user));
});

router.get("/history", ensureAuth, async (req, res) => {
  const history = await GameHistory.findByUserId(req.user._id, 50);
  res.json(history);
});

export default router;
