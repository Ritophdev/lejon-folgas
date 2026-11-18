# Lejon Folgas

Portal mobile first para consultar as escalas de folga do Lejon Atacarejo, em Maringá. O frontend é exportado como site estático; Supabase fornece autenticação e banco de dados.

## Rodar localmente

```bash
npm ci
npm run dev
```

Sem variáveis Supabase, o portal abre a demonstração local com dados fictícios. As alterações administrativas ficam somente no navegador usado na demonstração.

## Criar o banco Supabase

1. Crie um projeto Supabase e abra **SQL Editor**.
2. Execute [`supabase/schema.sql`](supabase/schema.sql).
3. Execute [`supabase/seed.sql`](supabase/seed.sql) para criar colaboradores e duas escalas fictícias publicadas.
4. Em **Authentication → Users**, crie um usuário para o RH.
5. Copie o UUID desse usuário e execute no SQL Editor, substituindo o valor:

   ```sql
   insert into public.admin_users (user_id, role)
   values ('UUID_DO_USUARIO_AUTH', 'rh');
   ```

6. Para testar localmente, copie `.env.example` para `.env.local` e preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` com os valores do projeto Supabase.

O frontend usa apenas a chave pública `anon`/publishable. Ela estará visível no JavaScript baixado pelo navegador, como esperado para uma aplicação cliente. **Nunca** coloque `service_role` no frontend, no repositório ou nas variáveis `NEXT_PUBLIC_*`. Mantenha RLS habilitado; o schema configura as regras para a consulta pública de colaboradores ativos e semanas publicadas, e reserva gravações para usuários autorizados em `admin_users`.

## Publicar em GitHub Pages

O workflow [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) compila e publica a pasta estática `out` quando há push na branch `main`.

1. Crie um repositório GitHub e envie este projeto para a branch `main`.
2. Em **Settings → Pages**, escolha **GitHub Actions** como fonte de publicação.
3. Para conectar o banco, em **Settings → Secrets and variables → Actions → Variables**, crie estas variáveis do repositório:
   - `NEXT_PUBLIC_SUPABASE_URL`: URL do projeto Supabase.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: chave pública `anon`/publishable do projeto.
4. Faça push para `main` ou execute o workflow manualmente na aba **Actions**.

Se ainda não criou o projeto Supabase, deixe as duas variáveis ausentes. O workflow publica a demonstração fictícia em modo local; quando as duas variáveis forem adicionadas, a aplicação passa a ler e gravar no Supabase. Não configure apenas uma delas.

O workflow detecta automaticamente se a publicação usa um subcaminho (`/<nome-do-repositório>`) ou o domínio raiz `<usuário>.github.io`. A exportação inclui barra final nas rotas para que páginas como `/admin/` funcionem no GitHub Pages.

Depois do primeiro deploy, em Supabase abra **Authentication → URL Configuration** e adicione o endereço GitHub Pages do site às **Redirect URLs**. A tela de login atual usa e-mail e senha, mas configurar a URL evita problemas em fluxos futuros de confirmação e recuperação.

## Dados e segurança

- Os nomes, cargos e escalas do arquivo de seed são fictícios e servem para apresentação.
- O portal do colaborador não pede senha e salva no dispositivo apenas o identificador selecionado.
- O colaborador consulta somente semanas publicadas; rascunhos e alterações administrativas exigem uma sessão autenticada autorizada pelo RH.
- As políticas RLS estão em [`supabase/schema.sql`](supabase/schema.sql). Não use dados pessoais reais na demonstração pública.

## PWA

O manifesto e o service worker suportam tanto um domínio raiz quanto a subpasta do GitHub Pages. No iPhone, use **Compartilhar → Adicionar à Tela de Início** no Safari.
