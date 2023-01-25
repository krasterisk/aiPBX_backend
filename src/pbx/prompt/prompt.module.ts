import {forwardRef, Module} from '@nestjs/common';
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from "../../auth/auth.module";
import {Prompt} from "./prompt.model";
import {PromptService} from "./prompt.service";
import {PromptController} from "./prompt.controller";

@Module({
    providers: [PromptService],
    controllers: [PromptController],
    imports: [
        SequelizeModule.forFeature([Prompt]),
        forwardRef(() => AuthModule)
    ],
    
})
export class PromptModule {}
