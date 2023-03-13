import {forwardRef, Module} from '@nestjs/common';
import {SequelizeModule} from "@nestjs/sequelize";
import {User} from "../../users/users.model";
import {PostsService} from "./posts.service";
import {PostsController} from "./posts.controller";
import {Post} from "./posts.model";
import {FilesModule} from "../../files/files.module";
import {AuthModule} from "../../auth/auth.module";
import {Block} from "./blocks.model";

@Module({
    providers: [PostsService],
    controllers: [PostsController],
    imports: [
        SequelizeModule.forFeature([User, Post, Block]),
        FilesModule,
        forwardRef(() => AuthModule)
    ]
})
export class PostsModule {}
