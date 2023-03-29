import {IsNumber, IsString, IsUrl} from "class-validator";

export enum ManualBlockTypes {
    TEXT = 'TEXT',
    CODE = 'CODE',
    IMAGE = 'IMAGE',
    NOTE = 'NOTE'
}

export interface ManualBlockBase {
    type: ManualBlockTypes
    postId: number
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
    id: number
    type: ManualBlockTypes.TEXT
    title?: string
    paragraphs: string[]
}

export type ManualBlock = ManualCodeBlock | ManualImageBlock | ManualTextBlock

export class ManualDto {
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
    paragraphs?: string[]
    hashtags?: string[]
    blocks: ManualBlock[]
}
