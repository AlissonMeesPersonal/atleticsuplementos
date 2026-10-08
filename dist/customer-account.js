(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  const cfg = window.ATLETIC_CONFIG || {};
  const ACCESS_KEY = 'atletic.customer.access_token';
  const REFRESH_KEY = 'atletic.customer.refresh_token';
  const USER_KEY = 'atletic.customer.user';

  let user = null;
  let profile = null;
  let addresses = [];
  let orders = [];
  let activeTab = 'profile';

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const money = value => Number(value || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const apiHeaders = token => ({
    apikey: cfg.supabasePublishableKey || '',
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  });

  function saveSession(payload) {
    if (!payload?.access_token) return;
    localStorage.setItem(ACCESS_KEY,payload.access_token);
    if (payload.refresh_token) localStorage.setItem(REFRESH_KEY,payload.refresh_token);
    if (payload.user) localStorage.setItem(USER_KEY,JSON.stringify(payload.user));
  }

  function clearSession() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    user = null;
    profile = null;
    addresses = [];
    orders = [];
  }

  async function refreshSession() {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken || !cfg.supabaseUrl || !cfg.supabasePublishableKey) return null;
    try {
      const response = await fetch(`${cfg.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,{
        method:'POST',
        headers:apiHeaders(),
        body:JSON.stringify({refresh_token:refreshToken})
      });
      if (!response.ok) { clearSession(); return null; }
      const payload = await response.json();
      saveSession(payload);
      return payload.access_token;
    } catch {
      return null;
    }
  }

  async function currentUser() {
    let token = localStorage.getItem(ACCESS_KEY);
    if (!token) return null;
    let response;
    try {
      response = await fetch(`${cfg.supabaseUrl}/auth/v1/user`,{headers:apiHeaders(token)});
    } catch {
      return null;
    }
    if (response.status === 401) {
      token = await refreshSession();
      if (!token) return null;
      response = await fetch(`${cfg.supabaseUrl}/auth/v1/user`,{headers:apiHeaders(token)});
    }
    if (!response.ok) return null;
    user = await response.json();
    localStorage.setItem(USER_KEY,JSON.stringify(user));
    return user;
  }

  async function fetchProfile() {
    const token = localStorage.getItem(ACCESS_KEY);
    if (!token || !user?.id) return null;
    const response = await fetch(
      `${cfg.supabaseUrl}/rest/v1/customers?auth_user_id=eq.${encodeURIComponent(user.id)}&select=*&limit=1`,
      {headers:apiHeaders(token)}
    );
    if (!response.ok) return null;
    const rows = await response.json();
    profile = Array.isArray(rows) && rows.length ? rows[0] : null;
    return profile;
  }

  async function ensureProfile(seed={}) {
    await fetchProfile();
    if (profile) return profile;
    const token = localStorage.getItem(ACCESS_KEY);
    if (!token || !user?.id) return null;
    const fallbackName = user.user_metadata?.full_name || seed.full_name || user.email?.split('@')[0] || 'Cliente Atletic';
    const body = {
      auth_user_id:user.id,
      full_name:fallbackName,
      email:user.email || seed.email || null,
      phone:seed.phone || null,
      cpf:seed.cpf || null,
      active:true
    };
    const response = await fetch(`${cfg.supabaseUrl}/rest/v1/customers`,{
      method:'POST',
      headers:{...apiHeaders(token),Prefer:'return=representation'},
      body:JSON.stringify(body)
    });
    if (!response.ok) return null;
    const rows = await response.json();
    profile = rows?.[0] || body;
    return profile;
  }

  async function fetchAddresses() {
    const token = localStorage.getItem(ACCESS_KEY);
    if (!token || !profile?.id) return [];
    const response = await fetch(
      `${cfg.supabaseUrl}/rest/v1/customer_addresses?customer_id=eq.${encodeURIComponent(profile.id)}&select=*&order=is_default.desc,created_at.desc`,
      {headers:apiHeaders(token)}
    );
    if (!response.ok) return [];
    addresses = await response.json();
    return addresses;
  }

  async function fetchOrders() {
    const token = localStorage.getItem(ACCESS_KEY);
    if (!token || !user?.id) return [];
    const response = await fetch(
      `${cfg.supabaseUrl}/rest/v1/orders?auth_user_id=eq.${encodeURIComponent(user.id)}&select=id,order_number,status,payment_status,total,created_at,placed_at,tracking_code,tracking_url&order=created_at.desc&limit=50`,
      {headers:apiHeaders(token)}
    );
    if (!response.ok) return [];
    orders = await response.json();
    return orders;
  }

  function iconUser() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 20c.9-4 3.3-6 7.5-6s6.6 2 7.5 6"/></svg>';
  }

  function injectControls() {
    const actions = $('.site-header .actions');
    if (actions && !$('#accountMenuWrap')) {
      actions.insertAdjacentHTML('afterbegin',`
        <div id="accountMenuWrap" class="account-menu-wrap">
          <button id="accountOpen" class="account-trigger" type="button" aria-haspopup="true" aria-expanded="false">
            <span class="account-icon">${iconUser()}</span>
            <span class="account-trigger-copy"><small>Minha</small><strong id="accountTriggerName">Conta</strong></span>
          </button>
          <div id="accountDropdown" class="account-dropdown" hidden>
            <button type="button" data-account-action="profile">${iconUser()}<span>Minha Conta</span></button>
            <button type="button" data-account-action="orders"><span class="account-glyph">▤</span><span>Meus Pedidos</span></button>
            <button type="button" data-account-action="addresses"><span class="account-glyph">⌂</span><span>Endereços</span></button>
            <button type="button" data-account-action="favorites"><span class="account-glyph">♥</span><span>Favoritos</span></button>
            <button type="button" data-account-action="logout" id="accountLogoutItem"><span class="account-glyph">↪</span><span>Sair</span></button>
          </div>
        </div>
      `);
    }

    const mobileNav = $('.mobile-bottom-nav');
    if (mobileNav && !$('#mobileAccount')) {
      mobileNav.insertAdjacentHTML('beforeend',`
        <button id="mobileAccount" type="button" aria-label="Minha conta">
          <span class="mobile-account-icon">${iconUser()}</span>
          <small>Conta</small>
        </button>
      `);
    }
  }

  function ensureDialog() {
    if ($('#accountDialog')) return;
    document.body.insertAdjacentHTML('beforeend',`
      <dialog id="accountDialog" class="account-dialog" aria-labelledby="accountTitle">
        <div class="account-shell">
          <header class="account-head">
            <div><p class="eyebrow">ATLETIC / CONTA</p><h2 id="accountTitle">Minha Conta</h2></div>
            <button id="accountClose" type="button" aria-label="Fechar">×</button>
          </header>
          <div id="accountContent"></div>
        </div>
      </dialog>
    `);
    $('#accountClose').onclick = closeAccount;
    $('#accountDialog').addEventListener('click',event=>{ if(event.target === $('#accountDialog')) closeAccount(); });
  }

  function status(text,type='') {
    const el = $('#accountStatus');
    if (!el) return;
    el.textContent = text || '';
    el.className = `account-status ${type}`;
  }

  function authView(mode='login') {
    const login = mode === 'login';
    $('#accountContent').innerHTML = `
      <div class="account-auth">
        <div class="account-auth-copy">
          <p class="eyebrow">SUA ROTINA COM VOCÊ</p>
          <h3>${login?'Entre na sua conta':'Crie sua conta Atletic'}</h3>
          <p>${login?'Acesse seus dados, endereços e acompanhe seus pedidos.':'Salve seus dados uma vez e deixe suas próximas compras mais rápidas.'}</p>
        </div>
        <div class="account-auth-card">
          <div class="account-auth-tabs">
            <button type="button" data-auth-mode="login" class="${login?'active':''}">Entrar</button>
            <button type="button" data-auth-mode="register" class="${!login?'active':''}">Criar conta</button>
          </div>
          <form id="customerAuthForm">
            ${login?'':`
              <label>Nome completo<input name="name" autocomplete="name" required></label>
              <label>WhatsApp<input name="phone" inputmode="tel" autocomplete="tel" placeholder="(51) 99999-9999"></label>
            `}
            <label>E-mail<input name="email" type="email" autocomplete="email" required></label>
            <label>Senha<input name="password" type="password" autocomplete="${login?'current-password':'new-password'}" minlength="8" required></label>
            ${login?'':`<label>Confirmar senha<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required></label>`}
            <p id="accountStatus" class="account-status" role="status"></p>
            <button class="button account-primary" type="submit">${login?'Entrar':'Criar minha conta'} <span>↗</span></button>
          </form>
        </div>
      </div>
    `;

    document.querySelectorAll('[data-auth-mode]').forEach(button=>{
      button.onclick=()=>authView(button.dataset.authMode);
    });

    $('#customerAuthForm').onsubmit = async event => {
      event.preventDefault();
      const fd = new FormData(event.currentTarget);
      const email = String(fd.get('email')||'').trim();
      const password = String(fd.get('password')||'');
      const name = String(fd.get('name')||'').trim();
      const phone = String(fd.get('phone')||'').trim();
      const confirmPassword = String(fd.get('confirmPassword')||'');

      if (!login && password !== confirmPassword) return status('As senhas não coincidem.','error');
      status(login?'Entrando…':'Criando sua conta…');

      try {
        const endpoint = login ? 'token?grant_type=password' : 'signup';
        const body = login
          ? {email,password}
          : {email,password,data:{full_name:name,phone}};
        const response = await fetch(`${cfg.supabaseUrl}/auth/v1/${endpoint}`,{
          method:'POST',
          headers:apiHeaders(),
          body:JSON.stringify(body)
        });
        const payload = await response.json().catch(()=>({}));
        if (!response.ok) throw new Error(payload.error_description || payload.msg || payload.message || 'Não foi possível continuar.');

        if (!payload.access_token) {
          return status('Conta criada. Confirme o e-mail enviado para você e depois entre na sua conta.','success');
        }

        saveSession(payload);
        user = payload.user;
        await ensureProfile({full_name:name,email,phone});
        await loadAccountData();
        updateTrigger();
        renderDashboard(login?'profile':'profile');
      } catch(error) {
        status(error.message || 'Não foi possível continuar.','error');
      }
    };
  }

  function updateTrigger() {
    const name = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Conta';
    const first = String(name).trim().split(/\s+/)[0] || 'Conta';
    const trigger = $('#accountTriggerName');
    if (trigger) trigger.textContent = user ? first : 'Conta';
    const logout = $('#accountLogoutItem');
    if (logout) logout.hidden = !user;
  }

  async function loadAccountData() {
    if (!user) return;
    await ensureProfile();
    await Promise.all([fetchAddresses(),fetchOrders()]);
  }

  function profileForm() {
    return `
      <form id="accountProfileForm" class="account-form">
        <div class="account-form-grid">
          <label class="full">Nome completo<input name="full_name" value="${esc(profile?.full_name||'')}" required></label>
          <label>E-mail<input value="${esc(profile?.email||user?.email||'')}" disabled></label>
          <label>WhatsApp<input name="phone" value="${esc(profile?.phone||'')}" inputmode="tel"></label>
          <label>CPF<input name="cpf" value="${esc(profile?.cpf||'')}" inputmode="numeric"></label>
          <label>Data de nascimento<input name="birth_date" type="date" value="${esc(profile?.birth_date||'')}"></label>
          <label class="account-check"><input name="accepts_marketing" type="checkbox" ${profile?.accepts_marketing?'checked':''}> Quero receber novidades e ofertas</label>
        </div>
        <p id="accountStatus" class="account-status" role="status"></p>
        <button class="button account-primary" type="submit">Salvar alterações</button>
      </form>
    `;
  }

  function ordersView() {
    if (!orders.length) return '<div class="account-empty"><span>▤</span><h4>Nenhum pedido ainda</h4><p>Quando você finalizar uma compra, ela aparecerá aqui para acompanhamento.</p><a href="#catalog" class="button" data-account-close>Explorar produtos</a></div>';
    return `<div class="account-orders">${orders.map(order=>`
      <article class="account-order">
        <div><small>Pedido</small><strong>${esc(order.order_number||order.id)}</strong></div>
        <div><small>Status</small><strong>${esc(order.status||'pending')}</strong></div>
        <div><small>Pagamento</small><strong>${esc(order.payment_status||'pending')}</strong></div>
        <div><small>Total</small><strong>${money(order.total)}</strong></div>
        ${order.tracking_url?`<a href="${esc(order.tracking_url)}" target="_blank" rel="noopener">Rastrear ↗</a>`:''}
      </article>`).join('')}</div>`;
  }

  function addressesView() {
    return `
      <div class="account-address-layout">
        <div class="account-address-list">
          ${addresses.length ? addresses.map(a=>`
            <article class="account-address-card">
              <div>
                <span>${esc(a.label||'Endereço')}</span>
                ${a.is_default?'<b>Principal</b>':''}
              </div>
              <strong>${esc(a.recipient_name)}</strong>
              <p>${esc(a.street)}, ${esc(a.number||'s/n')}${a.complement?', '+esc(a.complement):''}<br>${esc(a.neighborhood||'')} · ${esc(a.city)}/${esc(a.state)} · ${esc(a.postal_code)}</p>
              <button type="button" data-delete-address="${esc(a.id)}">Remover</button>
            </article>
          `).join('') : '<div class="account-empty compact"><p>Você ainda não possui endereços salvos.</p></div>'}
        </div>
        <form id="accountAddressForm" class="account-form address-form">
          <h4>Novo endereço</h4>
          <div class="account-form-grid">
            <label>Identificação<input name="label" placeholder="Casa, Trabalho..."></label>
            <label>CEP<input name="postal_code" inputmode="numeric" required></label>
            <label class="full">Rua / Avenida<input name="street" required></label>
            <label>Número<input name="number"></label>
            <label>Complemento<input name="complement"></label>
            <label>Bairro<input name="neighborhood"></label>
            <label>Cidade<input name="city" required></label>
            <label>Estado<input name="state" maxlength="2" required></label>
            <label class="account-check full"><input name="is_default" type="checkbox"> Definir como endereço principal</label>
          </div>
          <p id="accountStatus" class="account-status" role="status"></p>
          <button class="button account-primary" type="submit">Salvar endereço</button>
        </form>
      </div>
    `;
  }

  function favoritesView() {
    return '<div class="account-empty"><span>♥</span><h4>Seus favoritos</h4><p>O botão de favoritar produtos será conectado ao catálogo na próxima melhoria desta área.</p><a href="#catalog" class="button" data-account-close>Ver produtos</a></div>';
  }

  function renderDashboard(tab=activeTab) {
    activeTab = tab;
    const title = tab==='orders'?'Meus Pedidos':tab==='addresses'?'Meus Endereços':tab==='favorites'?'Favoritos':'Minha Conta';
    let content = profileForm();
    if (tab==='orders') content=ordersView();
    if (tab==='addresses') content=addressesView();
    if (tab==='favorites') content=favoritesView();

    $('#accountContent').innerHTML = `
      <div class="account-dashboard">
        <aside class="account-sidebar">
          <div class="account-welcome">
            <span class="account-avatar">${iconUser()}</span>
            <div><small>Olá,</small><strong>${esc(profile?.full_name?.split(/\s+/)[0]||'Cliente')}</strong></div>
          </div>
          <nav>
            <button class="${tab==='profile'?'active':''}" data-account-tab="profile">Minha Conta</button>
            <button class="${tab==='orders'?'active':''}" data-account-tab="orders">Meus Pedidos</button>
            <button class="${tab==='addresses'?'active':''}" data-account-tab="addresses">Endereços</button>
            <button class="${tab==='favorites'?'active':''}" data-account-tab="favorites">Favoritos</button>
          </nav>
          <button id="accountSidebarLogout" class="account-signout" type="button">Sair da conta</button>
        </aside>
        <section class="account-panel">
          <div class="account-panel-head"><p class="eyebrow">ÁREA DO CLIENTE</p><h3>${title}</h3></div>
          ${content}
        </section>
      </div>
    `;

    document.querySelectorAll('[data-account-tab]').forEach(button=>button.onclick=()=>renderDashboard(button.dataset.accountTab));
    document.querySelectorAll('[data-account-close]').forEach(link=>link.onclick=()=>closeAccount());
    $('#accountSidebarLogout').onclick=logout;

    const profileFormEl = $('#accountProfileForm');
    if (profileFormEl) profileFormEl.onsubmit = saveProfile;

    const addressForm = $('#accountAddressForm');
    if (addressForm) addressForm.onsubmit = saveAddress;

    document.querySelectorAll('[data-delete-address]').forEach(button=>{
      button.onclick=()=>deleteAddress(button.dataset.deleteAddress);
    });
  }

  async function saveProfile(event) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const body = {
      full_name:String(fd.get('full_name')||'').trim(),
      phone:String(fd.get('phone')||'').trim()||null,
      cpf:String(fd.get('cpf')||'').trim()||null,
      birth_date:String(fd.get('birth_date')||'')||null,
      accepts_marketing:fd.has('accepts_marketing'),
      updated_at:new Date().toISOString()
    };
    if (!body.full_name) return status('Informe seu nome.','error');
    status('Salvando…');
    const token = localStorage.getItem(ACCESS_KEY);
    const response = await fetch(`${cfg.supabaseUrl}/rest/v1/customers?id=eq.${encodeURIComponent(profile.id)}`,{
      method:'PATCH',
      headers:{...apiHeaders(token),Prefer:'return=representation'},
      body:JSON.stringify(body)
    });
    if (!response.ok) return status('Não foi possível salvar seus dados.','error');
    const rows = await response.json();
    profile = rows?.[0] || {...profile,...body};
    updateTrigger();
    status('Dados atualizados.','success');
  }

  async function saveAddress(event) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const body = {
      customer_id:profile.id,
      label:String(fd.get('label')||'Casa').trim()||'Casa',
      recipient_name:profile.full_name,
      phone:profile.phone||null,
      postal_code:String(fd.get('postal_code')||'').trim(),
      street:String(fd.get('street')||'').trim(),
      number:String(fd.get('number')||'').trim()||null,
      complement:String(fd.get('complement')||'').trim()||null,
      neighborhood:String(fd.get('neighborhood')||'').trim()||null,
      city:String(fd.get('city')||'').trim(),
      state:String(fd.get('state')||'').trim().toUpperCase(),
      country:'BR',
      is_default:fd.has('is_default')
    };
    if (!body.postal_code || !body.street || !body.city || body.state.length!==2) return status('Preencha CEP, rua, cidade e estado.','error');
    status('Salvando endereço…');
    const token = localStorage.getItem(ACCESS_KEY);
    if (body.is_default && addresses.length) {
      await fetch(`${cfg.supabaseUrl}/rest/v1/customer_addresses?customer_id=eq.${encodeURIComponent(profile.id)}`,{
        method:'PATCH',
        headers:apiHeaders(token),
        body:JSON.stringify({is_default:false,updated_at:new Date().toISOString()})
      });
    }
    const response = await fetch(`${cfg.supabaseUrl}/rest/v1/customer_addresses`,{
      method:'POST',
      headers:{...apiHeaders(token),Prefer:'return=representation'},
      body:JSON.stringify(body)
    });
    if (!response.ok) return status('Não foi possível salvar o endereço.','error');
    await fetchAddresses();
    renderDashboard('addresses');
  }

  async function deleteAddress(id) {
    const token = localStorage.getItem(ACCESS_KEY);
    const response = await fetch(`${cfg.supabaseUrl}/rest/v1/customer_addresses?id=eq.${encodeURIComponent(id)}`,{
      method:'DELETE',
      headers:apiHeaders(token)
    });
    if (!response.ok) return;
    await fetchAddresses();
    renderDashboard('addresses');
  }

  async function logout() {
    const token = localStorage.getItem(ACCESS_KEY);
    try {
      if (token) await fetch(`${cfg.supabaseUrl}/auth/v1/logout`,{method:'POST',headers:apiHeaders(token)});
    } catch {}
    clearSession();
    updateTrigger();
    authView('login');
    const dropdown=$('#accountDropdown'); if(dropdown) dropdown.hidden=true;
  }

  async function openAccount(tab='profile') {
    ensureDialog();
    const dialog = $('#accountDialog');
    if (!dialog.open) dialog.showModal();
    document.body.style.overflow='hidden';

    if (!user) {
      await currentUser();
      if (user) await loadAccountData();
    }
    if (user) renderDashboard(tab);
    else authView('login');
  }

  function closeAccount() {
    const dialog = $('#accountDialog');
    if (dialog?.open) dialog.close();
    document.body.style.overflow='';
  }

  function bindControls() {
    const trigger = $('#accountOpen');
    const dropdown = $('#accountDropdown');
    if (trigger && dropdown) {
      trigger.onclick = event => {
        event.stopPropagation();
        dropdown.hidden=!dropdown.hidden;
        trigger.setAttribute('aria-expanded',String(!dropdown.hidden));
      };
    }

    document.addEventListener('click',event=>{
      if (!event.target.closest('#accountMenuWrap') && dropdown) {
        dropdown.hidden=true;
        trigger?.setAttribute('aria-expanded','false');
      }
      const action = event.target.closest('[data-account-action]');
      if (!action) return;
      const type=action.dataset.accountAction;
      dropdown.hidden=true;
      if (type==='logout') return logout();
      if (type==='favorites') return openAccount('favorites');
      if (type==='orders') return openAccount('orders');
      if (type==='addresses') return openAccount('addresses');
      openAccount('profile');
    });

    $('#mobileAccount')?.addEventListener('click',()=>openAccount('profile'));
  }

  async function init() {
    injectControls();
    ensureDialog();
    bindControls();
    await currentUser();
    if (user) await loadAccountData();
    updateTrigger();
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();