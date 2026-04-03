# Voucher Sessions — React App

Sistema de gestión de Voucher Sessions para Amalga Group / Gemini account.

## Stack

- **React 19** + **Vite 6**
- **Supabase** (PostgreSQL + REST)
- **React Router 7** (client-side routing)
- **Recharts** (backlog chart)
- **date-fns** (date formatting)
- **Vercel** (deploy)

## Setup local

```bash
# 1. Instalar dependencias
npm install

# 2. Copiar variables de entorno (ya vienen en .env.local)
# VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY ya están configuradas

# 3. Correr el dev server
npm run dev
# → http://localhost:5173
```

## Estructura

```
src/
├── lib/
│   ├── supabase.js          # Supabase client
│   └── sprint.js            # Sprint plan logic, date utils
├── hooks/
│   └── useData.js           # Supabase data hooks
├── components/
│   ├── ui/index.jsx         # Design system: Badge, Card, Modal, etc.
│   ├── Calendar.jsx         # Calendar con navegación por mes
│   ├── SprintPlan.jsx       # Sprint plan display
│   ├── SessionsTable.jsx    # Tabla de sesiones compartida
│   └── SessionModals.jsx    # Complete + Note modals
├── pages/
│   ├── TLConsolePage.jsx    # Consola TL: import, dashboard, alerts, backlog
│   └── SpecialistPage.jsx   # Vista por specialist
├── App.jsx                  # Router + Sidebar
├── main.jsx                 # Entry point
└── index.css                # CSS variables + reset
```

## Rutas

| Ruta | Descripción |
|---|---|
| `/` | TL Console |
| `/specialist/alejandro-guerrero` | Alejandro Guerrero |
| `/specialist/jonathan-flores` | Jonathan Flores |
| `/specialist/jose-angel-aleman` | Jose Angel Aleman |
| `/specialist/juno-urdiales` | Juno Urdiales |
| `/specialist/luis-gallegos` | Luis Gallegos |

## Deploy a Vercel

```bash
# Opción 1: Vercel CLI
npm i -g vercel
vercel --prod

# Opción 2: Push a GitHub → Vercel auto-deploya

# Build command: npm run build
# Output directory: dist
# Install command: npm install
```

## Variables de entorno en Vercel

Agrega en Vercel → Project Settings → Environment Variables:
```
VITE_SUPABASE_URL = https://cjztsqlddutkwmdvgayl.supabase.co
VITE_SUPABASE_ANON_KEY = eyJ...
```

## Supabase

- Project: `cjztsqlddutkwmdvgayl`
- Tablas: `voucher_sessions`, `voucher_progress`, `voucher_notes`, `voucher_import_batches`
