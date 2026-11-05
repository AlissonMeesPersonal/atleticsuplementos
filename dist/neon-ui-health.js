(() => {
  // Sinalização independente do SDK, útil para identificar falha de carregamento.
  function init() {
    const status = document.getElementById('neonStatus');
    if (!status) return;
    const messages = {
      neonRecovery: 'Botão recebido. Conectando ao serviço de recuperação Neon...',
      neonVerifyEmail: 'Botão recebido. Verificando serviço de e-mail Neon...',
      neonLogout: 'Botão recebido. Encerrando sessão...',
    };
    for (const id of ['neonRecovery','neonVerifyEmail','neonLogout']) {
      const button = document.getElementById(id);
      if (!button) continue;
      button.addEventListener('click', () => {
        status.textContent = window.__atleticNeonClientReady
          ? messages[id] : 'O formulário está disponível, mas o módulo Neon Auth ainda não iniciou. Verifique o console e recarregue a página.';
      }, { capture: true });
    }
    const form = document.getElementById('neonAdminLogin');
    form?.addEventListener('submit', () => {
      if (!window.__atleticNeonClientReady) {
        status.textContent = 'O módulo Neon Auth ainda não iniciou. Recarregue a página.';
      }
    }, {capture: true});
    window.addEventListener('error', (event) => {
      // Não mostrar a mensagem/URL original do erro, que pode conter parâmetros privados.
      const relevant = event.filename && /neon-admin-test\.js/.test(event.filename);
      if (relevant) status.textContent = 'Erro ao iniciar o módulo Neon Auth (JavaScript). Verifique o console.';
    });
    window.addEventListener('unhandledrejection', () => {
      if (!window.__atleticNeonClientReady) {
        status.textContent = 'Falha ao iniciar autenticação Neon. Recarregue ou verifique o console.';
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, {once:true});
  } else {
    init();
  }
})();
