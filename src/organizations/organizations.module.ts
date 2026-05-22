import { forwardRef, Module } from '@nestjs/common';
import { SequelizeModule } from "@nestjs/sequelize";
import { OrganizationsService } from './organizations.service';
import { OrganizationEdoService } from './organization-edo.service';
import { OrganizationsController } from './organizations.controller';
import { OurOrganizationsModule } from '../our-organizations/our-organizations.module';
import { Organization } from './organizations.model';
import { User } from '../users/users.model';
import { AuthModule } from "../auth/auth.module";
import { LoggerModule } from "../logger/logger.module";
import { AccountingModule } from "../accounting/accounting.module";

@Module({
    providers: [OrganizationsService, OrganizationEdoService],
    controllers: [OrganizationsController],
    imports: [
        SequelizeModule.forFeature([Organization, User]),
        forwardRef(() => AuthModule),
        LoggerModule,
        forwardRef(() => AccountingModule),
        OurOrganizationsModule,
    ],
    exports: [OrganizationsService, OrganizationEdoService],
})
export class OrganizationsModule { }
