# Atletic Suplementos

## Inventário específico — Atletic Suplementos
- Origem: Supabase `swilmjgpivwynosvuuqm`; PostgreSQL 17.
- Banco ~13 MB; 26 tabelas públicas (consulta a `information_schema`); 2 usuários Auth; 0 objetos/0 buckets Storage; 34 políticas públicas, 26 mencionando `auth.uid()`; 9 funções públicas, 22 registros de triggers na consulta de metadados.
- Front-end estático: `dist/store-config.js` contém URL e chave publicável do Supabase (chave pública, não usar como credencial de administração). É necessário alterar essa dependência ao trocar o backend.
- `api/product-images.js` verifica usuário via `/auth/v1/user` e administrador via `/rest/v1/admin_users`. Substituir por validação da nova sessão e consulta protegida à base Neon **no servidor**; manter Serper.
- `database/schema.sql` é uma referência antiga e não coincide integralmente com o estado do banco ativo (por exemplo, `store_staff` vs `admin_users`). Capturar schema **ao vivo**, não aplicar o SQL antigo como se fosse a fonte da verdade.
- Vercel `atleticsuplementos`: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SERPER_API_KEY` e `OLIST_ERP_TOKEN` em uso/configuração. Nunca remover Serper/Olist no corte.
- Validação: login e autorização admin, produtos, estoque, variações, imagens, Olist, cupom, checkout, integridade de movimentos e chamadas API sem chaves privilegiadas no navegador.
- Risco: modelos demonstrativos locais no README podem não refletir todos os fluxos ativos; auditar antes do corte.

# Preparação: Supabase → Neon (sem impacto em produção)

**Status:** preparação / NÃO executar cutover.
**Data do inventário:** 2026-11-03.
**Branch:** `migration/supabase-to-neon`. A `main`, o Supabase e a Vercel de produção permanecem intactos.

## Regras obrigatórias
- Criar **um projeto/banco Neon independente** para esta aplicação, preferencialmente PostgreSQL 17 e região próxima do público. Não misturar dados entre os três sistemas.
- Não apagar projetos Supabase, não cancelar a assinatura, não alterar variáveis **Production** na Vercel e não publicar a branch antes de validar.
- Nunca versionar dumps, dados pessoais, hashes de senha, arquivos privados, credenciais ou URLs de conexão.
- Fazer backup completo, verificável e criptografado em local privado. Registrar data/versão, tamanho, integridade, linhas por tabela, constraints, funções, extensões, políticas e objetos de Storage. Confirmar possibilidade de restauração.
- O `pg_dump` de `public` NÃO resolve sozinho a migração: objetos SQL podem referenciar `auth.uid()`, `auth.users`, RLS, papéis e APIs específicas do Supabase. **Não restaurar cegamente** funções/políticas no Neon.
- Não copiar diretamente tabelas internas `auth` e `storage` para o Neon esperando que Auth/Storage funcionem. Escolher substitutos e um plano de mapeamento de identidade; proteger senhas e preservar/atualizar referências UUID.
- Garantir autorização no servidor por usuário/empresa/unidade. Nenhuma connection string privilegiada deve ir para o browser.
- Fazer ensaios em preview isolado, com dados mascarados quando possível. Nunca conectar uma aplicação de teste a um banco de produção sem necessidade e controles.
- Depois dos testes, programar corte controlado: impedir **novas gravações na origem**, fazer sincronização final, checar contagens/consistência/identidades, trocar configuração de produção e observar. Ter rollback do aplicativo/configuração; reconciliar gravações feitas no destino antes de qualquer retorno à origem.
- Somente depois da aprovação funcional e de segurança dos **três** aplicativos, gerenciar o desligamento e cancelamento pelo Vercel Marketplace.

## Processo
1. **Fonte:** inventariar `public`, `auth`, políticas RLS, funções, triggers, cron, extensões, Storage e dependências externas; obter e testar backup.
2. **Destino:** provisionar Neon isolado. Usar conexão PostgreSQL **sem pool** para `pg_restore` / importação. Não guardar URIs em GitHub.
3. **DDL compatível:** adaptar schemas, chaves estrangeiras para identidades, funções e políticas. Recriar somente extensões suportadas e privilégios adequados.
4. **Dados:** importar dados de negócio e reconciliar contagens, somas e amostras, preservando PKs; ajustar sequences/identities.
5. **Auth e arquivos:** migrar usuários com método suportado pelo provedor escolhido; testar recuperação de senha, MFA quando usado, sessões/revogação. Copiar arquivos e testar permissões/links.
6. **Código:** implementar acesso ao Neon exclusivamente por caminhos autorizados, trocar APIs `supabase.from()`, RPC, Supabase Auth e Storage onde aplicável. Variáveis novas apenas em ambiente **Preview**, sem sobrescrever variáveis da integração marketplace até o corte.
7. **Teste:** fluxos completos e testes negativos de isolamento. Conferir desempenho, logs, backups e custos. Registrar aprovação e plano de reversão.

## Comandos de referência (Windows PowerShell, apenas em ambiente privado)
Instalar cliente PostgreSQL compatível e verificar `pg_dump --version` e `pg_restore --version`. As variáveis abaixo devem ser definidas no terminal/gerenciador seguro, jamais gravadas em commit.

```powershell
# SUPABASE_DB_URL: conexão direta ou session pooler, nunca pooler transacional.
# NEON_DB_URL_UNPOOLED: conexão Neon sem pool, com sslmode=require.
$backupDir = Join-Path $HOME "supabase-migration-private"
New-Item -ItemType Directory -Force $backupDir | Out-Null

# Faz apenas a exportação do schema public; guardar o arquivo em local seguro.
pg_dump --dbname="$env:SUPABASE_DB_URL" --schema=public --format=custom --no-owner --no-acl --file=(Join-Path $backupDir "public.dump")
if ($LASTEXITCODE -ne 0) { throw "Falha no backup: não continuar" }

# Inspecionar sumário do dump, sem restaurar na produção.
pg_restore --list (Join-Path $backupDir "public.dump")
```

**Atenção:** este dump de `public` não é backup completo de Auth, Storage, papéis, arquivos ou integrações; esses itens exigem plano e exportação segura adicionais. Após a adaptação do DDL, `pg_restore` deve ser ensaiado **somente em Neon não produtivo**, com validação completa. Nunca empregar `--clean` no banco de origem.

## Critérios para poder cancelar Supabase Pro
- [ ] Backup de origem + restauração de teste verificadas.
- [ ] Neon provisionado e dados conferidos por tabela.
- [ ] Login, recuperação e permissões migrados sem regressões.
- [ ] Storage copiado e URLs/acessos revisados.
- [ ] Todas as funções, triggers e jobs críticos revisados.
- [ ] Preview isolado testado e aprovado.
- [ ] Produção migrada e monitorada; rollback documentado.
- [ ] Nenhum projeto depende mais de URLs, chaves, Auth ou Storage do Supabase.
- [ ] Os três projetos aprovados e custos/faturamento conferidos.
