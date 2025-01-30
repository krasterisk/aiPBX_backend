import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { PsAorsService } from './ps_aors.service';
import { PsAor } from './ps_aors.model';

@Controller('ps-aors')
export class PsAorsController {
  constructor(private readonly psAorsService: PsAorsService) {}

  @Get()
  findAll() {
    return this.psAorsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.psAorsService.findOne(id);
  }

  @Post()
  create(@Body() psAor: PsAor) {
    return this.psAorsService.create(psAor);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() psAor: PsAor) {
    return this.psAorsService.update(id, psAor);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.psAorsService.delete(id);
  }
}
