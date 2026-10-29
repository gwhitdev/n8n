import { ModuleRegistry } from '@n8n/backend-common';
import { Service } from '@n8n/di';
import { ExecutionContextHookRegistry, InstanceSettings } from 'n8n-core';

import { AuthHandlerRegistry } from '@/auth/auth-handler.registry';
import { ControllerRegistry } from '@/controller.registry';
import { License } from '@/license';
import { PubSubRegistry } from '@/scaling/pubsub/pubsub.registry';

@Service()
export class LicensedModuleLoader {
	private started = false;

	private refreshQueue: Promise<void> = Promise.resolve();

	constructor(
		private readonly license: License,
		private readonly modules: ModuleRegistry,
		private readonly instanceSettings: InstanceSettings,
		private readonly controllers: ControllerRegistry,
		private readonly authHandlers: AuthHandlerRegistry,
		private readonly executionHooks: ExecutionContextHookRegistry,
		private readonly pubsub: PubSubRegistry,
	) {}

	async start() {
		if (this.started) return;
		this.started = true;
		this.license.onLocalFeatureChange(async () => await this.refresh());
		await this.refresh();
	}

	private async refresh() {
		const pending = this.refreshQueue.then(async () => {
			await this.modules.initModules(this.instanceSettings.instanceType);
			if (this.instanceSettings.instanceType === 'main') {
				await this.authHandlers.registerNewHandlers({ throwOnError: true });
			}
			await this.executionHooks.registerNewHooks({ throwOnError: true });
			this.pubsub.init();
			this.controllers.activateNewControllers();
		});
		this.refreshQueue = pending.catch(() => {});
		await pending;
	}
}
