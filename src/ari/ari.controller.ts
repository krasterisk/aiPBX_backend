import {Controller, Get} from '@nestjs/common';
import {AriService} from "./ari.service";

@Controller('ari')
export class AriController {
    constructor(private readonly ariService: AriService) {}

    @Get('/endpoints')
    getAll() {
        return this.ariService.getEndpoints()
    }

}
