# mongodev-tools

Interface web para gestão e auditoria de operações MongoDB, com autenticação via Keycloak, persistência de scripts e histórico de execuções em PostgreSQL, SQL Server ou Oracle.

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Arquitetura](#2-arquitetura)
3. [Pré-requisitos](#3-pré-requisitos)
4. [Variáveis de Ambiente](#4-variáveis-de-ambiente)
5. [Configuração do Keycloak](#5-configuração-do-keycloak)
6. [Deploy com Docker](#6-deploy-com-docker)
7. [Configuração do Nginx](#7-configuração-do-nginx)
8. [Configuração do Banco de Metadados](#8-configuração-do-banco-de-metadados)
9. [Funcionalidades](#9-funcionalidades)
10. [Exemplos de Scripts](#10-exemplos-de-scripts)
11. [Papéis e Permissões](#11-papéis-e-permissões)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Visão Geral

### O que é

O **mongodev-tools** é uma aplicação web que oferece:

| Funcionalidade             | Descrição                                                           |
| -------------------------- | ------------------------------------------------------------------- |
| **Workbench**              | Editor de queries e aggregations MongoDB com execução em tempo real |
| **Browser de Coleções**    | Navegação visual por databases, coleções e documentos               |
| **Scripts Salvos**         | Biblioteca de queries reutilizáveis                                 |
| **Histórico de Auditoria** | Registro completo de quem executou o quê e quando                   |
| **Import / Export**        | Exportação em JSON ou CSV, importação em massa                      |
| **Gestão de Índices**      | Criação e remoção de índices por coleção                            |

### Stack

- **Frontend:** React 18 + Vite + TailwindCSS + shadcn/ui
- **Backend:** Node.js + Express
- **Autenticação:** Keycloak (OIDC / PKCE)
- **Banco de dados alvo:** MongoDB - configuravel via variável de ambiente.
- **Banco de dados auditoria e scripts salvos:** PostgreSQL, SQL Server ou Oracle — configurável via variável de ambiente

---

## 2. Arquitetura

```
                          ┌─────────────────────────────────────┐
                          │             Keycloak                │
                          │  (autenticação OIDC / PKCE)         │
                          └───────────────┬─────────────────────┘
                                          │ OAuth2
┌──────────┐    HTTPS     ┌──────────────▼──────────────────────┐
│ Browser  │◄────────────►│              nginx                  │
└──────────┘              │  /mongo-tools  →  app:5000          │
                          └──────────────┬──────────────────────┘
                                         │
                          ┌──────────────▼──────────────────────┐
                          │          Express (Node.js)           │
                          │  ┌─────────────┐  ┌──────────────┐  │
                          │  │  REST API   │  │  Static SPA  │  │
                          │  └──────┬──────┘  └──────────────┘  │
                          └─────────┼───────────────────────────┘
                                    │
                     ┌──────────────┼─────────────────┐
                     │                                │
             ┌───────▼──────────┐  ┌──────────────────▼─────────────────┐
             │     MongoDB      │  │  PostgreSQL,  MSSQL ou Oracle      │
             │  (dados alvo)    │  │  (scripts salvos e auditoria)      │
             └──────────────────┘  └────────────────────────────────────┘

```

---

## 3. Pré-requisitos

### Infraestrutura obrigatória

| Componente              | Versão mínima | Função                              |
| ----------------------- | ------------- | ----------------------------------- |
| Docker Engine           | 20.x+         | Execução do container               |
| Swarm, Compose, rancher | —             | Orquestração                        |
| MongoDB                 | 4.x+          | Banco de dados alvo das queries     |
| Keycloak                | 19+           | Autenticação SSO                    |
| Banco relacional        | —             | Persistência de scripts e auditoria |

### Banco relacional (escolha um)

| Banco      | Versão | Observação                                               |
| ---------- | ------ | -------------------------------------------------------- |
| PostgreSQL | 12+    | Recomendado; suporta `DATABASE_URL`                      |
| SQL Server | 2017+  | Requer porta 1433 acessível                              |
| Oracle     | 12c+   | Schema deve ser criado pelo DBA antes do primeiro deploy |

---

## 4. Variáveis de Ambiente

> **Importante:** Ao usar Docker `env_file`, **não use aspas** nos valores e **não coloque comentários na mesma linha** (`valor=x  # comentário`), pois o Docker preserva tudo literalmente. Use linhas de comentário separadas com `#` no início.

### 4.1 Aplicação

| Variável         | Obrigatório | Padrão        | Descrição                                                                        |
| ---------------- | ----------- | ------------- | -------------------------------------------------------------------------------- |
| `NODE_ENV`       | Não         | `development` | `production` em produção                                                         |
| `PORT`           | Não         | `5000`        | Porta interna do servidor Express                                                |
| `APP_BASE_PATH`  | Sim         | —             | Prefixo da URL. Ex: `/mongo-tools`                                               |
| `APP_URL`        | Sim         | —             | URL pública completa sem barra final. Ex: `https://siga.empresa.com/mongo-tools` |
| `SESSION_SECRET` | Sim         | —             | Segredo para assinar cookies de sessão                                           |
| `LOG_LEVEL`      | Não         | `info`        | `debug` para diagnóstico; `info` para produção                                   |

### 4.2 MongoDB

| Variável    | Obrigatório | Descrição                                                    |
| ----------- | ----------- | ------------------------------------------------------------ |
| `MONGO_URL` | Sim         | URL de conexão. Ex: `mongodb://user:senha@host:27017/dbname` |

### 4.3 Keycloak

| Variável                 | Obrigatório | Descrição                                            |
| ------------------------ | ----------- | ---------------------------------------------------- |
| `KEYCLOAK_URL`           | Sim         | URL base do Keycloak. Ex: `https://auth.empresa.com` |
| `KEYCLOAK_REALM`         | Sim         | Nome do realm                                        |
| `KEYCLOAK_CLIENT_ID`     | Sim         | Client ID configurado no Keycloak                    |
| `KEYCLOAK_CLIENT_SECRET` | Sim         | Client secret (Settings → Credentials)               |

### 4.4 Banco de Metadados

| Variável                | Obrigatório | Padrão               | Descrição                                                                 |
| ----------------------- | ----------- | -------------------- | ------------------------------------------------------------------------- |
| `DATABASE_VENDOR`       | Sim         | `postgresql`         | `postgresql` \| `mssql` \| `oracle`                                       |
| `DATABASE_SCHEMA`       | Não         | `mongo_tools`        | Schema onde as tabelas serão criadas                                      |
| `DATABASE_URL`          | Não\*       | —                    | URL completa (PostgreSQL apenas). Tem prioridade sobre campos individuais |
| `DATABASE_HOST`         | Sim\*       | —                    | Endereço do servidor                                                      |
| `DATABASE_PORT`         | Não         | `5432`/`1433`/`1521` | Porta                                                                     |
| `DATABASE_USER`         | Sim\*       | —                    | Usuário                                                                   |
| `DATABASE_PASSWORD`     | Sim\*       | —                    | Senha                                                                     |
| `DATABASE_NAME`         | Sim\*       | —                    | Nome do banco                                                             |
| `DATABASE_ENCRYPT`      | Não         | `true`               | **MSSQL.** `false` para redes internas                                    |
| `DATABASE_TRUST_CERT`   | Não         | `false`              | **MSSQL.** `true` para certificados auto-assinados                        |
| `DATABASE_SERVICE_NAME` | Sim\*       | —                    | **Oracle.** Service name (ex: `ORCL`)                                     |
| `DATABASE_SID`          | Sim\*       | —                    | **Oracle.** SID (alternativa ao SERVICE_NAME)                             |

### 4.5 Exemplos de `variables.env`

#### PostgreSQL

```env
NODE_ENV=production
APP_BASE_PATH=/mongo-tools
APP_URL=https://siga.empresa.com/mongo-tools
SESSION_SECRET=minha-chave-secreta-longa-aleatoria
LOG_LEVEL=info

MONGO_URL=mongodb://admin:senha@10.100.1.10:27017/meu-banco

KEYCLOAK_URL=https://auth.empresa.com
KEYCLOAK_REALM=meu-realm
KEYCLOAK_CLIENT_ID=mongodev-tools
KEYCLOAK_CLIENT_SECRET=abc123def456

DATABASE_VENDOR=postgresql
DATABASE_URL=postgresql://user:senha@10.100.1.20:5432/meu_banco
DATABASE_SCHEMA=mongo_tools
```

#### SQL Server

```env
NODE_ENV=production
APP_BASE_PATH=/mongo-tools
APP_URL=https://siga.empresa.com/mongo-tools
SESSION_SECRET=minha-chave-secreta-longa-aleatoria
LOG_LEVEL=info

MONGO_URL=mongodb://admin:senha@10.100.1.10:27017/meu-banco

KEYCLOAK_URL=https://auth.empresa.com
KEYCLOAK_REALM=meu-realm
KEYCLOAK_CLIENT_ID=mongodev-tools
KEYCLOAK_CLIENT_SECRET=abc123def456

DATABASE_VENDOR=mssql
DATABASE_HOST=10.100.1.30
DATABASE_PORT=1433
DATABASE_USER=mongotools_user
DATABASE_PASSWORD=SenhaForte123
DATABASE_NAME=DB_PRODUCAO
# Certificado e criptografia em linhas separadas sem comentario inline
DATABASE_ENCRYPT=false
DATABASE_TRUST_CERT=true
DATABASE_SCHEMA=MONGO_TOOLS
```

#### Oracle

```env
NODE_ENV=production
APP_BASE_PATH=/mongo-tools
APP_URL=https://siga.empresa.com/mongo-tools
SESSION_SECRET=minha-chave-secreta-longa-aleatoria
LOG_LEVEL=info

MONGO_URL=mongodb://admin:senha@10.100.1.10:27017/meu-banco

KEYCLOAK_URL=https://auth.empresa.com
KEYCLOAK_REALM=meu-realm
KEYCLOAK_CLIENT_ID=mongodev-tools
KEYCLOAK_CLIENT_SECRET=abc123def456

DATABASE_VENDOR=oracle
DATABASE_HOST=10.100.1.40
DATABASE_PORT=1521
DATABASE_USER=MONGO_TOOLS
DATABASE_PASSWORD=SenhaOracle123
DATABASE_SERVICE_NAME=ORCL
DATABASE_SCHEMA=MONGO_TOOLS
```

---

## 5. Configuração do Keycloak

### 5.1 Criar o Client

1. Acesse **Realm → Clients → Create**
2. Preencha:
   - **Client ID:** `mongodev-tools`
   - **Client Protocol:** `openid-connect`
   - **Access Type:** `confidential`
3. Em **Settings:**
   - **Valid Redirect URIs:** `https://siga.empresa.com/mongo-tools/*`
   - **Web Origins:** `https://siga.empresa.com`
4. Em **Credentials:** copie o **Client Secret** → use em `KEYCLOAK_CLIENT_SECRET`

### 5.2 Criar as Roles do Client

Em **Clients → mongodev-tools → Roles**, crie:

| Role             | Descrição                                                                 |
| ---------------- | ------------------------------------------------------------------------- |
| `mongodev-admin` | Acesso total: CRUD de coleções, documentos, índices e execução irrestrita |
| `mongodev-user`  | Salva/edita scripts e executa queries de leitura e escrita                |
| `readonly`       | Salva/edita scripts, mas **não executa** operações de escrita no MongoDB  |

### 5.3 Atribuir Roles aos Usuários

1. **Users → \<usuário\> → Role Mappings**
2. Em **Client Roles**, selecione `mongodev-tools`
3. Mova a role desejada para **Assigned Roles**

---

## 6. Deploy com Docker

### 6.1 Estrutura recomendada

```
/opt/projects/mongodev/
├── stack.yml
├── variables.env
└── nginx/
    └── mongo-tools.conf
```

### 6.2 `stack.yml`

```yaml
version: "3.8"

services:
  mongodev-tools:
    image: seu-registry/mongodev-tools:1.0.0
    env_file: variables.env
    networks:
      - proxy
    deploy:
      replicas: 1
      restart_policy:
        condition: on-failure
        delay: 5s
      update_config:
        order: stop-first

networks:
  proxy:
    external: true
```

> **`replicas: 1`** é obrigatório enquanto a sessão for in-memory. Para múltiplas réplicas, implemente sessão em Redis.

### 6.3 Comandos

```bash
# Deploy
docker stack deploy -c stack.yml siga-mongodev

# Atualizar imagem
docker service update --image seu-registry/mongodev-tools:1.0.1 siga-mongodev_mongodev-tools

# Logs em tempo real
docker service logs -f --tail 100 siga-mongodev_mongodev-tools

# Remover
docker stack rm siga-mongodev
```

### 6.4 Build da imagem

```bash
docker build \
  --build-arg APP_BASE_PATH=/mongo-tools \
  -t seu-registry/mongodev-tools:1.0.0 .

docker push seu-registry/mongodev-tools:1.0.0
```

> `APP_BASE_PATH` é baked no bundle Vite. Mudar o sub-path exige rebuild.

---

## 7. Configuração do Nginx

```nginx
# ^~ garante que rotas como /mongo-tools/api/auth/user
# não sejam interceptadas por location ~ /auth do Keycloak
location ^~ /mongo-tools {
    proxy_pass         http://mongodev-tools:5000;
    proxy_http_version 1.1;

    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    proxy_set_header   Upgrade           $http_upgrade;
    proxy_set_header   Connection        "upgrade";

    proxy_read_timeout 120s;
}
```

---

## 8. Configuração do Banco de Metadados

### 8.1 Tabelas

#### `scripts`

| Coluna        | Tipo       | Descrição                |
| ------------- | ---------- | ------------------------ |
| `id`          | INTEGER PK | Identificador            |
| `name`        | VARCHAR    | Nome do script           |
| `description` | TEXT       | Descrição opcional       |
| `code`        | TEXT/CLOB  | Código da query          |
| `type`        | VARCHAR    | `query` ou `aggregation` |
| `created_at`  | TIMESTAMP  | Criação                  |
| `updated_at`  | TIMESTAMP  | Última atualização       |

#### `executions`

| Coluna        | Tipo       | Descrição                        |
| ------------- | ---------- | -------------------------------- |
| `id`          | INTEGER PK | Identificador                    |
| `script_id`   | INTEGER    | FK para scripts (null se ad-hoc) |
| `code`        | TEXT/CLOB  | Código executado                 |
| `status`      | VARCHAR    | `success` ou `error`             |
| `result`      | TEXT/CLOB  | Resultado JSON                   |
| `duration_ms` | INTEGER    | Duração em ms                    |
| `executed_at` | TIMESTAMP  | Data/hora                        |
| `executed_by` | VARCHAR    | Login/email Keycloak             |

### 8.2 Setup por vendor

As tabelas são **criadas automaticamente** no primeiro boot. Pré-requisitos por vendor:

#### PostgreSQL

```sql
-- O usuário precisa de permissão para criar schemas
GRANT CREATE ON DATABASE meu_banco TO meu_usuario;
```

#### SQL Server

```sql
GRANT CREATE TABLE TO mongotools_user;
GRANT ALTER ON SCHEMA::MONGO_TOOLS TO mongotools_user;
```

#### Oracle (executar como DBA antes do primeiro deploy)

```sql
CREATE USER MONGO_TOOLS IDENTIFIED BY "SenhaForte123"
  DEFAULT TABLESPACE USERS
  TEMPORARY TABLESPACE TEMP;

GRANT CREATE SESSION  TO MONGO_TOOLS;
GRANT CREATE TABLE    TO MONGO_TOOLS;
GRANT CREATE SEQUENCE TO MONGO_TOOLS;
GRANT UNLIMITED TABLESPACE TO MONGO_TOOLS;
```

### 8.3 Migração manual (se tabelas já existem sem colunas novas)

**Oracle:**

```sql
ALTER TABLE MONGO_TOOLS.EXECUTIONS ADD executed_by VARCHAR2(255) NULL;
ALTER TABLE MONGO_TOOLS.EXECUTIONS ADD code CLOB NULL;
```

**PostgreSQL:**

```sql
ALTER TABLE mongo_tools.executions ADD COLUMN executed_by VARCHAR(255);
ALTER TABLE mongo_tools.executions ADD COLUMN code TEXT;
```

**SQL Server:**

```sql
ALTER TABLE [MONGO_TOOLS].[executions] ADD executed_by NVARCHAR(255) NULL;
ALTER TABLE [MONGO_TOOLS].[executions] ADD code NVARCHAR(MAX) NULL;
```

---

## 9. Funcionalidades

### 9.1 Workbench

- Selecione o **database MongoDB** no dropdown superior
- Escolha o **tipo:** `Query` ou `Aggregation`
- Escreva o código no editor
- Clique **Executar** — resultado aparece à direita
- Clique **Salvar** para persistir o script com nome e descrição
- Toda execução é registrada automaticamente no histórico

### 9.2 Browser de Coleções

- Sidebar mostra todos os databases e coleções
- Clique em uma coleção → abre **Collection View**:
  - **Documents:** listagem paginada com filtro JSON, ordenação e projeção
  - **Stats:** tamanho, contagem, espaço ocupado
  - **Indexes:** listar, criar e excluir índices (admin)
  - **Export:** JSON ou CSV com filtro
  - **Import:** JSON com modo `insert` ou `upsert` (admin)

### 9.3 Scripts Salvos

- Listagem de todos os scripts com nome, tipo e data
- Botão ▷ — abre o script no Workbench (URL `/?id=N`) para execução com rastreio de `script_id`
- Botão ✏️ — abre para edição
- Botão 🗑️ — exclusão com confirmação

### 9.4 Histórico de Auditoria

- Lista todas as execuções: status, usuário, data/hora, prévia do código, duração
- **Ver detalhes** abre modal com:
  - **Aba Código** — código completo com syntax highlighting
  - **Aba Resultado** — JSON do MongoDB com syntax highlighting

---

## 10. Exemplos de Scripts

### Queries

```javascript
// Buscar com filtro e ordenação
db.collection("usuarios").find({ ativo: true }).sort({ nome: 1 }).limit(50);

// Projeção — retornar apenas campos específicos
db.collection("pedidos").find(
  { status: "pendente" },
  { projection: { _id: 1, cliente: 1, valor: 1 } },
);

// Contar documentos
db.collection("logs").countDocuments({
  nivel: "error",
  timestamp: { $gte: new Date("2025-01-01") },
});

// Buscar em outro database
const outro = db.getSiblingDB("outro-banco");
outro.collection("clientes").find({ uf: "SP" });
```

### Aggregations

```javascript
// Agrupar e somar
db.collection("vendas").aggregate([
  { $match: { data: { $gte: new Date("2025-01-01") } } },
  { $group: { _id: "$vendedor", total: { $sum: "$valor" }, qtd: { $sum: 1 } } },
  { $sort: { total: -1 } },
  { $limit: 10 },
]);

// Lookup (join)
db.collection("pedidos").aggregate([
  {
    $lookup: {
      from: "clientes",
      localField: "clienteId",
      foreignField: "_id",
      as: "cliente",
    },
  },
  { $unwind: "$cliente" },
  { $project: { numero: 1, valor: 1, "cliente.nome": 1 } },
]);

// Relatório por período — acessos nos últimos 7 dias
db.collection("eventos").aggregate([
  {
    $match: {
      tipo: "login",
      ts: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
  },
  {
    $group: {
      _id: {
        dia: { $dateToString: { format: "%Y-%m-%d", date: "$ts" } },
        usuario: "$usuario",
      },
      acessos: { $sum: 1 },
    },
  },
  { $sort: { "_id.dia": -1 } },
]);
```

---

## 11. Papéis e Permissões

| Permissão                             | `mongodev-admin` | Autenticado | `readonly` |
| ------------------------------------- | :--------------: | :---------: | :--------: |
| Ver databases e coleções              |        ✅        |     ✅      |     ✅     |
| Executar queries de leitura           |        ✅        |     ✅      |     ✅     |
| Salvar / editar / excluir scripts     |        ✅        |     ✅      |     ✅     |
| Executar queries de escrita¹          |        ✅        |     ✅      |     ❌     |
| Criar / excluir coleções              |        ✅        |     ❌      |     ❌     |
| Inserir / editar / excluir documentos |        ✅        |     ❌      |     ❌     |
| Criar / excluir índices               |        ✅        |     ❌      |     ❌     |
| Importar documentos                   |        ✅        |     ❌      |     ❌     |
| Ver status do servidor MongoDB        |        ✅        |     ❌      |     ❌     |

¹ _Operações bloqueadas para `readonly`: `insertOne/Many`, `updateOne/Many`, `deleteOne/Many`, `drop`, `createCollection`, `createIndex`, `dropIndex`, `bulkWrite`, `$out`, `$merge`, etc._

---

## 12. Troubleshooting

| Erro                                    | Causa                                                | Solução                                        |
| --------------------------------------- | ---------------------------------------------------- | ---------------------------------------------- |
| `getaddrinfo ENOTFOUND base`            | `DATABASE_URL` com aspas literais do Docker env_file | Remova as aspas do valor no `variables.env`    |
| `self-signed certificate` (MSSQL)       | TLS habilitado com cert auto-assinado                | Adicione `DATABASE_TRUST_CERT=true`            |
| `ORA-01658` (Oracle)                    | Usuário sem quota no tablespace                      | `GRANT UNLIMITED TABLESPACE TO MONGO_TOOLS`    |
| `invalid_grant: Incorrect redirect_uri` | URL pública diferente do registrado no Keycloak      | Corrija `APP_URL` e `Valid Redirect URIs`      |
| Scripts somem após reiniciar            | Banco não conectou, usou memória                     | Ative `LOG_LEVEL=debug` e revise as variáveis  |
| Sessão perdida entre requests           | Múltiplas réplicas com sessão in-memory              | Mantenha `replicas: 1`                         |
| `DATABASE_TRUST_CERT` ignorado          | Comentário inline no `variables.env`                 | Mova comentários para linhas separadas com `#` |

### Diagnóstico com `LOG_LEVEL=debug`

```
[storage] iniciando — vendor=oracle schema=MONGO_TOOLS host=10.0.0.1 (LOG_LEVEL=debug)
[debug] variáveis de conexão: { DATABASE_HOST: '10.0.0.1', ... }  ← valores sem aspas/comentários
[storage] schema "MONGO_TOOLS" pronto (Oracle)
[storage] conectado — vendor: oracle, schema: MONGO_TOOLS
[debug] [execute] body recebido: { scriptId: 5, codeLength: 82 }
[debug] [storage] logExecution → banco { scriptId: 5, executedBy: 'user@emp.com' }
query: INSERT INTO "MONGO_TOOLS"."executions" ...
```
