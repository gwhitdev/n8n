import { mockLogger } from '@n8n/backend-test-utils';
import type { ModuleRegistry } from '@n8n/backend-common';
import type { AuthHandlerRegistry } from '@/auth/auth-handler.registry';
import type { ControllerRegistry } from '@/controller.registry';
import type { License } from '@/license';
import type { PubSubRegistry } from '@/scaling/pubsub/pubsub.registry';
import type { ExecutionContextHookRegistry, InstanceSettings } from 'n8n-core';
import { mock } from 'vitest-mock-extended';

import { LicensedModuleLoader } from '../licensed-module-loader';

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => { resolve = done; });
	return { promise, resolve };
}

function fixture(instanceType: 'main' | 'worker' = 'main') {
	const license = mock<License>();
	const modules = mock<ModuleRegistry>();
	const controllers = mock<ControllerRegistry>();
	const auth = mock<AuthHandlerRegistry>();
	const hooks = mock<ExecutionContextHookRegistry>();
	const pubsub = mock<PubSubRegistry>();
	let refresh: () => Promise<void> = async () => {};
	license.onLocalFeatureChange.mockImplementation((callback) => {
		refresh = callback;
		return () => {};
	});
	const loader = new LicensedModuleLoader(
		license, modules, mock<InstanceSettings>({ instanceType }), controllers, auth, hooks, pubsub,
	);
	return { loader, license, modules, controllers, auth, hooks, pubsub, refresh: async () => await refresh() };
}

describe('LicensedModuleLoader', () => {
	it('registers once and completes startup catch-up', async () => {
		const f = fixture();
		await f.loader.start();
		await f.loader.start();
		expect(f.license.onLocalFeatureChange).toHaveBeenCalledTimes(1);
		expect(f.modules.initModules).toHaveBeenCalledTimes(1);
		expect(f.auth.registerNewHandlers).toHaveBeenCalledWith({ throwOnError: true });
		expect(f.hooks.registerNewHooks).toHaveBeenCalledWith({ throwOnError: true });
		expect(f.controllers.activateNewControllers).toHaveBeenCalledTimes(1);
	});

	it('waits for module initialization before registering routes', async () => {
		const f = fixture();
		await f.loader.start();
		const gate = deferred();
		f.modules.initModules.mockImplementationOnce(async () => await gate.promise);
		f.controllers.activateNewControllers.mockClear();
		const refresh = f.refresh();
		await Promise.resolve();
		expect(f.controllers.activateNewControllers).not.toHaveBeenCalled();
		gate.resolve();
		await refresh;
		expect(f.controllers.activateNewControllers).toHaveBeenCalledOnce();
	});

	it('serializes refresh requests', async () => {
		const f = fixture();
		await f.loader.start();
		const gate = deferred();
		f.modules.initModules.mockClear();
		f.modules.initModules.mockImplementationOnce(async () => await gate.promise);
		const first = f.refresh();
		const second = f.refresh();
		await Promise.resolve();
		expect(f.modules.initModules).toHaveBeenCalledTimes(1);
		gate.resolve();
		await Promise.all([first, second]);
		expect(f.modules.initModules).toHaveBeenCalledTimes(2);
	});

	it('propagates failures and permits a later retry', async () => {
		const f = fixture();
		await f.loader.start();
		f.modules.initModules.mockRejectedValueOnce(new Error('Module unavailable'));
		await expect(f.refresh()).rejects.toThrow('Module unavailable');
		await expect(f.refresh()).resolves.toBeUndefined();
	});

	it('loads worker modules and hooks without initializing password auth', async () => {
		const f = fixture('worker');
		await f.loader.start();
		await f.refresh();
		expect(f.modules.initModules).toHaveBeenCalledWith('worker');
		expect(f.auth.registerNewHandlers).not.toHaveBeenCalled();
		expect(f.hooks.registerNewHooks).toHaveBeenCalled();
		expect(f.pubsub.init).toHaveBeenCalledTimes(2);
	});
});
