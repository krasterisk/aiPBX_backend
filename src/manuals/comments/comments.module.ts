import {Module} from '@nestjs/common';
import {SequelizeModule} from "@nestjs/sequelize";
import {CommentsService} from "./comments.service";
import {Comments} from "./comments.model";
import {CommentsController} from "./comments.controller";

@Module({
    controllers: [CommentsController],
    providers: [CommentsService],
    imports: [
        SequelizeModule.forFeature([Comments]),
    ],
    exports: [CommentsService,CommentsModule]
})
export class CommentsModule {}
