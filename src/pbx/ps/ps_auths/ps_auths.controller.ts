import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { PsAuthsService } from './ps_auths.service';
import { PsAuth } from './ps_auths.model';

@Controller('ps-auths')
export class PsAuthsController {
  constructor(private readonly psAuthsService: PsAuthsService) {}

  @Get()
  findAll() {
    return this.psAuthsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.psAuthsService.findOne(id);
  }

  @Post()
  create(@Body() psAuth: PsAuth) {
    return this.psAuthsService.create(psAuth);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() psAuth: PsAuth) {
    return this.psAuthsService.update(id, psAuth);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.psAuthsService.delete(id);
  }
}
