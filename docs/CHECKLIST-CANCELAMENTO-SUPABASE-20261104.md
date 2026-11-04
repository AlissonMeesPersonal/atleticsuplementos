# Atletic Suplementos — Plano de corte Supabase → Neon (04/11/2026)

Este documento descreve a migração na branch `migration/supabase-to-neon`. **Nunca concluir o corte nem cancelar a assinatura antes dos testes completos.**

## Estado confirmado

- Tabelas da aplicação no Neon `public`: 26, com RLS habilitado e sem grants `anonymous`/`authenticated`.
- Dados de negócio copiados: 99/99 registros do snapshot, sujeitos à sincronização final.
- Conta Neon Auth: 2 usuários provisórios criados. Todos aguardam verificação de e-mail, ativação e definição de senha; **nenhum recebeu mapeamento de autorização**.
- Armazenamento: nenhum necessário; objetos da origem inventariados: 0.
- Vercel: NEON_DATABASE_URL configurada em Preview; rota /api/neon-connectivity adicionada, build READY, execução HTTP não verificada.
- Neon Auth: endereço de Preview confiável registrado. Em Next.js, `NEON_AUTH_COOKIE_SECRET` sensível configurado somente na branch de teste.
- A Vercel Production continua no Supabase, assim como as branches `main` dos repositórios.
- **Não há políticas RLS de negócio no Neon `public` ainda; o acesso direto por usuários da aplicação permanece bloqueado.**

## Impedimentos ao corte

Proteção administrativa, autenticação do navegador e APIs REST da loja ainda usam Supabase; faltam políticas RLS, RPCs e testes de CRUD.

## Testes obrigatórios

1. Efetuar backup completo de origem e validar restauração em destino isolado, incluindo os bytes do Storage.
2. Congelar gravações na origem; reconciliar deltas, contagens e hashes antes da última troca.
3. Migrar todas as FKs de usuário para a identidade Neon com mapeamento verificado e sem concessões por mero e-mail.
4. Exigir e-mail verificado; redefinir senha dos usuários; testar recuperação, saída, revogação, MFA e papéis.
5. Portar e auditar políticas, triggers, funções, views, extensões, grants, storage e integrações.
6. Provar que o acesso cross-tenant ou cross-unidade falha mesmo com conta válida.
7. Testar CRUD e workflows de negócio em Vercel Preview, checar logs e backups; aprovar plano de reversão.
8. Atualizar apenas então as variáveis Production para o backend Neon, observar resultados e **somente após todos os sistemas independentes** desinstalar o Supabase Pro pelo Vercel Marketplace.

## Financeiro

O cancelamento do Supabase Pro **não foi realizado**. Os dois novos stores Vercel Blob são recursos separados, sujeitos às regras de uso/custos da Vercel. Não apagar Supabase Auth, Storage ou bancos antigos antes de concluir o cutover.
