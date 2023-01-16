import {forwardRef, Module} from '@nestjs/common';
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from "../../auth/auth.module";
import {Extensions} from "./extensions.model";
import {ExtensionsService} from "./extensions.service";
import {ExtensionsController} from "./extensions.controller";

@Module({
    providers: [ExtensionsService],
    controllers: [ExtensionsController],
    imports: [
        SequelizeModule.forFeature([Extensions]),
        forwardRef(() => AuthModule)
    ],
    exports: [ExtensionsService]

})
export class ExtensionsModule {

}
