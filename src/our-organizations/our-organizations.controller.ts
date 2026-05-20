import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles-auth.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { OurOrganizationsService } from './our-organizations.service';
import { OurOrganization } from './our-organization.model';
import { CreateOurOrganizationDto } from './dto/create-our-organization.dto';

@ApiTags('Our organizations')
@Controller('our-organizations')
export class OurOrganizationsController {
    constructor(private readonly service: OurOrganizationsService) {}

    @ApiOperation({ summary: 'List our organizations (admin)' })
    @ApiResponse({ status: 200, type: [OurOrganization] })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Get()
    getAll() {
        return this.service.findAll();
    }

    @ApiOperation({ summary: 'Get primary our organization (admin)' })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Get('primary')
    getPrimary() {
        return this.service.getPrimary();
    }

    @ApiOperation({ summary: 'Create our organization (admin)' })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Post()
    create(@Body() dto: CreateOurOrganizationDto) {
        return this.service.create(dto);
    }

    @ApiOperation({ summary: 'Update our organization (admin)' })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: CreateOurOrganizationDto) {
        return this.service.update(Number(id), dto);
    }

    @ApiOperation({ summary: 'Delete our organization (admin)' })
    @Roles('ADMIN')
    @UseGuards(RolesGuard)
    @Delete(':id')
    delete(@Param('id') id: string) {
        return this.service.delete(Number(id));
    }
}
