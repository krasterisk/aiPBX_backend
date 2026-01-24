import { forwardRef, Module } from '@nestjs/common';
import { SequelizeModule } from "@nestjs/sequelize";
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';
import { Organization } from './organizations.model';
import { AuthModule } from "../auth/auth.module";

@Module({
    providers: [OrganizationsService],
    controllers: [OrganizationsController],
    imports: [
        SequelizeModule.forFeature([Organization]),
        forwardRef(() => AuthModule),
    ],
    exports: [OrganizationsService]
})
export class OrganizationsModule { }
