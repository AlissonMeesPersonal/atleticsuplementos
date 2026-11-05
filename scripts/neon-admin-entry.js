import { createAuthClient } from '@neondatabase/auth';

// Homologação: Auth Neon sem acesso automático aos módulos de produção.
const baseUrl = __ATLETIC_NEON_AUTH_BASE_URL__;
const form = document.getElementById('neonAdminLogin');
const resetForm = document.getElementById('neonResetForm');
const status = document.getElementById('neonStatus');
const signout = document.getElementById('neonLogout');
const recovery = document.getElementById('neonRecovery');
const verification = document.getElementById('neonVerifyEmail');
const button = form.querySelector('button[type=submit]');
const auth = createAuthClient(baseUrl);

function notice(message, positive = false) {
  status.textContent = message;
  status.dataset.status = positive ? 'success' : 'info';
}
function classify(err) {
  const name = String(err?.name || '').slice(0,60);
  const code = String(err?.code || '').slice(0,60);
  const message = String(err?.message || '');
  // Não exibir payload, senha, e-mail, token ou detalhes sensíveis no navegador.
  console.warn('Atletic Neon Auth (diagnóstico sem credenciais)', {name,code,
    network: /fetch|network|cors|load failed/i.test(message)});
  if (/fetch|network|cors|load failed/i.test(message)) {
    return 'Falha de rede ao acessar o Neon Auth. Confira conexão, CORS e a aba Rede (Network).';
  }
  if (name==='TypeError') {
    return 'Erro do cliente de autenticação. Atualize a página e verifique o console do navegador.';
  }
  return code ? 'Falha Neon Auth ('+code+'). Consulte o console do navegador.' :
    'Não foi possível autenticar no Neon. Use a recuperação de senha ou consulte o console.';
}
function currentEmail() {
  return String(form.elements.namedItem('email')?.value || '').trim();
}
async function checkRole() {
  const { data, error } = await auth.getSession();
  if (error) {
    notice('Neon Auth respondeu com falha ao verificar a sessão. ' + classify(error));
    return;
  }
  if (!data?.session || !data?.user) {
    notice('Nenhuma sessão Neon ativa. Se sua conta foi migrada, defina uma nova senha pelo botão abaixo.');
    return;
  }
  const token = data.session.access_token || await auth.getJWTToken?.();
  if (typeof token !== 'string' || !token) {
    notice('Sessão encontrada, mas o token JWT não foi disponibilizado para a checagem administrativa.');
    return;
  }
  const response = await fetch('/api/admin-dashboard?neonAuthCheck=1', {
    method: 'GET', cache: 'no-store',
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json().catch(() => ({}));
  if (response.ok && result.authorized) {
    notice('Sessão Neon e perfil administrativo validados. O painel de produção ainda não foi migrado.',true);
    signout.hidden = false;
  } else if (response.status === 403) {
    notice('Login válido, mas acesso administrativo ainda não liberado. Verifique o e-mail e o vínculo de sua conta.');
  } else if (response.status === 401) {
    notice('O token da sessão Neon não foi aceito pelo verificador. Consulte o diagnóstico da API.');
  } else {
    notice('A verificação administrativa não respondeu corretamente (HTTP '+response.status+').');
  }
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  button.disabled = true;
  notice('Verificando credenciais no Neon...');
  const email = currentEmail();
  const password = String(new FormData(form).get('password') || '');
  try {
    const { error } = await auth.signIn.email({email,password});
    if (error) {
      const code = String(error.code || '').toUpperCase();
      notice(code === 'INVALID_EMAIL_OR_PASSWORD' || code === 'INVALID_PASSWORD'
        ? 'Credenciais não aceitas. As contas migradas ainda precisam definir uma nova senha Neon.'
        : 'Não foi possível entrar. ' + classify(error));
      return;
    }
    await checkRole();
  } catch(err) {
    notice(classify(err));
  } finally {
    button.disabled = false;
    form.elements.namedItem('password').value = '';
  }
});

recovery.addEventListener('click', async () => {
  const email = currentEmail();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    notice('Preencha seu e-mail para solicitar a recuperação de senha Neon.');
    return;
  }
  recovery.disabled = true;
  notice('Solicitando um link de recuperação ao Neon Auth...');
  try {
    const result = await auth.requestPasswordReset({
      email, redirectTo: location.origin + '/neon-admin-test'
    });
    if (result?.error) {
      notice('Não foi possível solicitar a recuperação. ' + classify(result.error));
    } else {
      notice('Se o e-mail estiver registrado, você receberá um link para definir sua senha Neon. Verifique sua caixa de entrada e spam.',true);
    }
  } catch (err) {
    notice(classify(err));
  } finally {
    recovery.disabled = false;
  }
});

verification.addEventListener('click', async () => {
  const email = currentEmail();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    notice('Preencha seu e-mail para solicitar a verificação.');
    return;
  }
  verification.disabled = true;
  try {
    const result = await auth.sendVerificationEmail({
      email, callbackURL: location.origin + '/neon-admin-test'
    });
    if (result?.error) {
      notice('Não foi possível solicitar a confirmação do e-mail. ' + classify(result.error));
    } else {
      notice('Se a conta estiver registrada, será enviado um e-mail de verificação. Confira também a pasta spam.',true);
    }
  } catch(err) {
    notice(classify(err));
  } finally {
    verification.disabled = false;
  }
});

const resetUrl = new URL(location.href);
const resetToken = resetUrl.searchParams.get('token');
const resetError = resetUrl.searchParams.get('error');
if (resetToken || resetError) {
  // Remove o token do histórico/endereço antes de iniciar qualquer requisição.
  history.replaceState(null, '', location.pathname);
  form.hidden = true;
  recovery.hidden = true;
  verification.hidden = true;
  resetForm.hidden = !resetToken;
  if (resetError || !resetToken) {
    notice('O link de recuperação é inválido ou expirou. Solicite outro link.');
    form.hidden = false;
    recovery.hidden = false;
  } else {
    notice('Link recebido. Defina uma nova senha com pelo menos 12 caracteres.');
  }
}
resetForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!resetToken) return;
  const password = String(resetForm.elements.namedItem('newPassword').value || '');
  const confirmation = String(resetForm.elements.namedItem('confirmPassword').value || '');
  if (password.length < 12 || password !== confirmation) {
    notice('Use uma senha de pelo menos 12 caracteres e confirme o mesmo valor.');
    return;
  }
  const submit = resetForm.querySelector('button[type=submit]');
  submit.disabled = true;
  try {
    const result = await auth.resetPassword({ newPassword: password, token: resetToken });
    if (result?.error) {
      notice('Não foi possível redefinir sua senha. ' + classify(result.error));
      return;
    }
    resetForm.hidden = true;
    form.hidden = false;
    recovery.hidden = false;
    verification.hidden = false;
    notice('Senha Neon definida. Agora verifique seu e-mail e faça login com a nova senha.',true);
  } catch(err) {
    notice(classify(err));
  } finally {
    resetForm.elements.namedItem('newPassword').value = '';
    resetForm.elements.namedItem('confirmPassword').value = '';
    submit.disabled = false;
  }
});
signout.addEventListener('click', async () => {
  try {
    const {error} = await auth.signOut();
    if (error) { notice('Não foi possível encerrar a sessão: '+classify(error)); return; }
    signout.hidden = true;
    await checkRole();
  } catch(err) { notice(classify(err)); }
});
if (!resetToken && !resetError) checkRole().catch(err => notice(classify(err)));
