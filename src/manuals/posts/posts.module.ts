import {forwardRef, Module} from '@nestjs/common';
import {SequelizeModule} from "@nestjs/sequelize";
import {User} from "../../users/users.model";
import {PostsService} from "./posts.service";
import {PostsController} from "./posts.controller";
import {Post} from "./posts.model";
import {FilesModule} from "../../files/files.module";
import {AuthModule} from "../../auth/auth.module";
import {BlockImageModule} from "../block-image/block-image.module";
import {BlockTextModule} from "../block-text/block-text.module";
import {BlockCodeModule} from "../block-code/block-code.module";
import {ParagraphModule} from "../block-text/paragraph/paragraph.module";
import {CommentsModule} from "../comments/comments.module";
import {HashtagsModule} from "../hashtags/hashtags.module";
import {RatingModule} from "../rating/rating.module";

@Module({
    providers: [PostsService],
    controllers: [PostsController],
    imports: [
        BlockImageModule,
        BlockCodeModule,
        BlockTextModule,
        ParagraphModule,
        HashtagsModule,
        FilesModule,
        CommentsModule,
        SequelizeModule.forFeature([User, Post]),
        forwardRef(() => AuthModule)
    ],
})
export class PostsModule {}
