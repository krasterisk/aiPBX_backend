import {Module} from '@nestjs/common';
import {BlockImageService} from './block-image.service';
import {SequelizeModule} from "@nestjs/sequelize";
import {Image} from "./block-image.model";

@Module({
    controllers: [],
    providers: [BlockImageService],
    imports: [
        SequelizeModule.forFeature([Image]),
    ],
    exports: [BlockImageService]
})

export class BlockImageModule {
}
