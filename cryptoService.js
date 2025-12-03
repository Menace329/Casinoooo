import axios from 'axios';

const BLOCKCYPHER_BASE = 'https://api.blockcypher.com/v1';

const REQUIRED_CONFIRMATIONS = {
  BTC: 3,
  LTC: 6
};

const SATOSHI_TO_USD_RATE = {
  BTC: 0.00043,
  LTC: 0.0000075
};

const WALLET_ADDRESSES = {
  BTC: 'bc1qzrvztfley2myvrjelgj24ue2a0yxlsxl90vc7w',
  LTC: 'ltc1qequd747vk9thyd2h942ew2mav2ddd43addqj5f'
};

export const CryptoService = {
  getWalletAddress: (currency) => {
    if (currency === 'BTC') return process.env.BTC_WALLET || WALLET_ADDRESSES.BTC;
    if (currency === 'LTC') return process.env.LTC_WALLET || WALLET_ADDRESSES.LTC;
    return null;
  },

  async getAddressTransactions(currency, address) {
    try {
      const chain = currency.toLowerCase() === 'btc' ? 'btc/main' : 'ltc/main';
      const response = await axios.get(`${BLOCKCYPHER_BASE}/${chain}/addrs/${address}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching ${currency} transactions:`, error.message);
      return null;
    }
  },

  async getTransaction(currency, txHash) {
    try {
      const chain = currency.toLowerCase() === 'btc' ? 'btc/main' : 'ltc/main';
      const response = await axios.get(`${BLOCKCYPHER_BASE}/${chain}/txs/${txHash}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching transaction ${txHash}:`, error.message);
      return null;
    }
  },

  async checkConfirmations(currency, txHash) {
    const tx = await this.getTransaction(currency, txHash);
    if (!tx) return { confirmations: 0, confirmed: false };
    
    const confirmations = tx.confirmations || 0;
    const required = REQUIRED_CONFIRMATIONS[currency] || 3;
    
    return {
      confirmations,
      required,
      confirmed: confirmations >= required,
      amount: tx.total || 0
    };
  },

  satoshiToUsd(satoshi, currency) {
    const rate = SATOSHI_TO_USD_RATE[currency] || 0.00043;
    return Math.floor(satoshi * rate);
  },

  usdToSatoshi(usdCents, currency) {
    const rate = SATOSHI_TO_USD_RATE[currency] || 0.00043;
    return Math.floor((usdCents / 100) / rate);
  },

  formatSatoshi(satoshi, currency) {
    if (currency === 'BTC') {
      return (satoshi / 100000000).toFixed(8) + ' BTC';
    }
    return (satoshi / 100000000).toFixed(8) + ' LTC';
  },

  getRequiredConfirmations(currency) {
    return REQUIRED_CONFIRMATIONS[currency] || 3;
  }
};

export default CryptoService;
