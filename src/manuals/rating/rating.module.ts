import {Module} from '@nestjs/common';
import {SequelizeModule} from "@nestjs/sequelize";
import {RatingService} from "./rating.service";
import {Rating} from "./rating.model";
import {RatingController} from "./rating.controller";
import {Post} from "../posts/posts.model";

@Module({
  providers: [RatingService],
  controllers: [RatingController],
  imports: [
    SequelizeModule.forFeature([Rating, Post])
  ],
  exports: [RatingService]
})

export class RatingModule {}
