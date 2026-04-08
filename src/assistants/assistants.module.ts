import { forwardRef, Module } from '@nestjs/common';
import { AssistantsService } from "./assistants.service";
import { AssistantsController } from "./assistants.controller";
import { SequelizeModule } from "@nestjs/sequelize";
import { AuthModule } from "../auth/auth.module";
import { Assistant } from "./assistants.model";
import { LoggerModule } from "../logger/logger.module";
import { OpenAiModule } from "../open-ai/open-ai.module";
import { Prices } from "../prices/prices.model";
import { UsersModule } from "../users/users.module";
import { BillingRecord } from "../billing/billing-record.model";
import { FilesModule } from "../files/files.module";

@Module({
    providers: [AssistantsService],
    controllers: [AssistantsController],
    imports: [
        SequelizeModule.forFeature([Assistant, Prices, BillingRecord]),
        forwardRef(() => AuthModule),
        forwardRef(() => OpenAiModule),
        forwardRef(() => UsersModule),
        LoggerModule,
        FilesModule,
    ],
    exports: [AssistantsService]
})
export class AssistantsModule { }
