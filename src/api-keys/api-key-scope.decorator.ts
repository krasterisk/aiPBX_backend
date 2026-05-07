import { SetMetadata } from '@nestjs/common';
import { ApiKeyScope, API_KEY_SCOPES } from './api-key.service';
import { API_KEY_SCOPE_META } from './api-key.guard';

/**
 * Decorator to require a specific API key scope on a route.
 *
 * @example
 * @RequireApiKeyScope(API_KEY_SCOPES.CHAT_MESSAGE)
 * @Post(':id/message')
 */
export const RequireApiKeyScope = (scope: ApiKeyScope) =>
    SetMetadata(API_KEY_SCOPE_META, scope);

export { API_KEY_SCOPES };
