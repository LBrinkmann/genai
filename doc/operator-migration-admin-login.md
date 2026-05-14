# Operator migration: ACCESS_KEY → admin login

## Why

The old `ACCESS_KEY` query-parameter flow (`?key=...`) is gone. It was a
single shared secret that lived in the URL bar and gated nothing more than
the frontend "Reset" affordance.

It has been replaced by a proper cookie-session admin login that gates:

- **Reset conversation** (server-side, was a frontend flag before).
- **HuggingFace Inference Endpoint controls** — Start/Stop the fine-tuned
  model endpoint directly from the gear menu.
- **CSV export** routes (`/api/export/*`).

The login is username + password, bcrypt-hashed at rest, signed cookie in
the browser. Plaintext never lives in `.env`.

## One-time server setup

Run these steps once on the production server (Hetzner VPS or wherever the
stack lives). Working directory: the repo root that holds `docker-compose.yml`.

1. **SSH into the server.**

   ```bash
   ssh root@<your-server>
   cd /opt/genai   # or wherever the repo is checked out
   ```

2. **Generate `ADMIN_PASSWORD_HASH`.** The helper prompts interactively via
   `getpass` and prints the bcrypt hash to stdout. The compose service is
   named `backend`:

   ```bash
   docker compose exec backend python scripts/hash_password.py
   ```

   Copy the hash. Keep the plaintext password in your password manager —
   it is never stored on the server.

3. **Generate `SESSION_SECRET`** (32 random bytes, hex-encoded):

   ```bash
   python3 -c "import secrets; print(secrets.token_hex(32))"
   ```

4. **Edit the server's `.env`.** Add the new admin block and remove any
   leftover `ACCESS_KEY=` line:

   ```dotenv
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD_HASH=$2b$12$...              # from step 2
   SESSION_SECRET=<hex from step 3>
   COOKIE_SECURE=true                          # HTTPS only in prod
   TRUST_PROXY=true                            # Caddy sits in front
   ```

   Delete the old line if present:

   ```dotenv
   # ACCESS_KEY=...   ← remove
   ```

5. **Rebuild and restart** so the new env vars reach the backend container:

   ```bash
   docker compose down
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
   ```

6. **Verify.** Browse to the chat domain, click the gear icon in the
   top-right, choose **Log in**, and confirm the admin UI appears with the
   endpoint controls and Reset action.

## Rollback

There is no rollback for the auth mechanism itself — the `ACCESS_KEY`
code path has been deleted from the backend and frontend.

If the admin password is lost, repeat step 2 with a new password, update
`ADMIN_PASSWORD_HASH` in `.env`, and redeploy with step 5. The session
cookie does not need to be rotated unless `SESSION_SECRET` was also
compromised; rotating it logs everyone out, which is fine for a
single-operator deployment.
