import {
    CanActivate,
    ExecutionContext,
    Injectable,
    Logger,
    UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiKeyService } from '../api-keys/api-key.service';

/**
 * Combined guard for chat message endpoint.
 *
 * Accepts EITHER:
 *   1. JWT Bearer token  → req.user.id is set (regular users)
 *   2. API Key token     → req.apiKeyUserId is set (external services)
 *
 * Detection heuristic:
 *   - Tokens starting with "aipbx_" → API key path
 *   - Everything else → JWT path
 *
 * On success, always sets req.resolvedUserId for downstream use.
 */
@Injectable()
export class JwtOrApiKeyGuard implements CanActivate {
    private readonly logger = new Logger(JwtOrApiKeyGuard.name);

    constructor(
        private readonly jwtService: JwtService,
        private readonly apiKeyService: ApiKeyService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const req = context.switchToHttp().getRequest();

        const authHeader: string | undefined = req.headers?.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            throw new UnauthorizedException('Authorization header required');
        }

        const token = authHeader.slice('Bearer '.length).trim();

        // ── API Key path ────────────────────────────────────────────────────
        if (token.startsWith('aipbx_')) {
            const apiKey = await this.apiKeyService.validate(token, 'chat:message');
            if (!apiKey) {
                this.logger.warn(`Invalid or expired API key (prefix: ${token.substring(0, 12)})`);
                throw new UnauthorizedException('Invalid or expired API key');
            }
            req.apiKeyUserId = apiKey.userId;
            req.resolvedUserId = apiKey.userId;
            return true;
        }

        // ── JWT path ────────────────────────────────────────────────────────
        try {
            // Use JwtService configured via JwtModule.register() in AuthModule
            // (same as JwtAuthGuard and RolesGuard — no explicit secret needed)
            const payload = this.jwtService.verify(token);
            req.user = payload;
            req.tokenUserId = String(payload.id);
            req.resolvedUserId = payload.id;
            return true;
        } catch (err) {
            this.logger.warn(`JWT verification failed: ${err.message}`);
            throw new UnauthorizedException('Invalid or expired token');
        }
    }
}
