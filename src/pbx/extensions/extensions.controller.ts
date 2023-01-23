import {Controller, Get, UseGuards} from '@nestjs/common';
import {ApiOperation, ApiResponse, ApiTags} from "@nestjs/swagger";
import {Roles} from "../../auth/roles-auth.decorator";
import {RolesGuard} from "../../auth/roles.guard";
import {Extensions} from "./extensions.model";
import {ExtensionsService} from "./extensions.service";

@ApiTags('Extensions')
@Controller('extensions')
export class ExtensionsController {

    constructor(private ExtenService: ExtensionsService) {}

    @ApiOperation({summary: "Get list of extensions"})
    @ApiResponse({status: 200, type: Extensions})
    @Roles('ADMIN', 'USER')
    @UseGuards(RolesGuard)
//    @UsePipes(ValidationPipe)
    @Get()
    getAll() {
        return this.ExtenService.getAll()
    }
}
