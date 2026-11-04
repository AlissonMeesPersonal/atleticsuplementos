# Atletic Suplementos — Importação das tabelas públicas no Neon

Data de execução: 2026-11-04.

Destino: Neon `hidden-tooth-21561268 / atletic_db`. Origem: Supabase (ainda em produção).

## Copiado para `public` no Neon
- **26 tabelas físicas**, criadas a partir de `migration_preview` (snapshot anterior do Supabase), usando `LIKE ... INCLUDING ALL`.
- **99 / 99 linhas da cópia de preparação**, sem erros de lote.
- **83 índices** copiados.
- **26 chaves estrangeiras internas** adicionadas.
- **RLS habilitado em todas as 26 tabelas**.
- **0 políticas RLS de negócio** restauradas; acesso a todas as tabelas negado para papéis `anonymous` e `authenticated` (sem grants).
- **0 tabelas** legíveis por esses dois papéis na verificação pós-importação.
- **7 chaves estrangeiras para `auth.users` ainda não recriadas** em `public` (o Neon usa `neon_auth.user` e precisa de mapeamento dos 2 usuários). A ponte com identidades legadas está restrita à homologação.
- **0 objetos** do Supabase Storage inventariados anteriormente; *os arquivos binários ainda não foram transferidos*.

## Observação específica
A sequência `public.order_number_seq` foi criada e o default de `orders.order_number` ajustado; `inventory.quantity_available` precisa recuperar a expressão de coluna gerada antes de operações de estoque.

## AVISO: NÃO É MIGRAÇÃO COMPLETA NEM AUTORIZAÇÃO PARA CUTOVER
O conteúdo importado foi extraído previamente da origem através do conector SQL, copiado ao schema privado `migration_staging`/`migration_preview` no Neon e agora restaurado no schema `public` do Neon. **Não é um `pg_dump/pg_restore` completo, consistente e testado**. O snapshot pode estar desatualizado mesmo se as contagens de linhas da origem não mudaram.

Ainda faltam:
- `pg_dump` completo/backup criptografado e teste de restore com cliente PostgreSQL e conexões diretas, fora deste fluxo SQL limitado.
- Sincronização final de dados na janela de corte.
- Auth real e recuperação de senha/MFA, redefinição segura de contas e migração das identidades.
- Recriação/revisão de policies, GRANTs, RPCs, funções, triggers, views e workflows.
- Arquivos do Storage com controles de acesso equivalentes e links ajustados.
- Testes E2E em Preview (login, leitura, escrita, segurança multi-tenant, integrações).
- Só após o funcionamento dos três sistemas no Neon e a remoção de todas as dependências do Supabase, desativar a integração cobrada no Vercel Marketplace.

**Não ligar esse banco à Vercel Production agora. O Supabase Pro NÃO foi cancelado.**