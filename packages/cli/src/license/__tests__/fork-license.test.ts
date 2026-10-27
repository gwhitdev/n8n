import { createHash } from 'node:crypto';
import { LICENSE_FEATURES, LICENSE_QUOTAS, type BooleanLicenseFeature } from '@n8n/constants';

import { ForkLicense } from '../fork-license';

const KEY = 'test-fork-key';
const HASH = createHash('sha256').update(KEY).digest('hex');

describe('ForkLicense', () => {
	it('requires a valid hash', () => {
		for (const hash of ['', 'test', 'f'.repeat(63), 'F'.repeat(64)]) {
			expect(() => new ForkLicense(hash)).toThrow();
		}
	});

	it('starts without active entitlements', () => {
		const license = new ForkLicense(HASH);
		expect(license.active).toBe(false);
		expect(license.isLicensed(LICENSE_FEATURES.SHARING)).toBe(false);
		expect(license.getValue('planName')).toBeUndefined();
	});

	it('accepts only the configured key', () => {
		const license = new ForkLicense(HASH);
		expect(license.matches(KEY)).toBe(true);
		expect(license.matches('  ' + KEY + '\n')).toBe(true);
		expect(license.matches('wrong-key')).toBe(false);
		expect(license.matches('')).toBe(false);
		expect(license.matches('x'.repeat(4097))).toBe(false);
		expect(license.active).toBe(false);
	});

	it('restores activation only for the current hash', () => {
		const license = new ForkLicense(HASH);
		license.restore(HASH);
		expect(license.active).toBe(true);
		license.restore(createHash('sha256').update('old-key').digest('hex'));
		expect(license.active).toBe(false);
	});

	it('enables local features and excludes restriction and hosted billing flags', () => {
		const license = new ForkLicense(HASH);
		license.restore(HASH);
		const excluded = new Set<BooleanLicenseFeature>([
			LICENSE_FEATURES.API_DISABLED,
			LICENSE_FEATURES.SHOW_NON_PROD_BANNER,
			LICENSE_FEATURES.AI_CREDITS,
			LICENSE_FEATURES.AI_GATEWAY_CLOUD_UBB,
			LICENSE_FEATURES.AI_ASSISTANT_CLOUD_UBB_ENTITLEMENT,
		]);
		for (const feature of Object.values(LICENSE_FEATURES)) {
			expect(license.isLicensed(feature)).toBe(!excluded.has(feature));
			expect(license.getValue(feature)).toBe(!excluded.has(feature));
		}
	});

	it('sets unlimited count quotas, positive retention, and zero hosted credits', () => {
		const license = new ForkLicense(HASH);
		license.restore(HASH);
		expect(license.getValue(LICENSE_QUOTAS.TEAM_PROJECT_LIMIT)).toBe(-1);
		expect(license.getValue(LICENSE_QUOTAS.WORKFLOWS_WITH_EVALUATION_LIMIT)).toBe(-1);
		expect(license.getValue(LICENSE_QUOTAS.USERS_LIMIT)).toBe(-1);
		expect(license.getValue(LICENSE_QUOTAS.WORKFLOW_HISTORY_PRUNE_LIMIT)).toBeGreaterThan(0);
		expect(license.getValue(LICENSE_QUOTAS.INSIGHTS_RETENTION_PRUNE_INTERVAL_DAYS)).toBeGreaterThan(0);
		expect(license.getValue(LICENSE_QUOTAS.AI_CREDITS)).toBe(0);
		expect(license.getValue(LICENSE_QUOTAS.AI_GATEWAY_BUDGET)).toBe(0);
		expect(license.getValue('planName')).toBe('Fork Local');
	});

	it('removes all local entitlements when cleared', () => {
		const license = new ForkLicense(HASH);
		license.restore(HASH);
		license.restore('');
		expect(license.isLicensed(LICENSE_FEATURES.SOURCE_CONTROL)).toBe(false);
		expect(license.getValue(LICENSE_QUOTAS.USERS_LIMIT)).toBeUndefined();
	});
});
