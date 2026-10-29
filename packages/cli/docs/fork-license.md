# Local fork activation and hosting

This fork supports an operator-controlled activation key. It enables local feature
entitlements through the existing license provider. It does not issue an n8n
Enterprise certificate, a hosted service token, or hosted AI credits.

## Build the fork

Use a machine with Git, Node.js 26, pnpm 12.4.2, and Docker with Buildx and Compose.
On Windows, use WSL2 for the build scripts. Use Docker Desktop with WSL integration.
The build can need substantial RAM and disk space. Build on your PC if the VPS has
limited resources.

```sh
git clone --branch codex/local-fork-license https://github.com/gwhitdev/n8n.git
cd n8n
pnpm install --frozen-lockfile
pnpm build:docker > build.log 2>&1
```

The repository build produces `n8nio/n8n:local` and `n8nio/runners:local`.
The standard downloaded n8n image does not contain this change.
Use the branch name above before merge. After merge, you can use master.

## Create an activation key

Run this once from the repository root:

```sh
node scripts/create-fork-license.mjs
```

This creates `fork-license.env` with a random activation key, its SHA-256 hash,
an encryption key, and a PostgreSQL password. The script does not print the secrets.
It refuses to overwrite an existing file. The file is excluded from Git.

Leave `N8N_LICENSE_ACTIVATION_KEY` in the file for automatic activation on startup.
To activate through the editor, keep a private copy of that value and remove that
line from the file. Start n8n, open Settings, and enter the key in the existing
license activation form. The server stores only the hash in a separate setting.

Manual activation waits for newly licensed modules, routes, auth handlers, and
execution hooks to load. It does not require a container restart. Existing modules
and handlers stay in place. New module tasks use the scheduler's runtime registration.
Queue-mode processes apply the same loading steps when they receive the reload event.

If loading fails, the activation request reports the error. Correct the underlying
configuration or service failure, then submit the same key again. Completed module
initialization and task registration are not repeated during that retry.
Changing deployment configuration, such as the trusted key hash or storage mode,
still requires the normal container redeployment.

Set the same `N8N_FORK_LICENSE_KEY_HASH` on every main, worker, and webhook process.
The persisted hash restores activation after restart. Activation and clear commands
publish the existing license reload event in queue mode. After changing the hash,
restart all processes and activate the new key.

Local mode does not contact the n8n license server. When the hash is unset, n8n uses
the existing SDK and standard activation keys. Existing certificates stay stored.
Local mode does not override user authentication or permission checks.

## Run locally

```sh
docker compose -f compose.fork.yml up -d
```

Open http://localhost:5678 and create the owner account. The local example uses
SQLite and a persistent data volume. It binds only to the local computer.
The example permits cookies over local HTTP.

To stop it without removing your data:

```sh
docker compose -f compose.fork.yml down
```

## Run on a VPS with HTTPS

Install Docker Engine, Buildx, and Compose on the VPS. Point a domain's DNS record
to the VPS. Permit inbound TCP ports 80 and 443. The example uses PostgreSQL and
Caddy. It does not publish the database or the n8n port.

Build the image on the VPS using the build instructions, or transfer the image
from a Linux build machine with the same CPU architecture:

```sh
docker save -o n8n-fork.tar n8nio/n8n:local
scp n8n-fork.tar your-user@your-vps:~/
```

On the VPS:

```sh
docker load -i ~/n8n-fork.tar
git clone --branch codex/local-fork-license https://github.com/gwhitdev/n8n.git
cd n8n
node scripts/create-fork-license.mjs
```

If you built the image on the VPS, stay in that checkout and skip the second clone.
Do not run the generator again if the file already exists.

Add a line to `fork-license.env` with your domain, without a scheme or path:

```dotenv
N8N_DOMAIN=automation.example.com
```

Then start the services:

```sh
docker compose --env-file fork-license.env -f compose.fork-vps.yml up -d
docker compose --env-file fork-license.env -f compose.fork-vps.yml logs --tail=100 n8n
```

Open your HTTPS domain and create the owner account. Caddy obtains and renews the
TLS certificate. This example assumes ports 80 and 443 are free. If you use Coolify,
use its proxy and TLS routing instead of starting a second proxy on those ports.
Keep the n8n hostname, editor URL, webhook URL, and proxy hop count consistent with
that routing.

## Feature limits

The local profile enables local feature flags, including sharing, projects, roles,
SSO integrations, source control, external secrets, and storage integrations.
Configure the corresponding identity providers, Git credentials, secret stores,
storage accounts, and infrastructure before using those features.

Count quotas use the unlimited sentinel. History and insights retention use positive
durations. Hosted credit balances stay at zero. API-disable, non-production banner,
and cloud billing flags stay off.

n8n-hosted AI services and the subscription portal require credentials issued by n8n.
This local key cannot authenticate to them. Cloud-only features, remote feature flags,
and services whose code is absent from this checkout are outside this local profile.

## Backups and updates

Keep the environment file and encryption key private and backed up. Never change
the encryption key for an existing database. Existing credentials need that key.

Back up the n8n data volume. For the VPS example, also back up PostgreSQL:

```sh
docker compose --env-file fork-license.env -f compose.fork-vps.yml exec -T postgres pg_dump -U n8n n8n > n8n-backup.sql
```

Stop n8n before making a consistent SQLite backup. Do not use `down -v` unless you
intend to delete the stored data. Rebuild the fork image after source updates and
recreate the service. Back up the database before an upgrade.

To clear local activation, remove the automatic activation-key line and run the
existing `license:clear` command. Restart the service. To return to standard
licensing, remove the fork hash from the environment and restart all processes.
