import { forwardRef, Module } from '@nestjs/common';
import { SequelizeModule } from "@nestjs/sequelize";
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { Organization } from './organizations.model';
import { AuthModule } from "../auth/auth.module";
import { LoggerModule } from "../logger/logger.module";
import { AccountingModule } from "../accounting/accounting.module";

@Module({
    providers: [OrganizationsService],
    controllers: [OrganizationsController],
    imports: [
        SequelizeModule.forFeature([Organization]),
        forwardRef(() => AuthModule),
        LoggerModule,
        AccountingModule,
    ],
    exports: [OrganizationsService]
})
export class OrganizationsModule { }
