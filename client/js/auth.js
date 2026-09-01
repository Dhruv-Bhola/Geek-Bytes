// auth.js — live JWT authentication + role-based routing.
// Submits credentials to POST /api/v1/auth/login, stores the JWT + profile in
// localStorage, then redirects dynamically using the role from the token.
(function () {
  const form = document.getElementById('loginForm');
  if (!form) return;

  const roleBtns = document.querySelectorAll('.role-btn');
  let uiRole = 'victim';

  roleBtns.forEach((b) => {
    b.addEventListener('click', () => {
      roleBtns.forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      uiRole = b.dataset.role;
      const mfa = document.getElementById('mfaIndicator');
      if (mfa) mfa.querySelector('.pill').textContent = uiRole === 'victim' ? 'Optional' : 'Required';
    });
  });

  // Decode the JWT payload (role/jurisdiction claims) without a library.
  function decodeToken(token) {
    try {
      const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(
        atob(base64).split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
      );
      return JSON.parse(json);
    } catch (e) {
      return {};
    }
  }

  // Map a verified backend role to its default workflow page.
  function rolePage(role) {
    if (role === 'admin') return '../pages/admin.html';
    return '../pages/dashboard.html';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identifier = document.getElementById('userId').value.trim();
    const password = document.getElementById('password').value;
    const submitBtn = form.querySelector('[type="submit"]');

    if (!identifier || !password) {
      Toast.show('Enter your ID and password', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Authenticating...';

    try {
      const data = await App.api.post('/auth/login', { identifier, password });
      const token = data.accessToken;
      const user = data.user;
      const payload = decodeToken(token);
      const role = (user && user.role) || payload.role || uiRole;

      // Persist session + profile.
      App.session.setSession(token, data.refreshToken, user);
      localStorage.setItem('dms_role', role);
      localStorage.setItem('userRole', role);
      localStorage.setItem('accessToken', token);
      localStorage.setItem('dms_id', user.customUserId || identifier);

      Toast.show(`Secure login successful — ${role}`, 'success');
      setTimeout(() => {
        location.href = rolePage(role);
      }, 800);
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Secure Login →';
      Toast.show(err.message || 'Login failed', 'error', 4000);
    }
  });
})();
