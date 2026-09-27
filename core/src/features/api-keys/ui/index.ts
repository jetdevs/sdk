/**
 * API Keys UI Module
 *
 * Client-side API key management components.
 * Provides logic hooks and factory functions for API key UI.
 *
 * @module @jetdevs/core/features/api-keys/ui
 *
 * @example
 * ```typescript
 * // Create API keys list component
 * import {
 *   createApiKeysListFactory,
 *   createCreateApiKeyDialogFactory,
 * } from '@jetdevs/core/features/api-keys/ui';
 * import { api } from '@/utils/trpc';
 * import { toast } from 'sonner';
 * import * as UI from '@/components/ui';
 *
 * export const ApiKeysList = createApiKeysListFactory({
 *   api,
 *   ui: { ...UI, toast },
 * });
 *
 * export const CreateApiKeyDialog = createCreateApiKeyDialogFactory({
 *   api,
 *   ui: { ...UI, toast },
 * });
 * ```
 */

// Hooks
export {
  useApiKeysLogic,
  useCreateApiKeyLogic,
  type ApiKeyData,
  type PaginationState,
  type UseApiKeysLogicConfig,
  type ApiKeysLogicReturn,
  type CreateApiKeyFormData,
  type CreateApiKeyResult,
  type UseCreateApiKeyLogicConfig,
  type CreateApiKeyFormErrors,
  type CreateApiKeyLogicReturn,
} from "./hooks";

// Factories
export {
  createApiKeysListFactory,
  createCreateApiKeyDialogFactory,
  type ApiKeysListUIComponents,
  type ApiKeysListApi,
  type ApiKeysListFactoryConfig,
  type ApiKeysListProps,
  type CreateApiKeyDialogUIComponents,
  type CreateApiKeyDialogApi,
  type CreateApiKeyDialogFactoryConfig,
  type CreateApiKeyDialogProps,
} from "./factories";
