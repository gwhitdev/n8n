# Run this fork locally with Docker

Use Ubuntu in WSL2 on Windows. Run all commands below in the Ubuntu terminal.
Start Docker Desktop and enable Ubuntu under Settings > Resources > WSL Integration.

This setup uses the `codex/local-fork-license` branch.
The `master` branch does not yet contain the local activation script.
The branch includes [activation and VPS hosting details](packages/cli/docs/fork-license.md).

## 1. Check the build tools

Install Git, Node.js 24 or newer, and Docker with Buildx and Compose.
Use your existing nvm installation to select a supported Node.js version.
Install the pnpm version from the root `packageManager` field:

```sh
npm install -g pnpm@12.4.2
hash -r
node --version
pnpm --version
git --version
docker version
docker buildx version
docker compose version
```

The Docker version output must show both Client and Server.

## 2. Clone the fork

```sh
mkdir -p ~/projects
cd ~/projects
git clone --branch codex/local-fork-license https://github.com/gwhitdev/n8n.git
cd n8n
```

If you already cloned the repository, use that checkout instead.
Commit or save any local changes before switching branches:

```sh
cd ~/projects/n8n
git status --short
git fetch origin
git switch codex/local-fork-license
git pull --ff-only origin codex/local-fork-license
```

The upstream remote is optional.
Check `git remote -v` before you add it:

```sh
git remote add upstream https://github.com/n8n-io/n8n.git
```

If Git reports that upstream already exists, check its URL.
Do not add it again.

## 3. Install and build

Run from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build:docker > build.log 2>&1
```

Wait for each command to finish successfully before continuing.
The build creates `n8nio/n8n:local` and `n8nio/runners:local`.
To inspect a failed build:

```sh
tail -n 60 build.log
```

If you previously built master, rebuild after switching to the fork branch.

## 4. Create the local activation file

Run this once:

```sh
node scripts/create-fork-license.mjs
```

The script creates `fork-license.env`.
It contains the local activation key, its hash, and other deployment secrets.
The script refuses to overwrite an existing file.
Keep the file private and back it up.
Git ignores this file.

The Compose service loads this file.
Leave `N8N_LICENSE_ACTIVATION_KEY` in the file for automatic activation.
You do not need to copy a key into the editor for this setup.

The local profile enables the feature flags implemented by this fork.
Hosted AI services and credits still require credentials from n8n.
See the [feature limits](packages/cli/docs/fork-license.md#feature-limits).

## 5. Start the container

```sh
docker compose -f compose.fork.yml config --quiet
docker compose -f compose.fork.yml up -d
docker compose -f compose.fork.yml ps
docker compose -f compose.fork.yml logs --tail=100 n8n
```

Open http://localhost:5678 in your Windows browser.
Create the owner account.
The service listens only on the local computer.
Compose uses the locally built image and does not download a replacement.

This Compose setup creates a separate persistent volume for the n8n database.
It does not use the `n8n_fork_data` volume from a previous manual `docker run`.
If that earlier container is running, stop it first to release port 5678:

```sh
docker stop n8n-fork
```

Run that command only if you created a container named `n8n-fork`.
Keep its volume and container if you need the previous data.
Do not attach an existing database to a newly generated encryption key.
Existing credentials require the original key.

## Stop, restart, and update

Run these commands from the same checkout.
To stop the service without deleting its data:

```sh
docker compose -f compose.fork.yml down
```

To start it again:

```sh
docker compose -f compose.fork.yml up -d
```

Back up the data volume and `fork-license.env` before an update.
Stop n8n before you back up its SQLite database.
Do not use `down -v`: it deletes the Compose data volume.

To update a clean checkout and rebuild:

```sh
git pull --ff-only origin codex/local-fork-license
pnpm install --frozen-lockfile
pnpm build:docker > build.log 2>&1
docker compose -f compose.fork.yml up -d --force-recreate
```

Continue to the next command only when the previous command succeeds.
Keep the existing activation file and encryption key.

## Troubleshooting

### pnpm is not found

Install pnpm in the active nvm Node.js installation:

```sh
npm install -g pnpm@12.4.2
hash -r
pnpm --version
```

### Docker socket permission denied

Check the socket owner and your groups:

```sh
ls -l /var/run/docker.sock
id
```

If the socket belongs to the docker group, add your user to that group:

```sh
sudo groupadd -f docker
sudo usermod -aG docker "$USER"
newgrp docker
docker version
```

Docker group membership grants administrator-level access through Docker.
See [Docker's Linux setup instructions](https://docs.docker.com/engine/install/linux-postinstall/).

If Docker is unavailable in Ubuntu, check Docker Desktop's WSL integration.

### The activation script is missing

Check the active branch:

```sh
git branch --show-current
```

Switch to `codex/local-fork-license` with the instructions above.
Rebuild the image from that branch.

### The local image is missing

Check the build output and loaded images:

```sh
tail -n 60 build.log
docker image inspect n8nio/n8n:local --format '{{.Id}}'
```

Run `pnpm build:docker` successfully before starting Compose.
If you changed the build image name or tag, update `compose.fork.yml` to match.
