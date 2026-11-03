# Atletic Suplementos — Migração Supabase → Neon

Data: 2026-11-03.

Origem Supabase: `swilmjgpivwynosvuuqm`. Destino Neon: `hidden-tooth-21561268` / `atletic_db` (PostgreSQL 17, São Paulo).

**Tabelas tipadas homologação:** 26.

**Registros copiados no esquema privado:** 99 / 99.

**Definições de objetos SQL arquivadas:** 266.

**Usuários legados identificados:** 2 (nenhuma conta Neon reativada).

**Objetos Storage identificados:** 0 (metadados, não arquivos).

**Pendências específicas:** nenhum registro comercial faltante.

## Exatidão dos status
Este registro documenta **uma cópia de homologação e referência técnica, NÃO um ambiente pronto**. Não é um pg_dump completo, não contém bytes de Storage, credenciais administrativas, contas ativadas nem a reprodução das garantias de RLS/constraints/triggers no esquema público.

### O que já existe no Neon
- `migration_staging.source_rows`: linhas em JSONB para reconciliação, sem exposição no Data API.
- `migration_staging.source_metadata`: contagens da origem e esquema de colunas.
- `migration_staging.schema_artifacts`: definições SQL de índices, constraints, policies, funções, triggers, views **armazenadas como texto, NÃO executadas**.
- `migration_staging.legacy_auth_users`: UUID/e-mail/telefone dos usuários antigos; **sem senhas, hashes ou sessões novas**. Pendente de processo de reativação e mapeamento de IDs.
- `migration_staging.storage_manifest`: metadados dos buckets e objetos, **sem os arquivos reais**.
- `migration_preview`: tabelas tipadas com valores copiados, **sem FK, defaults, RLS, índices e lógica de negócio**; não expostas no Neon Data API.
- `public`: **0 tabelas de negócio**. Não redirecionar o frontend.
- Neon Managed Better Auth e Data API foram provisionados; usuários finais ainda não migraram.
- Apenas variáveis de Preview da branch `migration/supabase-to-neon` foram criadas na Vercel. Não modificamos Production, GitHub main nem Supabase.

### Portões obrigatórios antes da produção e cancelamento de cobrança
1. Backup **completo e restaurável** (inclui todas as schemas relevantes e todos os bytes do Storage) em local privado e testado.
2. Export/import adicional dos registros pendentes e sincronização final controlada, garantindo consistência transacional.
3. Esquema público funcional: chaves/FKs, tipos, defaults, constraints, índices, funções, triggers, extensões, RLS e privilégios ajustados ao Neon/Auth.
4. Autenticação: migração/reativação de usuários (as senhas existentes não são migráveis diretamente), mapeamento de IDs, recuperação de senha, MFA, convites, sessões, revogações.
5. Definição e implantação de armazenamento de objetos seguro (Neon Object Storage **indisponível em aws-sa-east-1**). Nunca publicar arquivos privados.
6. Refatoração do cliente/servidor da aplicação e testes E2E em Vercel Preview, incluindo negação de acesso entre empresas/unidades, operações de leitura/escrita, integrações.
7. Janela de corte com bloqueio temporário de escritas na origem, delta final, reconciliação, rollback e monitoramento.
8. Somente após os **três** sistemas estarem independentes do Supabase, cancelar o Supabase Pro no **Vercel Marketplace** e conferir a fatura seguinte.

**Risco financeiro:** a instalação Supabase no Vercel Marketplace indica US$45/mês (US$25 Pro, mais três micros US$10 cada, menos US$10 créditos), antes de excedentes. Supabase Free permite até dois projetos ativos; não reduzir com três projetos dependentes em produção, sob risco de indisponibilidade. A integração Vercel é responsável pelo faturamento.
