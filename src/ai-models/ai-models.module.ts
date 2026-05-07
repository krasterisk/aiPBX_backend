import {forwardRef, Module} from '@nestjs/common';
import {SequelizeModule} from "@nestjs/sequelize";
import { HttpModule } from '@nestjs/axios';
import {AiModelsService} from "./ai-models.service";
import {AiModelsController} from "./ai-models.controller";
import {AuthModule} from "../auth/auth.module";
import {aiModel} from "./ai-models.model";
import { ApiKeyModule } from '../api-keys/api-key.module';

@Module({
    providers: [AiModelsService],
    controllers: [AiModelsController],
    imports: [
        SequelizeModule.forFeature([aiModel]),
        HttpModule.register({ timeout: 5000 }),
        forwardRef(() => AuthModule),
        ApiKeyModule,
    ],
})
export class AiModelsModule {}


