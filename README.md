# ⚔️ Nimblade

> Roguelite **Rock–Paper–Scissors** dungeon crawler — built as a [Nimiq Pay](https://nimiq.com) mini-app.

🎮 **Play live:** [nimblade.vercel.app](https://nimblade.vercel.app/)

---

## What is Nimblade?

Pick a weapon, climb the dungeons, defeat the Demon Lord. Each fight is a stylized RPS duel — your blade choice, timing, and upgrades decide the winner. Mobile-first, designed to feel native inside the Nimiq Pay app.

- ��️ **RPS combat** with weapon-based modifiers
- �� **Procedural dungeon climb** with relics & gold
- �� **2-tier leaderboard** — Official (wallet) + Practice (device-id), with one-click migration when you connect a wallet
- �� **NIM in-app purchases** — Sharpen Stone (+5 HP, 5 NIM) and cosmetic skins (50 NIM each)
- �� **Mobile-first** — viewport-locked, touch controls, iOS-safe

---

## Tech stack

| Layer        | Tool                          |
| ------------ | ----------------------------- |
| Build        | [Vite](https://vitejs.dev)    |
| Frontend     | Vanilla JS + CSS              |
| Backend / DB | [Supabase](https://supabase.com) (Postgres + RLS) |
| Wallet / Pay | [`@nimiq/mini-app-sdk`](https://www.npmjs.com/package/@nimiq/mini-app-sdk) |
| Hosting / CI | [Vercel](https://vercel.com) (auto-deploy on `main`) |

---

## Project structure

```
nimblade/
├── public/              # Static assets (sprites, audio)
├── src/
│   ├── main.js          # Entry point
│   ├── supabase.js      # DB client + sync helpers
│   ├── game/            # Game logic (combat, dungeon, RPS)
│   └── ui/              # Screens, HUD, menus
├── db/
│   └── 001_init.sql     # Supabase schema (tables + RPCs + RLS)
├── index.html
├── vite.config.js
└── package.json
```

---

## Local development

```bash
# 1. Clone
git clone https://github.com/Muridx/Nimblade.git
cd Nimblade

# 2. Install deps
npm install

# 3. Add env vars
cp .env.example .env
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# 4. Apply DB schema
# Open Supabase Dashboard → SQL Editor → paste db/001_init.sql → Run

# 5. Run dev server
npm run dev
# → http://localhost:5173
```

---

## Deploy

Push to `main` → Vercel auto-deploys to [nimblade.vercel.app](https://nimblade.vercel.app/).

Required Vercel env vars (Production + Preview):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

---

## License

[MIT](./LICENSE) © 2026 Murid