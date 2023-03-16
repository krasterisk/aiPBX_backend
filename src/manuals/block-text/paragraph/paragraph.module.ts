import { Module } from '@nestjs/common';
import {ParagraphService} from "./paragraph.service";
import {SequelizeModule} from "@nestjs/sequelize";
import {Paragraph} from "./paragraph.model";
import {BlockTextService} from "../block-text.service";
import {Text} from "../block-text.model";

@Module({
    controllers: [],
    providers: [ParagraphService],
    imports: [
        SequelizeModule.forFeature([Paragraph]),
        ParagraphModule,
    ],
    exports: [ParagraphService]
})
export class ParagraphModule {}
