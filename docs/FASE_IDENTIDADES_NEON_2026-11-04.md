# Atletic Suplementos — validação de identidades e autorização (04/11/2026)

## Estado de homologação
- 26 tabelas de negócios copiadas para `migration_preview`, não para `public`.
- Registros de negócios no snapshot: 99/99.
- 2 UUIDs do Supabase Auth inventariados em tabela privada, sem importar senhas.
- 7/7 chaves estrangeiras associadas a `auth.users` verificadas por integridade contra `migration_preview.legacy_auth_users`.
- Arquivo versionado `scripts/migration/legacy-auth-compat.sql` implementa `migration_auth.legacy_uid()` no Neon e limita EXECUTE ao papel `authenticated`.
- Neon identity adapter tests: NULL without a mapped user, anonymous blocked, authenticated can call; legacy source table remains private.

## Significado e limites
A validação é **somente de compatibilidade estrutural e integridade no Neon de homologação**. O valor da identidade retorna NULL até o usuário demonstrar propriedade da conta Neon e um administrador validar o vínculo `migrated_user_id` com a identidade legada. Isso evita reutilizar IDs por simples correspondência de e-mail.

**Não há login de usuários migrado, RLS de aplicação aprovado, tabelas públicas funcionais, deploy Preview testado, backup completo/restore, ou arquivo Storage binário transferido.**

A tentativa de recriação de políticas em homologação foi interrompida por uma restrição de segurança da ferramenta; não contornar. Revisar manualmente políticas e RPCs no fluxo autorizado, de modo que cada decisão de acesso seja explicitamente testada. Não afrouxar regras RLS para obter um teste verde.

## Critérios para avançar
1. Finalizar cópia/restauração confiável e validação de dados, inclusive delta final.
2. Migrar usuários pelo fluxo oficial Neon Managed Better Auth, com reativação segura, compatibilidade MFA/sessões e mapeamento conferido.
3. Portar autorização/RLS e todas as funções críticas; negar acesso entre empresas/unidades e validar testes negativos.
4. Instalar camada de armazenamento de arquivos compatível e conferir permissões de cada objeto.
5. Implementar SDK/backend da aplicação, executar E2E em ambiente Preview isolado e acompanhar funcionamento.
6. Só depois do corte e da ausência de dependências Supabase cancelar a assinatura no Vercel Marketplace.

**Nenhuma alteração aplicada à produção ou ao plano de faturamento.**
