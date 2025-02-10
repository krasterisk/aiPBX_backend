import {Controller, Get, Query, UseGuards} from '@nestjs/common';
import {AmiService} from "./ami.service";
import {RolesGuard} from "../auth/roles.guard";
import {Roles} from "../auth/roles-auth.decorator";
import {ApiTags} from "@nestjs/swagger";

@ApiTags('AMI Interface')
@Controller('ami')
export class AmiController {

    constructor(private readonly amiService: AmiService) {}
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Get('/call')
    origCall(
        @Query('exten') exten: number,
        @Query('phone') phone: number,
        @Query('user_uid') user_uid: number | 0,
    ) {
        this.amiService.origCall(exten, phone, user_uid);
    }
}

