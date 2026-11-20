import { EventEmitter } from 'node:events';

/** Emits 'changed' with a provider's fresh PlanUsage whenever its figures are read again. */
export const usageBus = new EventEmitter();
