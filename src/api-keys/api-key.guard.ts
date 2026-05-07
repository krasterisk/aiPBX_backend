import {
    CanActivate,
    ExecutionContext,
    Injectable,
    Logger,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyService, ApiKeyScope } from './api-key.service';

export const API_KEY_SCOPE_META = 'api_key_scope';

/**
 * Guard that validates a static Bearer API key against the api_keys table.
 * Use @ApiKeyScope('chat:message') decorator to require a specific scope.
 *
 * On success, injects req.apiKeyUserId with the owner's userId.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
    private readonly logger = new Logger(ApiKeyGuard.name);

    constructor(
        private readonly apiKeyService: ApiKeyService,
        private readonly reflector: Reflector,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const req = context.switchToHttp().getRequest();

        const authHeader: string | undefined = req.headers?.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new UnauthorizedException('API key required');
        }

        const rawToken = authHeader.slice('Bearer '.length).trim();

        // Check if a specific scope is required for this endpoint
        const requiredScope = this.reflector.getAllAndOverride<ApiKeyScope | undefined>(
            API_KEY_SCOPE_META,
            [context.getHandler(), context.getClass()],
        );

        const apiKey = await this.apiKeyService.validate(rawToken, requiredScope);

        if (!apiKey) {
            this.logger.warn(`Invalid or expired API key (prefix: ${rawToken.substring(0, 12)})`);
            throw new UnauthorizedException('Invalid or expired API key');
        }

        // Inject resolved userId so controllers/services can use it
        req.apiKeyUserId = apiKey.userId;
        req.apiKey = apiKey;

        return true;
    }
}
