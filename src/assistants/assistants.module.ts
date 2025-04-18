import {forwardRef, Module} from '@nestjs/common';
import {AssistantsService} from "./assistants.service";
import {AssistantsController} from "./assistants.controller";
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from "../auth/auth.module";
import {Assistant} from "./assistants.model";

@Module({
    providers: [AssistantsService],
    controllers: [AssistantsController],
    imports: [
        SequelizeModule.forFeature([Assistant]),
        forwardRef(() => AuthModule)
    ],
    exports: [AssistantsService]
})
export class AssistantsModule {}
