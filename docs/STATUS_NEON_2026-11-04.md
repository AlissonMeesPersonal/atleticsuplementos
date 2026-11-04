# Atletic Suplementos — estado da migração em 04/11/2026

**NÃO realizar corte nem cancelar Supabase Pro ainda.**

## Validações já concluídas no banco de homologação (Neon São Paulo, PostgreSQL 17)

| Etapa | Resultado |
| --- | --- |
| Tabelas de negócios no schema privado `migration_preview` | 26 |
| Linhas de negócios preservadas no staging | 99 / 99 |
| Chaves primárias/unicidade | 43 |
| Restrições CHECK | 45 |
| Chaves estrangeiras internas | 26 |
| Chaves estrangeiras para o antigo Supabase Auth ainda não portadas | 7 |
| Índices de origem | 83 |
| Colunas NOT NULL | 182 |
| Colunas com defaults aplicados | 128 |
| Restrições EXCLUDE | 0 |
| Usuários de origem inventariados (NENHUM reativado no Neon) | 2 |
| Arquivos do Supabase Storage inventariados (bytes não transferidos) | 0 |

O inventário de contagem de linhas foi novamente consultado na origem em 04/11 e não registrou mudança de quantidade desde o snapshot inicial. **Isto não constitui garantia de consistência em tempo real.**

Os esquemas `migration_staging` e `migration_preview` estão privados, sem concessão pública e fora do Data API. O `public` ainda não contém tabelas de negócios: a aplicação real continua no Supabase.

## Bloqueios antes do cutover
- Capturar backup completo restaurável com `pg_dump` e backup dos bytes do Storage; testar restore e integridade.
- Recriar as tabelas `public`, permissões e políticas RLS compatíveis com a autenticação Neon; validar funções de segurança/RPC, jobs e triggers.
- Executar reativação segura dos usuários: o Neon Managed Better Auth não recebe as senhas antigas; IDs e chaves estrangeiras devem ser reconciliados.
- Implementar e validar o novo código e deploy Preview isolado.
- Usar storage apropriado: Neon Object Storage não funciona na região São Paulo hoje; preservar restrições dos arquivos privados.
- Reconciliar novamente os dados ao interromper gravações na origem e monitorar comportamento de produção após o corte.
- Dados de negócios foram copiados integralmente em relação à contagem de snapshot; ainda falta sincronização final e validação funcional.
- Verificar coluna gerada `inventory.quantity_available` no esquema definitivo; a cópia de homologação ainda não restaurou essa expressão. Sequência `migration_preview.order_number_seq` criada.

- Confirmar se não há mais dependências do Supabase nas variáveis Vercel **Production**, URLs de arquivos, sessões e integrações antes de encerrar a assinatura Vercel Marketplace.

## Próximo passo
Trabalhar primeiro na adaptação de Auth/RLS e REST/SDK, seguida de armazenamento, E2E e migração final. **Não mesclar a branch de migração com main antes de passar nos testes.**
