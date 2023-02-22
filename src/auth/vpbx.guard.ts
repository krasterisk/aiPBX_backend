import {
    CanActivate,
    ExecutionContext,
    HttpException,
    HttpStatus,
    Injectable,
    UnauthorizedException
} from "@nestjs/common";
import {JwtService} from "@nestjs/jwt";
import {Reflector} from "@nestjs/core";
import {Observable} from "rxjs";
import {VPBX_KEY} from "./vpbx-auth.decorator";


@Injectable()
export class VpbxGuard implements CanActivate {

    constructor(private jwtService: JwtService,
                private reflector: Reflector){}

    canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
        try {
            const requiredVpbxId = this.reflector.getAllAndOverride<number>(VPBX_KEY, [
                context.getHandler(),
                context.getClass()
            ])

            if (!requiredVpbxId) {
                return true
            }
            const req = context.switchToHttp().getRequest()
            const authHeader = req.headers.authorization;
            const bearer = authHeader.split(' ')[0]
            const token = authHeader.split(' ')[1]

            if (bearer !== 'Bearer' || !token) {
                throw new UnauthorizedException({message: 'User not authorized!'})
            }

            const user = this.jwtService.verify(token)
            req.user = user
            if (user.vpbx_user_id === requiredVpbxId) {
                return true
            }
        } catch (e) {
            console.log(e)
            throw new HttpException('Access denied!', HttpStatus.FORBIDDEN)
        }
    }



}
