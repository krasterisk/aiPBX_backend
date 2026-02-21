import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { OperatorApiToken } from '../operator-api-token.model';

/**
 * Guard for public API endpoints that use oa_xxx API tokens.
 * Validates the token and injects into request:
 *   req.tokenUserId  — owner user ID
 *   req.isApiToken   — true
 *   req.apiToken     — full token record (includes projectId)
 */
@Injectable()
export class ApiTokenGuard implements CanActivate {
    private readonly logger = new Logger(ApiTokenGuard.name);

    constructor(
        @InjectModel(OperatorApiToken) private readonly tokenRepository: typeof OperatorApiToken,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const req = context.switchToHttp().getRequest();

        try {
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                throw new UnauthorizedException('Missing Authorization header');
            }

            const [bearer, token] = authHeader.split(' ');
            if (bearer !== 'Bearer' || !token) {
                throw new UnauthorizedException('Invalid Authorization header format');
            }

            const apiToken = await this.tokenRepository.findOne({
                where: { token, isActive: true },
            });

            if (!apiToken) {
                throw new UnauthorizedException('Invalid or inactive API token');
            }

            // Update lastUsedAt async (don't await to keep latency low)
            apiToken.update({ lastUsedAt: new Date() }).catch(() => { });

            // Inject context into request
            req.tokenUserId = apiToken.userId;
            req.isApiToken = true;
            req.apiToken = apiToken;   // full record — gives access to projectId etc.

            return true;
        } catch (e) {
            if (e instanceof UnauthorizedException) throw e;
            this.logger.warn(`API Token auth failed: ${e.message}`);
            throw new UnauthorizedException('API Token authentication failed');
        }
    }
}
