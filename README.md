# CVIF Auth Backend (Phase 1)

Tech: Node.js, Express, MongoDB, Mongoose, JWT, bcrypt, dotenv.

## Setup

1. Install dependencies:
   - `npm i`

2. Create `.env` (start from `.env.example`):
   - `PORT=3000`
   - `MONGODB_URI=mongodb://127.0.0.1:27017/cvif`
   - `JWT_SECRET=...`

3. Run:
   - Dev: `npm run dev`
   - Prod: `npm start`

## API

### POST `/api/auth/register`

Body:
```json
{ "username": "PlayerOne", "email": "p@x.com", "password": "secret1" }
```

Response (201):
```json
{ "success": true, "user_id": "..." }
```

### POST `/api/auth/login`

Body:
```json
{ "username": "PlayerOne", "password": "secret1", "ip": "1.2.3.4" }
```

Success:
```json
{ "success": true, "token": "...", "user_id": "..." }
```

Failure:
```json
{ "success": false, "message": "reason" }
```

## Phase 3 APIs (Jobs + Economy)

All write endpoints below require a session token from `/api/auth/login`:
- Header: `Authorization: Bearer <token>`
- Body must include `username` (Minecraft name) or `user_id`

### POST `/api/job/select`

Body:
```json
{ "username": "PlayerOne", "job1": "Miner", "job2": "Hunter" }
```

### GET `/api/job/:user_id`

Response:
```json
{ "success": true, "user_id": "...", "jobs": ["Miner","Hunter"] }
```

### POST `/api/economy/earn`

Body:
```json
{ "username": "PlayerOne", "action": "block_break:stone", "amount": 2, "job_type": "Miner" }
```

### GET `/api/economy/balance/:user_id`

Response:
```json
{ "success": true, "user_id": "...", "balance": 10 }
```

## Notes

- Username is stored case-sensitive and cannot be changed (no update endpoint in Phase 1).
- Only one active session per user (new login deletes old sessions).
- Sessions expire in 24 hours (JWT `exp`) and MongoDB TTL index on `expires_at`.




## Admin APIs (Debug/Monitoring)

All admin endpoints require:
- Header: Authorization: Bearer <token>
- The token user must have role=admin

### GET /api/admin/transactions
Query params:
- page, limit (max 100)
- user_id
- action
- start_date (ISO)
- end_date (ISO)

### GET /api/admin/actions
Query params:
- page, limit (max 100)
- user_id
- action

### GET /api/admin/suspicious
Returns basic heuristic flags based on recent transactions.


### POST /api/admin/role
Admin-only: set a user's role.
Body:
{ "user_id": "...", "role": "admin" }
(or)
{ "username": "PlayerOne", "role": "admin" }

## RBAC (Access Control Matrix)

Roles: owner > admin > officer > player

Admin routes:
- GET /api/admin/transactions -> admin, owner
- GET /api/admin/actions -> admin, owner
- GET /api/admin/suspicious -> officer, admin, owner
- POST /api/admin/role -> owner only

Notes:
- Role is taken from req.user (server-side session lookup). Never trust role from request body.
- Role change cannot modify an owner account.

## Owner Initialization

Create the first owner from an existing registered user:
- `node scripts/createOwner.js`

Force replace the current owner (demotes existing owner(s) to admin):
- `node scripts/createOwner.js --force`

Notes:
- The script will not create a new user; it only promotes an existing user.
- Only one owner is allowed; use --force to replace the owner safely.

## Production Hardening (Owner Setup)

Environment:
- `OWNER_SETUP_SECRET` (required to run owner setup CLI)

Owner setup CLI examples:
- Create first owner (interactive):
  - `node scripts/createOwner.js --secret YOUR_SECRET`
- Create first owner (non-interactive):
  - `node scripts/createOwner.js --secret YOUR_SECRET --username PlayerOne`
  - `node scripts/createOwner.js --secret YOUR_SECRET --email p@x.com`
- Dry run:
  - `node scripts/createOwner.js --secret YOUR_SECRET --username PlayerOne --dry-run`
- Force replace current owner (requires typing confirmations):
  - `node scripts/createOwner.js --secret YOUR_SECRET --username PlayerOne --force`

Audit logging:
- Role changes and owner setup write to `AdminAuditLog`.
\n\n## AuthCore Bridge (Minecraft)\n\n### POST /api/auth/minecraft-sync\nCalled by the Fabric mod after AuthCore authentication to create/update a CVIF user and return a CVIF session token.\n\nRequired env for dashboard cookies (cross-domain):\n- CORS_ORIGINS=comma,separated,origins\n- COOKIE_SAMESITE=none\n- COOKIE_SECURE=true\n\n
