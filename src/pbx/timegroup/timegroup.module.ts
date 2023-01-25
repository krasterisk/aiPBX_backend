import {forwardRef, Module} from '@nestjs/common';
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from "../../auth/auth.module";
import {TimegroupService} from "./timegroup.service";
import {TimegroupController} from "./timegroup.controller";
import {Timegroup} from "./timegroup.model";

@Module({

    providers: [TimegroupService],
    controllers: [TimegroupController],
    imports: [
        SequelizeModule.forFeature([Timegroup]),
        forwardRef(() => AuthModule)
    ],

})
export class TimegroupModule {}
