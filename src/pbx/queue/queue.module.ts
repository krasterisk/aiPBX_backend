import {forwardRef, Module} from '@nestjs/common';
import {QueueController} from "./queue.controller";
import {QueueService} from "./queue.service";
import {SequelizeModule} from "@nestjs/sequelize";
import {AuthModule} from "../../auth/auth.module";
import {Queue} from "./queue.model";

@Module({
    controllers: [QueueController],
    providers: [QueueService],
    imports: [
        SequelizeModule.forFeature([Queue]),
        forwardRef(() => AuthModule)
    ],
})
export class QueueModule {}
