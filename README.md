# AgriTrade 🌾

A digital credit and inventory system for cereal traders in Ghana. It replaces paper notebooks with a simple web app for tracking farmers, customers, cash advances, repayments, credit sales, payments, and stock — with every financial movement recorded in an append-only ledger.

## Features

- **Farmer & customer records** — contact details, villages, and full transaction history per person
- **Cash advances & repayments** — lend to farmers against future harvests and track what's owed
- **Credit sales & payments** — sell stock to customers on credit and collect over time
- **Inventory** — per-crop stock levels (maize, rice, millet, sorghum, soybeans)
- **Reports & dashboard** — outstanding balances, aging, stock, and season summaries
- **Audit-safe ledger** — money amounts are stored as integer pesewas (no floating-point errors), records are never deleted, and every financial write goes into a `transactions` ledger inside a database transaction

## Tech stack

| Layer    | Technology                                                    |
| -------- | ------------------------------------------------------------- |
| Backend  | Node.js, Express 5, TypeScript, Mongoose (MongoDB), Zod, JWT  |
| Frontend | React 19, Vite, TypeScript, Tailwind CSS, Radix UI            |
| Testing  | Vitest, Supertest, mongodb-memory-server                      |

## Project structure

```text
agritrade/
├── server/   # REST API (Express + TypeScript + Mongoose)
└── client/   # Web app (React + Vite + Tailwind)
```

## Getting started

### Prerequisites

You'll need these installed:

- [Node.js](https://nodejs.org/) 20 or newer (includes npm)
- [MongoDB Community Server](https://www.mongodb.com/try/download/community) (includes `mongod`; install [mongosh](https://www.mongodb.com/try/download/shell) too if your installer doesn't bundle it)

### 1. Clone and install

```sh
git clone <your-repo-url> agritrade
cd agritrade

cd server && npm install
cd ../client && npm install
```

### 2. Configure the server

Copy the example environment file and fill it in:

```sh
cd server
cp .env.example .env        # on Windows: copy .env.example .env
```

Open `server/.env` and set `JWT_SECRET` to a long random string. You can generate one with:

```sh
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

The other defaults work as-is for local development. The client needs no setup — `client/.env.development` already points at `http://localhost:5000/api`.

### 3. Start MongoDB (as a replica set — important!)

AgriTrade uses **multi-document transactions** (each advance, repayment, sale, or payment writes its source record *and* a ledger entry atomically). MongoDB only supports transactions on a **replica set**, and a plain local `mongod` isn't one.

**Easiest option (Windows):** this repo ships a helper that starts a separate, self-contained single-node replica set on port **27018** (it won't touch any existing MongoDB service):

```sh
cd server
npm run db:dev
```

Data lives under `%USERPROFILE%\.agritrade-mongo`. It doesn't survive a reboot — just run `npm run db:dev` again. If you use this option, make sure `server/.env` has:

```ini
MONGODB_URI=mongodb://127.0.0.1:27018/agritrade?directConnection=true
```

(MongoDB Compass can connect with that same string.)

**Other options:**

- **MongoDB Atlas** (free tier): Atlas clusters are replica sets by default — just paste your connection string into `MONGODB_URI`.
- **Manual local replica set:**

  ```sh
  mongod --replSet rs0 --dbpath <your-db-path>
  mongosh --eval "rs.initiate()"   # once, on first setup
  ```

  Or, if MongoDB runs as a Windows service, add `replication: { replSetName: rs0 }` to `mongod.cfg`, restart the service, then run `mongosh --eval "rs.initiate()"`.

The server logs a warning at startup if the connected MongoDB is not a replica set.

### 4. Seed the database

From `server/`, pick one:

```sh
npm run seed        # just the admin user
npm run seed:demo   # admin user + realistic demo data (farmers, customers, seasons of transactions)
```

### 5. Run the app

Open two terminals:

```sh
# Terminal 1 — API (http://localhost:5000)
cd server && npm run dev

# Terminal 2 — web app (http://localhost:5173)
cd client && npm run dev
```

Then open **<http://localhost:5173>** in your browser.

## Default credentials

The seed scripts create this admin account:

| Field    | Value                   |
| -------- | ----------------------- |
| Email    | `admin@agritrade.local` |
| Password | `ChangeMe123!`          |

> ⚠️ These are for **local development only**. Change them before deploying anywhere public — you can override them at seed time with the `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` environment variables (see `server/.env.example`).

## Environment variables (server)

| Variable              | Description                                              | Default                               |
| --------------------- | -------------------------------------------------------- | ------------------------------------- |
| `PORT`                | API port                                                 | `5000`                                |
| `MONGODB_URI`         | MongoDB connection string (must be a replica set)        | `mongodb://localhost:27017/agritrade` |
| `JWT_SECRET`          | Secret for signing auth tokens — **set your own**        | —                                     |
| `JWT_EXPIRES_IN`      | Token lifetime                                           | `1d`                                  |
| `CLIENT_ORIGIN`       | Allowed CORS origin (the web app URL)                    | `http://localhost:5173`               |
| `TRUST_PROXY`         | Set `true` behind a reverse proxy (Render/Railway/nginx) | `false`                               |
| `SEED_ADMIN_EMAIL`    | Admin email created by the seed scripts                  | `admin@agritrade.local`               |
| `SEED_ADMIN_PASSWORD` | Admin password created by the seed scripts               | `ChangeMe123!`                        |

## Useful scripts

**Server** (`cd server`):

| Command             | What it does                                        |
| ------------------- | --------------------------------------------------- |
| `npm run dev`       | Start the API with auto-reload                      |
| `npm test`          | Run the test suite (uses an in-memory MongoDB)      |
| `npm run seed`      | Create the admin user                               |
| `npm run seed:demo` | Create the admin user plus realistic demo data      |
| `npm run db:dev`    | Start the local dev MongoDB replica set (Windows)   |
| `npm run build`     | Compile TypeScript to `dist/`                       |

**Client** (`cd client`):

| Command         | What it does                     |
| --------------- | -------------------------------- |
| `npm run dev`   | Start the dev server (Vite)      |
| `npm run build` | Production build                 |
| `npm run lint`  | Lint with oxlint                 |

## Testing

```sh
cd server && npm test
```

Tests spin up an in-memory MongoDB replica set automatically — no local database or setup needed.

## Troubleshooting

- **"Transaction numbers are only allowed on a replica set"** — your MongoDB is running standalone. See [step 3](#3-start-mongodb-as-a-replica-set--important).
- **Login fails with the default credentials** — the database hasn't been seeded. Run `npm run seed` (or `npm run seed:demo`) from `server/`.
- **Client can't reach the API** — make sure the server is running on port 5000 and `CLIENT_ORIGIN` in `server/.env` matches the client URL.
- **`npm run db:dev` data gone after reboot** — expected; the dev mongod doesn't run as a service. Run `npm run db:dev` again (your data on disk is kept).

## License

No license has been chosen yet. If you plan to make this repo public, consider adding one (e.g. MIT).
