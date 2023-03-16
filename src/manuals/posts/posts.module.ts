import {forwardRef, Module} from '@nestjs/common';
import {SequelizeModule} from "@nestjs/sequelize";
import {User} from "../../users/users.model";
import {PostsService} from "./posts.service";
import {PostsController} from "./posts.controller";
import {Post} from "./posts.model";
import {FilesModule} from "../../files/files.module";
import {AuthModule} from "../../auth/auth.module";
import {BlockImageModule} from "../block-image/block-image.module";
import {BlockCodeService} from "../block-code/block-code.service";
import {BlockTextModule} from "../block-text/block-text.module";
import {BlockCodeModule} from "../block-code/block-code.module";
import {ParagraphModule} from "../block-text/paragraph/paragraph.module";

@Module({
    providers: [PostsService],
    controllers: [PostsController],
    imports: [
        BlockImageModule,
        BlockCodeModule,
        BlockTextModule,
        ParagraphModule,
        FilesModule,
        SequelizeModule.forFeature([User, Post]),
        forwardRef(() => AuthModule)
    ],
})
export class PostsModule {}
