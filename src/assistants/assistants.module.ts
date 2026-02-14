import { forwardRef, Module } from '@nestjs/common';
import { AssistantsService } from "./assistants.service";
import { AssistantsController } from "./assistants.controller";
import { SequelizeModule } from "@nestjs/sequelize";
import { AuthModule } from "../auth/auth.module";
import { Assistant } from "./assistants.model";
import { LoggerModule } from "../logger/logger.module";

@Module({
    providers: [AssistantsService],
    controllers: [AssistantsController],
    imports: [
        SequelizeModule.forFeature([Assistant]),
        forwardRef(() => AuthModule),
        LoggerModule,
    ],
    exports: [AssistantsService]
})
export class AssistantsModule { }
