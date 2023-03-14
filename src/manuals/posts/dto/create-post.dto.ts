import {IS_URL, IsNumber, IsString, IsUrl} from "class-validator";
import {IsNull} from "sequelize-typescript";

export enum ManualBlockTypes {
    TEXT = 'TEXT',
    CODE = 'CODE',
    IMAGE = 'IMAGE',
    NOTE = 'NOTE'
}

export interface ManualBlockBase {
    id: string
    type: ManualBlockTypes
}

export interface ManualCodeBlock extends ManualBlockBase {
    readonly type: ManualBlockTypes.CODE
    readonly code: string
}

export interface ManualImageBlock extends ManualBlockBase {
    type: ManualBlockTypes.IMAGE
    src: string
    title: string
}

export interface ManualTextBlock extends ManualBlockBase {
    type: ManualBlockTypes.TEXT
    title?: string
    paragraphs: string
}

export type ManualBlock = ManualCodeBlock | ManualImageBlock | ManualTextBlock

export enum ManualHashtags {
    IT = 'IT',
    INBOUND_CALL_CENTER = 'INBOUND_CALL_CENTER',
    PBX = 'PBX',
    OUTBOUND_CALL_CENTER = 'OUTBOUND_CALL_CENTER',
    IP_PHONES = 'IP_PHONES'
}

export class ManualDto {
    id: number
    @IsString({message: 'Must be a string!'})
    title: string
    @IsString({message: 'Must be a string!'})
    subtitle?: string
    @IsUrl({
        require_host: true,
        protocols: ['http','https']
    },
        {message: 'Must be a URL!'}
    )
    image?: string
    @IsNumber({allowNaN: false},{message: 'Must be a integer!'})
    views?: number
    hashtags?: ManualHashtags[]
    blocks: ManualBlock[]
}
