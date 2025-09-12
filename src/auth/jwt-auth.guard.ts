import {CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException} from "@nestjs/common";
import {Observable} from "rxjs";
import {JwtService} from "@nestjs/jwt";


@Injectable()
export class JwtAuthGuard implements CanActivate {

    private readonly logger = new Logger(JwtAuthGuard.name);

    constructor(private jwtService: JwtService) {}

    canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
        const req = context.switchToHttp().getRequest()
        try {
            const authHeader = req.headers.authorization;
            const bearer = authHeader.split(' ')[0]
            const token = authHeader.split(' ')[1]

            if (bearer !== 'Bearer' || !token) {
                this.logger.warn("User not authorized! Token error!")
                throw new UnauthorizedException({message: 'User not authorised!'})
            }

            const user = this.jwtService.verify(token)
            req.user = user
            return true

        } catch (e) {
            this.logger.warn("User not authorized!", e)
            throw new UnauthorizedException({message: 'User not authorized!'})
        }
    }

}
