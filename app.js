const App = {
  user: null,

  async init() {
    await this.checkAuth();
    this.setupEventListeners();
  },

  async checkAuth() {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include'
      });
      if (response.ok) {
        this.user = await response.json();
        this.updateUI();
      }
    } catch (error) {
      console.log('Not logged in');
    }
  },

  updateUI() {
    const authNav = document.getElementById('authNav');
    const userNav = document.getElementById('userNav');
    const heroRegister = document.getElementById('heroRegister');
    const adminLink = document.getElementById('adminLink');
    const userBalance = document.getElementById('userBalance');
    const userName = document.getElementById('userName');

    if (this.user) {
      if (authNav) authNav.classList.add('hidden');
      if (userNav) userNav.classList.remove('hidden');
      if (heroRegister) {
        heroRegister.textContent = 'Play Now';
        heroRegister.href = '#games';
      }
      if (userBalance) userBalance.textContent = '$' + this.user.balance.toFixed(2);
      if (userName) userName.textContent = this.user.username;
      if (adminLink && this.user.isAdmin) {
        adminLink.classList.remove('hidden');
      }
    } else {
      if (authNav) authNav.classList.remove('hidden');
      if (userNav) userNav.classList.add('hidden');
    }
  },

  setupEventListeners() {
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');
    const logoutBtn = document.getElementById('logoutBtn');

    if (userMenuBtn && userDropdown) {
      userMenuBtn.addEventListener('click', () => {
        userDropdown.classList.toggle('hidden');
      });

      document.addEventListener('click', (e) => {
        if (!userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
          userDropdown.classList.add('hidden');
        }
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await this.logout();
      });
    }
  },

  async logout() {
    try {
      await fetch('/api/auth/logout', { 
        method: 'POST',
        credentials: 'include'
      });
      this.user = null;
      window.location.href = '/';
    } catch (error) {
      console.error('Logout failed:', error);
    }
  },

  formatBalance(cents) {
    return '$' + (cents / 100).toFixed(2);
  },

  showAlert(message, type = 'error') {
    const container = document.querySelector('.alert-container') || document.body;
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    container.prepend(alert);
    setTimeout(() => alert.remove(), 5000);
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
