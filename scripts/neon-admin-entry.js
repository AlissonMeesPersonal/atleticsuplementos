import { createAuthClient } from '@neondatabase/auth';

// This page is exclusively for verification on migration/supabase-to-neon.
const baseUrl = __ATLETIC_NEON_AUTH_BASE_URL__;
const form = document.getElementById('neonAdminLogin');
const status = document.getElementById('neonStatus');
const signout = document.getElementById('neonLogout');
const button = form.querySelector('button[type=submit]');
const auth = createAuthClient(baseUrl);

function notice(message, positive = false) {
  status.textContent = message;
  status.dataset.status = positive ? 'success' : 'info';
}
async function checkRole() {
  const { data, error } = await auth.getSession();
  if (error || !data?.session || !data?.user) {
    notice('Nenhuma sessão Neon ativa. Faça login ou ative sua conta.');
    return;
  }
  const token = data.session.access_token || await auth.getJWTToken?.();
  if (typeof token !== 'string' || !token) {
    notice('A sessão existe, mas ainda não foi possível obter um token de autorização.');
    return;
  }
  const response = await fetch('/api/neon-admin-verify', {
    method: 'GET',
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json().catch(() => ({}));
  if (response.ok && result.authorized) {
    notice('Autenticação Neon validada e papel administrativo autorizado. Os módulos ainda não estão migrados.', true);
    signout.hidden = false;
  } else {
    notice('A sessão não possui acesso administrativo liberado. Ative/verifique seu e-mail e valide o mapeamento antes de prosseguir.');
  }
}
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  button.disabled = true;
  notice('Verificando credenciais Neon...');
  const email = String(new FormData(form).get('email') || '').trim();
  const password = String(new FormData(form).get('password') || '');
  try {
    const { error } = await auth.signIn.email({ email, password });
    if (error) {
      notice('Não foi possível autenticar. A conta precisa estar ativada e com uma nova senha Neon.');
      return;
    }
    await checkRole();
  } catch {
    notice('Falha de comunicação na autenticação. Confirme o domínio confiável no Neon Auth.');
  } finally {
    button.disabled = false;
    form.querySelector('input[name=password]').value = '';
  }
});
signout.addEventListener('click', async () => {
  try { await auth.signOut(); } catch { /* never claim logout succeeded on API failure */ }
  signout.hidden = true;
  await checkRole();
});
checkRole().catch(() => notice('Não foi possível consultar a sessão Neon.'));
