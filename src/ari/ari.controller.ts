import {Controller, Get} from '@nestjs/common';
import {AriService} from "./ari.service";

@Controller('ari')
export class AriController {
    constructor(private readonly ariService: AriService) {}

    @Get('/endpoints')
     getAll() {
        const endpoints = this.ariService.getEndpoints()
        return endpoints
    }

}
