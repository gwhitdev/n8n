import { createHash } from 'node:crypto';
import { mockLogger } from '@n8n/backend-test-utils';
import type { GlobalConfig } from '@n8n/config';
import { LICENSE_FEATURES } from '@n8n/constants';
import type { SettingsRepository } from '@n8n/db';
import { LicenseManager } from '@n8n_io/license-sdk';
import type { InstanceSettings } from 'n8n-core';
import { mock } from 'vitest-mock-extended';

import { License } from '@/license';

vi.mock('@n8n_io/license-sdk');

const KEY = 'test-fork-key';
const HASH = createHash('sha256').update(KEY).digest('hex');

describe('Fork license activation', () => {
	let storedHash: string;
	let repository: ReturnType<typeof mock<SettingsRepository>>;

	const createLicense = (hash = HASH) =>
		new License(
			mockLogger(),
			mock<InstanceSettings>({ instanceType: 'main', isLeader: true }),
			repository,
			mock(),
			mock<GlobalConfig>({
				license: { forkKeyHash: hash },
				executions: { mode: 'regular' },
			}),
		);

	beforeEach(() => {
		vi.clearAllMocks();
		storedHash = '';
		repository = mock<SettingsRepository>();
		repository.getForkLicenseKeyHash.mockImplementation(async () => storedHash);
		repository.setForkLicenseKeyHash.mockImplementation(async (value) => {
			storedHash = value;
		});
	});

	it('does not contact the standard license server in local mode', async () => {
		const license = createLicense();
		await license.init();
		expect(LicenseManager).not.toHaveBeenCalled();
		expect(license.isLicensed(LICENSE_FEATURES.SHARING)).toBe(false);
	});

	it('activates through the existing method and persists only the hash', async () => {
		const license = createLicense();
		await license.init();
		const refreshed = vi.fn();
		license.onCertRefresh(refreshed);
		await license.activate(KEY);
		expect(storedHash).toBe(HASH);
		expect(repository.setForkLicenseKeyHash).toHaveBeenCalledWith(HASH);
		expect(license.isLicensed(LICENSE_FEATURES.SHARING)).toBe(true);
		expect(license.hasFeatureInCert(LICENSE_FEATURES.SOURCE_CONTROL)).toBe(true);
		expect(license.isCertValid()).toBe(true);
		expect(license.getPlanName()).toBe('Fork Local');
		expect(refreshed).toHaveBeenCalledWith('');
		expect(await license.loadCertStr()).toBe('');
		expect(license.getManagementJwt()).toBe('');
	});

	it('rejects a wrong key without changing stored state', async () => {
		const license = createLicense();
		await license.init();
		await expect(license.activate('wrong')).rejects.toThrow('does not match');
		expect(repository.setForkLicenseKeyHash).not.toHaveBeenCalled();
		expect(license.isCertValid()).toBe(false);
	});

	it('does not activate when persistence fails', async () => {
		const license = createLicense();
		await license.init();
		repository.setForkLicenseKeyHash.mockRejectedValueOnce(new Error('Database unavailable'));
		await expect(license.activate(KEY)).rejects.toThrow('Database unavailable');
		expect(license.isCertValid()).toBe(false);
	});

	it('restores activation on another process and after renewal', async () => {
		const first = createLicense();
		await first.init();
		await first.activate(KEY);
		const second = createLicense();
		await second.init();
		await second.renew();
		await second.renewIfDue();
		expect(second.isLicensed(LICENSE_FEATURES.SOURCE_CONTROL)).toBe(true);
		expect(LicenseManager).not.toHaveBeenCalled();
	});

	it('clears persisted activation and reloads it in another process', async () => {
		const first = createLicense();
		await first.init();
		await first.activate(KEY);
		const second = createLicense();
		await second.init();
		await first.clear();
		await second.reload();
		expect(storedHash).toBe('');
		expect(first.isCertValid()).toBe(false);
		expect(second.isCertValid()).toBe(false);
	});

	it('requires activation again after the configured key changes', async () => {
		const first = createLicense();
		await first.init();
		await first.activate(KEY);
		const second = createLicense(createHash('sha256').update('new-key').digest('hex'));
		await second.init();
		expect(second.isCertValid()).toBe(false);
	});

	it('leaves the standard SDK path enabled when local mode is unset', async () => {
		const license = createLicense('');
		await license.init();
		await license.activate('standard-key');
		expect(LicenseManager).toHaveBeenCalled();
		expect(LicenseManager.prototype.activate).toHaveBeenCalledWith('standard-key', {
			eulaUri: undefined,
			email: undefined,
		});
	});
	it('waits for runtime feature loading and reports its failures', async () => {
		const license = createLicense();
		await license.init();
		let resolve!: () => void;
		const ready = new Promise<void>((done) => { resolve = done; });
		let notifyStarted!: () => void;
		const started = new Promise<void>((done) => { notifyStarted = done; });
		const refresh = vi.fn().mockImplementationOnce(async () => {
			notifyStarted();
			await ready;
		});
		license.onLocalFeatureChange(refresh);
		let completed = false;
		const activation = license.activate(KEY).then(() => { completed = true; });
		await started;
		expect(completed).toBe(false);
		resolve();
		await activation;
		expect(refresh).toHaveBeenCalledOnce();
		refresh.mockRejectedValueOnce(new Error('Runtime module unavailable'));
		await expect(license.activate(KEY)).rejects.toThrow('Runtime module unavailable');
		await expect(license.activate(KEY)).resolves.toBeUndefined();
	});

	it('loads local features when another process reloads the stored activation', async () => {
		const first = createLicense();
		const second = createLicense();
		await first.init();
		await second.init();
		const refresh = vi.fn().mockResolvedValue(undefined);
		second.onLocalFeatureChange(refresh);
		await first.activate(KEY);
		await second.reload();
		expect(refresh).toHaveBeenCalledOnce();
		expect(second.isLicensed(LICENSE_FEATURES.SOURCE_CONTROL)).toBe(true);
	});

});
