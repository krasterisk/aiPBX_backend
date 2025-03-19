import {forwardRef, Module} from '@nestjs/common';
import {aiBotsService} from "./aibots.service";
import {aiBotsController} from "./aibots.controller";
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from "../../auth/auth.module";
import {AiBot} from "./aibot.model";

@Module({
    providers: [aiBotsService],
    controllers: [aiBotsController],
    imports: [
        SequelizeModule.forFeature([AiBot]),
        forwardRef(() => AuthModule)
    ],
})
export class aiBotsModule {}
