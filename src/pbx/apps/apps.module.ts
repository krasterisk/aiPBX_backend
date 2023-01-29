import {forwardRef, Module} from '@nestjs/common';
import {AppsService} from "./apps.service";
import {AppsController} from "./apps.controller";
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from "../../auth/auth.module";
import {App} from "./app.model";

@Module({
    providers: [AppsService],
    controllers: [AppsController],
    imports: [
        SequelizeModule.forFeature([App]),
        forwardRef(() => AuthModule)
    ],

})
export class AppsModule {}
