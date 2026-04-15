<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Roadmap access control — how passwords work

Every client roadmap at `/roadmap/<clientId>/<projectId>` is gated by a password
login. Admin access (`?edit=1`) is gated by a separate `ADMIN_PASSWORD`.

## Where passwords live

Client passwords are stored in the `CLIENT_PASSWORDS` **Vercel env var** as a
single JSON string. Format:

```
{"<clientId>/<projectId>":"<password>", ...}
```

The app reads this via `getRoadmapPassword()` in `src/lib/googleSheets.js`.
Auth cookies are HMAC-signed using `ROADMAP_AUTH_SECRET` (`src/lib/authCookie.js`).

## Adding a password for a new client

1. Find the client's `clientId` and `projectId` by opening their roadmap
   (`?edit=1` works) and looking at the URL — everything between `/roadmap/`
   and the query string.
2. Pick a password to share with the client. Memorable-ish is fine
   (e.g. `ClientName2026`).
3. Go to https://vercel.com → `vicar-roadmap` project → **Settings** →
   **Environment Variables**.
4. Find `CLIENT_PASSWORDS`, click edit, add a new key/value pair to the JSON:
   ```
   "clientId/projectId":"new-password"
   ```
   Keep it valid JSON — no trailing commas, double-quoted strings.
5. Save.
6. Go to **Deployments** → click ⋯ on the latest deploy → **Redeploy**. Env
   var changes do not auto-trigger a rebuild.
7. Send the client their URL + password.

## Changing or revoking a password

Edit the value in `CLIENT_PASSWORDS`, Save, Redeploy. Existing cookies for
that client invalidate automatically because the password is baked into the
HMAC.

## Never do this

- **Do not put passwords in the Google Sheet** (the CSV is published publicly).
- **Do not commit passwords to the repo.**
- **Do not share the `ADMIN_PASSWORD`** with clients — that unlocks the
  builder for every project.
