#!/usr/bin/env node
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const key = randomUUID();
const hash = createHash('sha256').update(key).digest('hex');
const contents = [
	'# Keep this file private. Do not commit it.',
	`N8N_FORK_LICENSE_KEY_HASH=${hash}`,
	`N8N_LICENSE_ACTIVATION_KEY=${key}`,
	`N8N_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`,
	`POSTGRES_PASSWORD=${randomBytes(24).toString('hex')}`,
	'GENERIC_TIMEZONE=Europe/London',
	'TZ=Europe/London',
	'',
].join('\n');

// Do not overwrite an existing key. Losing it can change activation state.
writeFileSync('fork-license.env', contents, { flag: 'wx', mode: 0o600 });
console.log('Created fork-license.env. Keep it private.');
console.log('Use it as the Compose env_file, or remove the activation-key line and enter that key in Settings.');
