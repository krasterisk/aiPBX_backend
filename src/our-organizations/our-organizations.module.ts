import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { OurOrganization } from './our-organization.model';
import { OurOrganizationsService } from './our-organizations.service';
import { OurOrganizationsController } from './our-organizations.controller';
import { forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [
        SequelizeModule.forFeature([OurOrganization]),
        forwardRef(() => AuthModule),
    ],
    controllers: [OurOrganizationsController],
    providers: [OurOrganizationsService],
    exports: [OurOrganizationsService, SequelizeModule],
})
export class OurOrganizationsModule {}
