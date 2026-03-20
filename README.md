# 🩺 GlucoTrack — Paediatric Diabetes Log

A patient-facing glucose and insulin logging app with a physician dashboard.  
Built with **React + Vite + Supabase + Vercel**.

---

## Features

**Patient side**
- Register with demographics (DOB, weight, regimen, physician)
- Log AM and PM glucose (mg/dL) + insulin doses daily
- Regimen-aware form: NPH/Regular, Basal-Bolus, Premixed, Pump
- View own history with colour-coded RBS flags

**Physician dashboard**
- See all registered patients at a glance
- Flagged out-of-range readings highlighted
- Click into any patient for full history + trend chart
- Export patient data to CSV

---

## Setup Instructions

### Step 1 — Supabase

1. Go to [supabase.com](https://supabase.com) and create a free account + new project
2. Open **SQL Editor** in the Supabase dashboard
3. Paste the entire contents of `SUPABASE_SETUP.sql` and click **Run**
4. Go to **Project Settings > API** and copy:
   - **Project URL**
   - **anon public key**

### Step 2 — Local setup

```bash
# Clone or download this folder, then:
cd glucotrack

# Install dependencies
npm install

# Copy the env template
cp .env.example .env
```

Open `.env` and fill in your Supabase credentials:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

```bash
# Run locally
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### Step 3 — Create a doctor account

1. Go to **Supabase > Authentication > Users**
2. Click **"Invite user"** → enter the doctor's email
3. They'll receive an email to set a password
4. Once done, go to **SQL Editor** and run:

```sql
insert into public.profiles (id, role, full_name)
select id, 'doctor', 'Dr. Smith'
from auth.users where email = 'doctor@clinic.com';
```

Replace the name and email. That's it — they can now log in and see all patients.

### Step 4 — Deploy to Vercel

1. Push this folder to a **GitHub repo**
2. Go to [vercel.com](https://vercel.com) → **New Project** → import your repo
3. In **Environment Variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Click **Deploy** ✓

Vercel auto-deploys on every GitHub push from then on.

---

## RBS Reference Ranges (mg/dL)

| Status | Range |
|--------|-------|
| 🔵 Low | < 70 |
| 🟢 Normal | 70–150 |
| 🟡 Borderline | 151–200 |
| 🔴 High | > 200 |

---

## Tech Stack

- React 18 + Vite
- Supabase (Postgres + Auth + RLS)
- Recharts (glucose trend chart)
- date-fns
- React Router v6
- Deployed on Vercel
