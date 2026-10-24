# Deploying to Coolify

The app ships as one Docker image (`Dockerfile`, node:24-alpine, non-root). On start it runs `node dist/migrate.js && node server.js` on port 3000, so migrations are applied on every deploy.

## 1. Coolify resources

1. **PostgreSQL 17** database. Note its internal connection URL.
2. **MinIO** (S3). Create a **private** bucket named `plants`. Create an access key/secret for the app.
3. **This app**: new application from the Git repository, build pack **Dockerfile**, exposed port **3000**, health check path `/api/health` (returns `{"ok":true}`).

Domain and tunnel setup is left to you. Two URLs must be reachable from the phones: the app (`BETTER_AUTH_URL` / `APP_URL`, HTTPS, needed for PWA and push) and MinIO (see `S3_PUBLIC_ENDPOINT` below).

## 2. Environment variables

Set these on the app resource (runtime variables; nothing is needed at build time).

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Coolify Postgres internal URL, e.g. `postgres://user:pass@host:5432/db` |
| `BETTER_AUTH_SECRET` | Long random string (`openssl rand -base64 48`) |
| `BETTER_AUTH_URL` | Public app URL, e.g. `https://plants.example.com` |
| `APP_URL` | Same public app URL |
| `ANTHROPIC_API_KEY` | Real key; required when `AI_MODE=live` |
| `AI_MODE` | `live` in production (`mock` only for tests). Models: `claude-sonnet-5-5` (identification, care profiles), `claude-haiku-5-5` (reserved). The $20/month cap is editable in the admin screen |
| `S3_ENDPOINT` | Endpoint the server uses to reach MinIO (internal Docker hostname is fine, e.g. `http://minio:9000`) |
| `S3_PUBLIC_ENDPOINT` | Optional. Browser-reachable MinIO URL (e.g. `https://files.example.com`), used only to presign photo URLs. **Set it whenever `S3_ENDPOINT` is an internal hostname** |
| `S3_BUCKET` | `plants` |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | MinIO credentials |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Fresh keys: `npx web-push generate-vapid-keys`. The public key is passed to the browser by the server at runtime |
| `VAPID_SUBJECT` | `mailto:you@example.com` |
| `CRON_SECRET` | Long random string; protects `/api/cron/tick` |

**Photos and the public endpoint.** Photo URLs are signed links opened directly by the phones. If they were signed against an internal hostname such as `http://minio:9000`, images would not load. Expose MinIO publicly (via the tunnel/domain) and set `S3_PUBLIC_ENDPOINT` to that URL; the server keeps using `S3_ENDPOINT` for uploads. Keep the bucket private; access is only through signed URLs.

**Dev-only keys.** The VAPID keys committed in `.env.example`, the vitest config and the e2e seed are for development only. Always generate fresh keys for production.

## 3. Scheduled task (cron)

In Coolify, on the app: Scheduled Tasks, add one with frequency `*/15 * * * *` and command:

```
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/tick
```

It generates due tasks and sends the morning push digests.

## 4. Bootstrap the admin

After the first successful deploy, open the app container terminal in Coolify and run:

```
node dist/create-admin.js --email you@example.com --name Yann --password 'a-long-password'
```

(`npm run create-admin` is the dev equivalent and needs a `.env` file and `tsx`; the container has neither, so it uses the bundled `dist/create-admin.js`, which reads the container's environment.) It creates the admin, the home row and the "Everyone" group.

## 5. First setup in the app

Sign in, then in `/settings/admin`:

1. Check the home (Barcelona, hemisphere N, Europe/Madrid) and the AI budget.
2. Create the groups **Yann + Adriana** and **Marcela** (Everyone already exists; invitees join it automatically).
3. Create the spots (rooms, balcony, ...).
4. Create invite links for Adriana and Marcela (invitees auto-join Everyone; add them to their other group), and send them. There is no email service: share the links yourself.

## 6. Backups

Back up the two stateful pieces: a nightly `pg_dump` of the Postgres database (Coolify's built-in scheduled database backups to S3/local are enough) and a periodic copy of the MinIO `plants` bucket (`mc mirror` to another disk or machine, or Coolify's volume backup). Keep a few weeks of dumps, and do a test restore once. The photos are the only irreplaceable bulky data; everything else is small.

## Local container check

```
cp .env.docker.example .env.docker
docker build -t plants .
docker run --rm --env-file .env.docker --network <compose network> -p 3000:3000 plants
```

Use the compose service names (`db`, `minio`) in `.env.docker` when joining the compose network.
