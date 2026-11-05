# Atletic — teste controlado de autenticação Neon (05/11/2026)

## Ambiente de homologação
- Branch: `migration/supabase-to-neon`. Não fazer merge para `main` ou trocar Production.
- Teste frontend: `/neon-admin-test`, com JS `/neon-admin-test.js` gerado por `npm run build`.
- Teste backend: `GET /api/neon-admin-verify`, apenas Vercel Preview.
- Credenciais: usa `NEXT_PUBLIC_NEON_AUTH_URL` pública no bundle, `NEON_AUTH_JWKS_URL` pública só no backend e `NEON_DATABASE_URL` exclusivamente no backend. Nunca publicar a última.
- O token é obtido do SDK `@neondatabase/auth`, validado contra JWKS oficial por `jose` e consultado contra `neon_auth.user`, `migration_staging.legacy_auth_users` e `public.admin_users`.
- A autorização exige JWT assinado, role `authenticated`, UUID válido, e-mail verificado, usuário não banido, correspondência de nova e antiga identidade criada durante a migração, papel `admin` e registro ativo.
- Não concede GRANT novo de acesso aos dados, não habilita compra/administração/CRUD no Neon, e não altera senhas nem contas na produção.

## Ensaios de segurança
- Requisição sem token ao endpoint deve retornar 401.
- Token adulterado, expirado ou de outro Neon deve retornar 401.
- Usuário não ativado, e-mail não verificado ou sem papel administrativo deve retornar 403.
- Após ativação pessoal segura, token Neon de administrador verificado deve retornar 200 e autorização, sem detalhes pessoais expostos.
- A página de teste e a rota de verificação não devem existir na `main` ou no deploy Production.
- O novo bundle não armazena tokens no localStorage.

## Pendências que proíbem excluir o projeto Supabase
- Usuários Neon Auth: 2 contas provisórias; 0 e-mails verificados. Ativação/redifinição de senha ainda não concluída.
- APIs `api/admin-*`, `api/olist-erp`, `api/olist-import`, `api/barcode-stock`, `api/site-visuals` e `dist/customer-account.js` continuam dependentes de Supabase Auth/PostgREST.
- Storefront/checkout e gestão de estoque precisam testes completos de leitura, escrita, concorrência e estoque.
- Verificar snapshot `99/99` com hashes imediatamente antes do corte; preservar backup completo restaurável.
- RLS: 34 policies recriadas, mas 0 tabelas expostas com GRANT para `anonymous`/`authenticated`; validar autorização e perfis de acesso antes de ligar a Data API.
- A coluna quantity_available está protegida por trigger e CHECK no Neon, mas ainda não tem a declaração `GENERATED ALWAYS` de origem.

**Não apagar nem pausar o Supabase da Atletic enquanto esses itens não forem aprovados.**
