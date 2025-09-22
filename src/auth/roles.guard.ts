import {
    CanActivate,
    ExecutionContext,
    HttpException,
    HttpStatus,
    Injectable, Logger,
    UnauthorizedException
} from "@nestjs/common";
import {Observable} from "rxjs";
import {JwtService} from "@nestjs/jwt";
import {Reflector} from "@nestjs/core";
import {ROLES_KEY} from "./roles-auth.decorator";


@Injectable()
export class RolesGuard implements CanActivate {

    private readonly logger = new Logger(RolesGuard.name);

    constructor(private jwtService: JwtService,
                private reflector: Reflector){}

    canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
        try {
            const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
                context.getHandler(),
                context.getClass()
            ])

            if (!requiredRoles) {
                return true
            }
            const req = context.switchToHttp().getRequest()
            const authHeader = req.headers.authorization;
            const bearer = authHeader.split(' ')[0]
            const token = authHeader.split(' ')[1]

            if (bearer !== 'Bearer' || !token) {
                this.logger.warn("User not authorized!")
                throw new UnauthorizedException({message: 'User not authorized!'})
            }

            const user = this.jwtService.verify(token)

            console.log(user)
            req.isAdmin = user.roles.some(role => role.value === 'ADMIN')
            req.tokenUserId = user.id
            req.vpbxUserId = user.vpbx_user_id
            return user.roles.some(role => requiredRoles.includes(role.value))

        } catch (e) {
            if (e == 'TokenExpiredError: jwt expired') {
                this.logger.warn("TokenExpiredError", e)
            }
            this.logger.warn('Access denied!', e)
            throw new HttpException('Access denied!', HttpStatus.FORBIDDEN)
        }
    }

}
