import {Module} from '@nestjs/common';
import {HashtagsService} from './hashtags.service';
import {SequelizeModule} from "@nestjs/sequelize";
import {Hashtags} from "./hashtags.model";

@Module({
  controllers: [],
  providers: [HashtagsService],
  imports: [
    SequelizeModule.forFeature([Hashtags]),
  ],
  exports: [HashtagsService]
})

export class HashtagsModule {}
