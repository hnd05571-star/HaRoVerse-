# HaRoVerse — Mini Test Build

## Setup

```bash
# 1. Install
npm install
npm --prefix server install
npm --prefix client install

# 2. Env
cp .env.example server/.env

# 3. Database
createdb haroverse
npm run db:init   # creates tables + founder + demo invite

# 4. Run (two terminals or one)
npm run dev
