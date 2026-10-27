import { createHash, timingSafeEqual } from 'node:crypto';

import {
	LICENSE_FEATURES,
	LICENSE_QUOTAS,
	UNLIMITED_LICENSE_QUOTA,
	type BooleanLicenseFeature,
	type NumericLicenseFeature,
} from '@n8n/constants';

import type { FeatureReturnType } from '../license';

// These flags restrict an instance or select n8n-hosted billing.
const EXCLUDED_FEATURES = new Set<BooleanLicenseFeature>([
	LICENSE_FEATURES.API_DISABLED,
	LICENSE_FEATURES.SHOW_NON_PROD_BANNER,
	LICENSE_FEATURES.AI_CREDITS,
	LICENSE_FEATURES.AI_GATEWAY_CLOUD_UBB,
	LICENSE_FEATURES.AI_ASSISTANT_CLOUD_UBB_ENTITLEMENT,
]);

// Durations must stay positive. Hosted credit balances must stay at zero.
const QUOTAS: Record<NumericLicenseFeature, number> = {
	[LICENSE_QUOTAS.TRIGGER_LIMIT]: UNLIMITED_LICENSE_QUOTA,
	[LICENSE_QUOTAS.VARIABLES_LIMIT]: UNLIMITED_LICENSE_QUOTA,
	[LICENSE_QUOTAS.USERS_LIMIT]: UNLIMITED_LICENSE_QUOTA,
	[LICENSE_QUOTAS.WORKFLOW_HISTORY_PRUNE_LIMIT]: 36500,
	[LICENSE_QUOTAS.TEAM_PROJECT_LIMIT]: UNLIMITED_LICENSE_QUOTA,
	[LICENSE_QUOTAS.AI_CREDITS]: 0,
	[LICENSE_QUOTAS.AI_GATEWAY_BUDGET]: 0,
	[LICENSE_QUOTAS.INSIGHTS_MAX_HISTORY_DAYS]: 36500,
	[LICENSE_QUOTAS.INSIGHTS_RETENTION_MAX_AGE_DAYS]: 36500,
	[LICENSE_QUOTAS.INSIGHTS_RETENTION_PRUNE_INTERVAL_DAYS]: 24,
	[LICENSE_QUOTAS.WORKFLOWS_WITH_EVALUATION_LIMIT]: UNLIMITED_LICENSE_QUOTA,
	[LICENSE_QUOTAS.EVALUATION_CONCURRENCY_LIMIT]: UNLIMITED_LICENSE_QUOTA,
};

export class ForkLicense {
	active = false;

	private readonly features: FeatureReturnType = { planName: 'Fork Local', ...QUOTAS };

	constructor(readonly keyHash: string) {
		if (!/^[a-f0-9]{64}$/.test(keyHash)) {
			throw new Error('N8N_FORK_LICENSE_KEY_HASH must contain 64 lowercase hexadecimal characters');
		}
		for (const feature of Object.values(LICENSE_FEATURES)) {
			this.features[feature] = !EXCLUDED_FEATURES.has(feature);
		}
	}

	matches(key: string): boolean {
		if (typeof key !== 'string' || key.length === 0 || key.length > 4096) return false;
		const actual = createHash('sha256').update(key.trim()).digest();
		return timingSafeEqual(actual, Buffer.from(this.keyHash, 'hex'));
	}

	restore(storedHash: string): void {
		this.active = storedHash === this.keyHash;
	}

	isLicensed(feature: BooleanLicenseFeature): boolean {
		return this.active && this.features[feature] === true;
	}

	getValue<T extends keyof FeatureReturnType>(feature: T): FeatureReturnType[T] {
		return this.active ? this.features[feature] : undefined;
	}
}
