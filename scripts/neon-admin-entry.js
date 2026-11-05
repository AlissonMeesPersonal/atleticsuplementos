import { createAuthClient } from '@neondatabase/auth';

// Homologação: Auth Neon sem acesso automático aos módulos de produção.
const baseUrl = __ATLETIC_NEON_AUTH_BASE_URL__;
const form = document.getElementById('neonAdminLogin');
const resetForm = document.getElementById('neonResetForm');
const status = document.getElementById('neonStatus');
const signout = document.getElementById('neonLogout');
const recovery = document.getElementById('neonRecovery');
const verification = document.getElementById('neonVerifyEmail');
const otpForm = document.getElementById('neonOtpForm');
const button = form.querySelector('button[type=submit]');
let auth = null;
try {
  auth = createAuthClient(baseUrl, { fetchOptions: { credentials: 'include' } });
} catch {
  // A tela continua interativa mesmo se o SDK não conseguir inicializar.
  auth = null;
}

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
async function checkRole({ quiet = false } = {}) {
  // O Auth funciona em domínio diferente do Preview Vercel. Cookies exigem
  // credentials:'include'; token() é a API oficial para JWT Bearer externo.
  let token = '';
  try {
    if (typeof auth.token === 'function') {
      const jwt = await auth.token();
      if (!jwt?.error) token = String(jwt?.data?.token || '');
    }
  } catch { /* O fallback consulta a sessão sem registrar dados pessoais. */ }
  if (!token) {
    try {
      const session = await auth.getSession();
      if (session?.error) {
        if (!quiet) notice('Não foi possível recuperar a sessão Neon (' + String(session.error.code || 'session_error').toLowerCase() + '). Confirme os cookies de terceiros.');
        return false;
      }
      token = String(session?.data?.session?.access_token || '');
    } catch {
      if (!quiet) notice('O navegador não conseguiu consultar a sessão Neon. Verifique se o bloqueio de cookies de terceiros está ativo.');
      return false;
    }
  }
  if (!token) {
    if (!quiet) notice('Nenhuma sessão Neon visível neste navegador. Faça login; se já entrou, verifique a permissão de cookies entre a Vercel e o Neon Auth.');
    return false;
  }
  try {
    const response = await fetch('/api/admin-dashboard?neonAuthCheck=1', {
      method: 'GET', cache: 'no-store', credentials: 'same-origin',
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.authorized) {
      notice('Sessão Neon validada! Acesso administrativo autorizado para testes no banco Neon.', true);
      signout.hidden = false;
      document.getElementById('neonDataTests')?.removeAttribute('hidden');
      return true;
    }
    if (!quiet) {
      if (response.status === 403) notice('O login Neon funcionou, mas a conta ainda não tem autorização administrativa no sistema.');
      else if (response.status === 401) notice('Sessão recebida, mas o token JWT foi rejeitado pelo verificador administrativo.');
      else notice('A verificação administrativa não respondeu corretamente (HTTP ' + response.status + ').');
    }
    return false;
  } catch {
    if (!quiet) notice('A sessão foi obtida, mas a consulta ao painel de verificação falhou. Verifique a aba Rede.');
    return false;
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
      // Algumas respostas da API ou da sessão podem falhar mesmo quando uma
      // sessão válida já foi criada. Sempre conferir autorização assinada.
      const existingAuthorization = await checkRole({quiet:true});
      if (existingAuthorization) return;
      const code = String(error.code || '').toUpperCase();
      if (code === 'USER_NOT_FOUND') {
        notice('Não foi possível localizar uma sessão válida no navegador. A conta está cadastrada no Neon; verifique cookies de terceiros, atualize a página e tente novamente. Código técnico: USER_NOT_FOUND.');
      } else {
        notice(['INVALID_EMAIL_OR_PASSWORD','INVALID_PASSWORD','INVALID_CREDENTIALS'].includes(code)
          ? 'E-mail ou senha não conferem. Se acabou de redefinir a senha, tente novamente com a senha Neon atual.'
          : 'Não foi possível entrar. ' + classify(error));
      }
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
      notice('Não foi possível enviar o código. ' + classify(result.error));
    } else {
      // O Neon Auth está configurado para confirmação por código (OTP), não link.
      otpForm.hidden = false;
      notice('Se o e-mail estiver registrado, você receberá um código numérico. Digite-o abaixo para confirmar o endereço. O código expira em aproximadamente 15 minutos.',true);
      otpForm.elements.namedItem('otp')?.focus();
    }
  } catch(err) {
    notice(classify(err));
  } finally {
    verification.disabled = false;
  }
});

otpForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = currentEmail();
  const otp = String(otpForm.elements.namedItem('otp')?.value || '').trim();
  if (!/^[0-9]{4,10}$/.test(otp)) {
    notice('Informe o código numérico recebido por e-mail.');
    return;
  }
  const submit = otpForm.querySelector('button[type=submit]');
  submit.disabled = true;
  notice('Confirmando o código com o Neon...');
  try {
    const {error} = await auth.emailOtp.verifyEmail({email, otp});
    if (error) {
      notice('Código não aceito ou expirado. ' + classify(error));
      return;
    }
    otpForm.hidden = true;
    otpForm.elements.namedItem('otp').value = '';
    notice('E-mail confirmado no Neon! Agora entre com sua senha Neon. Se aparecer “invalid_credentials”, redefina a senha pelo botão de recuperação.',true);
  } catch(err) {
    notice(classify(err));
  } finally {
    submit.disabled = false;
  }
});


// Operações de homologação limitadas a administrador Neon verificado.
// O JWT é emitido pelo Auth, fica apenas na memória e nunca vai ao localStorage.
const neonOperations = Object.freeze({
  adminSummary: {id:'neonReadData',label:'Resumo do banco',method:'GET'},
  publicCatalog: {id:'neonCatalogBtn',label:'Catálogo',method:'GET'},
  adminInventory: {id:'neonInventoryBtn',label:'Estoque',method:'GET'},
  adminOrders: {id:'neonOrdersBtn',label:'Pedidos',method:'GET'},
  smoke: {id:'neonSmokeTest',label:'Teste reversível',method:'POST'},
});
async function runNeonTest(operation) {
  const output = document.getElementById('neonTestOutput');
  const conf = neonOperations[operation];
  const button = document.getElementById(conf?.id);
  if (!output || !button || !conf) return;
  button.disabled = true;
  output.textContent = 'Consultando '+conf.label.toLowerCase()+' no Neon...';
  try {
    // Nunca enviar token pelo query string nem armazená-lo em log ou navegador.
    const jwt = await auth.token();
    const token = String(jwt?.data?.token || '');
    if (jwt?.error || !token) throw new Error('not_authenticated');
    const response = await fetch('/api/admin-dashboard?neonApi='+encodeURIComponent(operation), {
      method: conf.method, cache:'no-store',
      headers: {Authorization: 'Bearer '+token, ...(conf.method==='POST'?{'Content-Type':'application/json'}:{})},
      ...(conf.method==='POST'?{body:'{}'}:{})
    });
    const result = await response.json().catch(()=>({error:'invalid_response'}));
    if (!response.ok) {
      output.textContent = 'Não aprovado (HTTP '+response.status+'): '+String(result.error||'unknown').slice(0,100);
      return;
    }
    if (operation==='smoke') {
      output.textContent = (result.passed && result.rolledBack ? 'APROVADO' : 'REVISAR')+
        '\\nEtapas: '+(Array.isArray(result.tests)?result.tests.join(', '):'não informadas')+
        '\\nDados persistidos: '+(result.rolledBack?'nenhum (ROLLBACK)':'revisar transação');
    } else if(operation==='adminSummary') {
      output.textContent='Resumo Neon (tabelas):\\n'+JSON.stringify(result.counts||{},null,2);
    } else if(operation==='publicCatalog') {
      output.textContent='Catálogo Neon: '+(result.products||[]).length+' produtos, '+(result.variants||[]).length+' variações, '+(result.categories||[]).length+' categorias.\\n'+
      JSON.stringify((result.products||[]).slice(0,6).map(p=>({name:p.name,status:p.status})),null,2);
    } else if(operation==='adminInventory') {
      output.textContent='Estoque Neon: '+(result.inventory||[]).length+' registros.\\n'+JSON.stringify((result.inventory||[]).slice(0,15),null,2);
    } else if(operation==='adminOrders') {
      output.textContent='Pedidos Neon: '+(result.orders||[]).length+' registros.\\n'+
        JSON.stringify((result.orders||[]).slice(0,10).map(o=>({number:o.order_number,status:o.status,payment:o.payment_status,total:o.total})),null,2);
    }
  } catch {
    output.textContent = 'Falha na chamada ao Neon. Verifique a sessão e o console de rede do navegador.';
  } finally {
    button.disabled = false;
  }
}
for (const [operation, cfg] of Object.entries(neonOperations)) {
  document.getElementById(cfg.id)?.addEventListener('click',()=>runNeonTest(operation));
}

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
window.__atleticNeonClientReady = Boolean(auth);
if (!auth) {
  notice('O cliente Neon Auth não iniciou. Recarregue a página ou consulte o console.');
} else if (!resetToken && !resetError) {
  checkRole().catch(() => notice('Não foi possível completar a verificação da sessão Neon.'));
}
