(() => {
  const cfg = window.ATLETIC_CONFIG || {};
  const ACCESS_KEY = 'atletic.supabase.access_token';
  const REFRESH_KEY = 'atletic.supabase.refresh_token';
  const USER_KEY = 'atletic.supabase.user';

  document.documentElement.classList.add('auth-pending');

  const apiHeaders = token => ({
    apikey: cfg.supabasePublishableKey || '',
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  });

  const saveSession = payload => {
    if (!payload?.access_token) return;
    localStorage.setItem(ACCESS_KEY, payload.access_token);
    if (payload.refresh_token) localStorage.setItem(REFRESH_KEY, payload.refresh_token);
    if (payload.user) localStorage.setItem(USER_KEY, JSON.stringify(payload.user));
  };

  const clearSession = () => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
  };

  async function refreshSession() {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken || !cfg.supabaseUrl || !cfg.supabasePublishableKey) return null;
    const response = await fetch(`${cfg.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    if (!response.ok) { clearSession(); return null; }
    const payload = await response.json();
    saveSession(payload);
    return payload.access_token;
  }

  async function currentUser() {
    let token = localStorage.getItem(ACCESS_KEY);
    if (!token) return null;
    let response = await fetch(`${cfg.supabaseUrl}/auth/v1/user`, { headers: apiHeaders(token) });
    if (response.status === 401) {
      token = await refreshSession();
      if (!token) return null;
      response = await fetch(`${cfg.supabaseUrl}/auth/v1/user`, { headers: apiHeaders(token) });
    }
    if (!response.ok) return null;
    return response.json();
  }

  async function adminProfile(user) {
    const token = localStorage.getItem(ACCESS_KEY);
    if (!token || !user?.id) return null;
    const response = await fetch(
      `${cfg.supabaseUrl}/rest/v1/admin_users?id=eq.${encodeURIComponent(user.id)}&active=eq.true&select=id,name,role`,
      { headers: apiHeaders(token) }
    );
    if (!response.ok) return null;
    const rows = await response.json();
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }

  function ensureGate() {
    let gate = document.getElementById('adminAuthGate');
    if (gate) return gate;
    gate = document.createElement('div');
    gate.id = 'adminAuthGate';
    document.body.prepend(gate);
    return gate;
  }

  function showGate(message = '') {
    document.documentElement.classList.remove('auth-pending');
    document.documentElement.classList.add('auth-locked');
    const gate = ensureGate();
    gate.innerHTML = `
      <div class="auth-card">
        <a class="auth-logo" href="/"><img src="assets/logo.svg" alt="Atletic Suplementos"></a>
        <p class="eyebrow">CENTRAL DE GESTÃO</p>
        <h1>Acesso administrativo</h1>
        <p class="muted">Entre com a conta autorizada no Supabase.</p>
        <form id="adminLoginForm">
          <label>E-mail<input name="email" type="email" autocomplete="email" required></label>
          <label>Senha<input name="password" type="password" autocomplete="current-password" minlength="8" required></label>
          <p id="authMessage" role="status">${message}</p>
          <button class="button" type="submit">Entrar</button>
          <button class="button secondary" type="button" id="createAdminAccount">Criar primeira conta</button>
        </form>
        <small class="auth-help">A conta só recebe acesso ao painel depois de ser autorizada como administrador.</small>
      </div>`;

    const form = gate.querySelector('#adminLoginForm');
    const status = gate.querySelector('#authMessage');

    form.onsubmit = async event => {
      event.preventDefault();
      status.textContent = 'Entrando…';
      const fd = new FormData(form);
      const email = String(fd.get('email') || '').trim();
      const password = String(fd.get('password') || '');
      try {
        const response = await fetch(`${cfg.supabaseUrl}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: apiHeaders(),
          body: JSON.stringify({ email, password })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error_description || payload.msg || 'Não foi possível entrar.');
        saveSession(payload);
        const profile = await adminProfile(payload.user);
        if (!profile || profile.role !== 'admin') {
          clearSession();
          throw new Error('Conta criada, mas ainda não autorizada como administradora.');
        }
        location.reload();
      } catch (error) {
        status.textContent = error.message;
      }
    };

    gate.querySelector('#createAdminAccount').onclick = async () => {
      const fd = new FormData(form);
      const email = String(fd.get('email') || '').trim();
      const password = String(fd.get('password') || '');
      if (!email || password.length < 8) {
        status.textContent = 'Informe e-mail e uma senha com pelo menos 8 caracteres.';
        return;
      }
      status.textContent = 'Criando conta…';
      try {
        const response = await fetch(`${cfg.supabaseUrl}/auth/v1/signup`, {
          method: 'POST',
          headers: apiHeaders(),
          body: JSON.stringify({ email, password })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.msg || payload.error_description || 'Não foi possível criar a conta.');
        if (payload.access_token) saveSession(payload);
        status.textContent = payload.access_token
          ? 'Conta criada. Agora ela precisa ser autorizada como administradora.'
          : 'Conta criada. Confirme o e-mail recebido e depois faça login.';
      } catch (error) {
        status.textContent = error.message;
      }
    };
  }

  async function signOut() {
    const token = localStorage.getItem(ACCESS_KEY);
    if (token) {
      try {
        await fetch(`${cfg.supabaseUrl}/auth/v1/logout`, { method: 'POST', headers: apiHeaders(token) });
      } catch {}
    }
    clearSession();
    location.reload();
  }

  function addLogout(profile) {
    const header = document.querySelector('.admin-main header');
    if (!header || document.getElementById('adminLogout')) return;
    const box = document.createElement('div');
    box.className = 'admin-account';
    box.innerHTML = `<span>${profile?.name || 'Administrador'}</span><button id="adminLogout" type="button">Sair</button>`;
    header.appendChild(box);
    box.querySelector('#adminLogout').onclick = signOut;
  }

  async function guard(onReady) {
    if (!cfg.supabaseUrl || !cfg.supabasePublishableKey) {
      showGate('Conexão com o Supabase ainda não configurada.');
      return;
    }
    try {
      const user = await currentUser();
      if (!user) { showGate(); return; }
      const profile = await adminProfile(user);
      if (!profile || profile.role !== 'admin') {
        clearSession();
        showGate('Esta conta ainda não está autorizada como administradora.');
        return;
      }
      document.getElementById('adminAuthGate')?.remove();
      document.documentElement.classList.remove('auth-pending','auth-locked');
      addLogout(profile);
      onReady();
    } catch {
      showGate('Não foi possível validar a sessão administrativa.');
    }
  }

  window.AtleticAdminAuth = { guard, signOut, currentUser };
})();