# NutriDía

App de seguimiento nutricional con login por usuario (Supabase) y despliegue en Cloudflare Pages.

## 1. Configurar Supabase

1. Crea un proyecto en https://supabase.com
2. En el SQL Editor, corre el SQL de `supabase-schema.sql` (incluido en esta carpeta)
3. En Project Settings → API, copia tu `Project URL` y tu `anon public key`

## 2. Correr localmente

```bash
npm install
cp .env.example .env
# pega tu URL y anon key en .env
npm run dev
```

## 3. Subir a GitHub

```bash
git init
git add .
git commit -m "primer commit"
```
Crea un repositorio nuevo en github.com y luego:
```bash
git remote add origin https://github.com/TU_USUARIO/nutridia.git
git branch -M main
git push -u origin main
```

## 4. Desplegar en Cloudflare Pages

1. Entra a https://dash.cloudflare.com → Workers & Pages → Create application → Pages → Connect to Git
2. Elige tu repositorio `nutridia`
3. Build command: `npm run build`
4. Build output directory: `dist`
5. En **Environment variables**, agrega:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Save and Deploy

Cada `git push` a `main` vuelve a desplegar automáticamente.

## 5. Configurar URLs de autenticación en Supabase

En Supabase → Authentication → URL Configuration, agrega la URL que te dio Cloudflare
(ej. `https://nutridia.pages.dev`) como Site URL y Redirect URL. Sin esto, los correos
de confirmación de cuenta redirigen a localhost.
