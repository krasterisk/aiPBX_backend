import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { PsEndpointsService } from './ps_endpoints.service';
import { PsEndpoint } from './ps_endpoints.model';

@Controller('ps-endpoints')
export class PsEndpointsController {
  constructor(private readonly psEndpointsService: PsEndpointsService) {}

  @Get()
  findAll() {
    return this.psEndpointsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.psEndpointsService.findOne(id);
  }

  @Post()
  create(@Body() psEndpoint: PsEndpoint) {
    return this.psEndpointsService.create(psEndpoint);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() psEndpoint: PsEndpoint) {
    return this.psEndpointsService.update(id, psEndpoint);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.psEndpointsService.delete(id);
  }
}
