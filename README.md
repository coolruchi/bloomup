# 🌱 BloomUp

**Professional Website Builder + AI Voice Agent Platform**  
Built for local businesses in Durham Region, Ontario.

---

## Quick Start (Local)

```bash
# 1. Copy env file
cp .env.example .env

# 2. Edit .env — add your DATABASE_URL and SESSION_SECRET at minimum

# 3. Install dependencies
npm install

# 4. Start
npm start
# → http://localhost:3000
```

---

## Railway Deployment

### Step 1 — Create Railway Project
1. Go to [railway.app](https://railway.app) → New Project
2. **Add PostgreSQL** database plugin first
3. **Deploy from GitHub** → connect your repo

### Step 2 — Set Environment Variables in Railway
```
DATABASE_URL          → (auto-set by Railway Postgres plugin)
SESSION_SECRET        → generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
NODE_ENV              → production
APP_URL               → https://your-app.railway.app
ADMIN_EMAIL           → your@email.com
ADMIN_PASSWORD        → your-secure-password
ANTHROPIC_API_KEY     → your Claude API key (for AI chat demo)
```

### Step 3 — Optional: Enable Real Phone Calls
```
TWILIO_ACCOUNT_SID    → from twilio.com
TWILIO_AUTH_TOKEN     → from twilio.com
TWILIO_PHONE_NUMBER   → +1XXXXXXXXXX
RETELL_API_KEY        → from retellai.com
RETELL_AGENT_ID       → your Retell agent ID
```

### Step 4 — Deploy
Railway auto-deploys on push. First deploy takes ~2 minutes.

---

## Project Structure

```
bloomup/
├── server.js              # Express app entry point
├── db/index.js            # PostgreSQL schema + connection
├── middleware/auth.js     # Session auth middleware
├── routes/index.js        # All routes (home, builder, voice, auth, admin)
├── views/
│   ├── pages/
│   │   ├── home.ejs       # Homepage
│   │   ├── builder.ejs    # Website builder (Page 2)
│   │   ├── voice-agent.ejs # Voice agent (Page 3)
│   │   ├── login.ejs
│   │   ├── register.ejs
│   │   ├── admin.ejs
│   │   └── admin-leads.ejs
│   └── partials/
│       ├── header.ejs     # Nav + head
│       └── footer.ejs     # Footer + global JS
├── public/css/main.css    # Full design system
├── Dockerfile             # Container config
├── railway.json           # Railway deployment config
└── .env.example           # Environment template
```

---

## Pages

| URL | Description |
|-----|-------------|
| `/` | Homepage — hero, products, pricing, contact |
| `/builder` | Website builder with 10 templates + live preview |
| `/voice-agent` | AI voice agent configurator + Claude chat demo |
| `/auth/login` | Sign in |
| `/auth/register` | Create account |
| `/admin` | Admin dashboard (admin role only) |
| `/admin/leads` | All contact form leads |
| `/demo/:uuid` | Shareable demo site preview |

---

## Adding Real Voice Calls

1. Sign up at [retellai.com](https://retellai.com)
2. Create a phone number via Twilio or use Retell's number
3. Build a base agent in Retell dashboard
4. Add keys to `.env`:
   ```
   RETELL_API_KEY=key_xxx
   TWILIO_PHONE_NUMBER=+1XXXXXXXXXX
   ```
5. Uncomment the Retell code block in `routes/index.js` → `POST /voice-agent/request-call`

---

## Tech Stack

- **Backend**: Node.js + Express
- **Views**: EJS templates
- **Database**: PostgreSQL (Railway managed)
- **Auth**: bcryptjs + express-session
- **AI Chat**: Claude API (claude-haiku)
- **Voice Calls**: Twilio + Retell AI (scaffolded)
- **Images**: Unsplash (direct URLs, copyright-free)
- **Fonts**: Inter + Plus Jakarta Sans (Google Fonts)
- **Deployment**: Docker on Railway

---

## Admin Access

Default admin credentials set via environment variables:
```
ADMIN_EMAIL=admin@bloomup.ca
ADMIN_PASSWORD=changeme123
```
**Change these before going live.**

Admin is created automatically on first server start.

---

© 2026 BloomUp Digital Inc.
