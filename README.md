# AgriTrade

Digital Credit and Inventory System for Cereal Traders in Ghana.

- `server/` — Express + TypeScript + Mongoose REST API
- `client/` — React + Vite + Tailwind frontend

## Dev setup

1. MongoDB running locally **as a replica set** on mongodb://localhost:27017 (see below)
2. `cd server && npm install && npm run dev`
3. `cd client && npm install && npm run dev`

### MongoDB must be a replica set

Financial operations (advances, repayments, sales, payments) write their
source document and a ledger `transactions` entry in one multi-document
MongoDB transaction, which MongoDB only supports on replica sets. MongoDB
Atlas is a replica set by default; a plain local `mongod` is not. For local
dev, either:

```sh
mongod --replSet rs0 --dbpath <your-db-path>
mongosh --eval "rs.initiate()"   # once, on first setup
```

or, if MongoDB runs as a Windows service, add `replication: { replSetName: rs0 }`
to `mongod.cfg`, restart the service, then run `mongosh --eval "rs.initiate()"`.

The server logs a warning at startup if the connected MongoDB is not a
replica set. Tests use an in-memory replica set automatically.
