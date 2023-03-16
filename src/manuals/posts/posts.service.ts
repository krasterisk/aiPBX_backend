import {ManualBlock, ManualBlockTypes, ManualDto} from "./dto/create-post.dto";
import {Post} from "./posts.model";
import {InjectModel} from "@nestjs/sequelize";
import {HttpException, HttpStatus, Injectable} from "@nestjs/common";
import {BlockCodeService} from "../block-code/block-code.service";
import {BlockImageService} from "../block-image/block-image.service";
import {BlockTextService} from "../block-text/block-text.service";
import {ParagraphService} from "../block-text/paragraph/paragraph.service";
import {Paragraph} from "../block-text/paragraph/paragraph.model";

@Injectable()
export class PostsService {

    constructor(@InjectModel(Post) private postRepository: typeof Post,
                //                private fileService: FilesService,
                private blockImageService: BlockImageService,
                private blockCodeService: BlockCodeService,
                private blockTextService: BlockTextService,
                private paragraphService: ParagraphService
    ) {
    }

//    async create(dto: CreatePostDto, image: any) {
    async create(dto: ManualDto) {
        try {
            const post = await this.postRepository.create(dto)
            if (!post) {
                throw new HttpException({message: '[Post]:  Create error'}, HttpStatus.BAD_REQUEST)
            }
            if (post && dto.blocks) {
                Object.values(dto.blocks).map(async (block: ManualBlock) => {
                    if (block.type == ManualBlockTypes.CODE) {
                        const code = await this.blockCodeService.create({...block, postId: post.id})
                        if (!code) {
                            throw new HttpException({message: '[blockText]:  Create error'}, HttpStatus.BAD_REQUEST)
                        }
                    }
                    if (block.type == ManualBlockTypes.IMAGE) {
                        const image = await this.blockImageService.create({...block, postId: post.id})
                        if (!image) {
                            throw new HttpException({message: '[blockText]:  Create error'}, HttpStatus.BAD_REQUEST)
                        }
                    }
                    if (block.type == ManualBlockTypes.TEXT) {
                        const text = await this.blockTextService.create({...block, postId: post.id})
                        if (!text) {
                            throw new HttpException({message: '[blockText]:  Create error'}, HttpStatus.BAD_REQUEST)
                        }
                        if (block.paragraphs.length) {
                            block.paragraphs.map(async (par) => {
                                const paragraph = await this.paragraphService.create({
                                    paragraph: par,
                                    blockTextId: text.id
                                })
                                if (!paragraph) {
                                    throw new HttpException({message: '[blockTextParagraph]:  Create error'}, HttpStatus.BAD_REQUEST)
                                }
                            })
                        }
                    }
                })
                return post
            }
        } catch (e) {
            throw new HttpException({message: '[post]:  Create error'} + e, HttpStatus.BAD_REQUEST)
        }
    }

    async update(updates: Partial<Post>) {
        const post = await this.postRepository.findByPk(updates.id)
        if (!post) {
            throw new HttpException('post not found', HttpStatus.NOT_FOUND)
        }
        await post.update(updates)
        return post
    }

    async getAll() {
        try {
            const allPosts = []
            const posts = await this.postRepository.findAll({include: {all: true}})
            posts.map((p) => {
                const blocks = []
                const post = p.dataValues
                if (post.blockTexts.length) {
                    post.blockTexts.map(async text => {
                        // const paragraphs = await this.paragraphService.getAllByTextId(text.id)
                        // const pars = []
                        // if (paragraphs.length) {
                        //     paragraphs.map(par => {
                        //        if(par) {
                        //            pars.push(par.paragraph)
                        //        }
                        //     })
                        //     text.paragraphs = pars
                        // }
                        blocks.push(text)
                    })
                }
                if (post.blockImages.length) {
                    post.blockImages.map(image => blocks.push(image))
                }
                if (post.blockCodes.length) {
                    post.blockCodes.map(code => blocks.push(code))
                }
                delete post.blockTexts
                delete post.blockImages
                delete post.blockCodes

                post.blocks = blocks
                console.log(blocks)

                allPosts.push(post)
            })
            return allPosts
        } catch (e) {
            throw new HttpException({message: '[post]:  Request error'} + e, HttpStatus.BAD_REQUEST)
        }
    }

    async delete(ids: number[]) {
        const deleted = await this.postRepository.destroy({where: {id: ids}})
        if (deleted === 0) {
            throw new HttpException('post not found', HttpStatus.NOT_FOUND)
        } else {
            return {message: 'post deleted successfully', statusCode: HttpStatus.OK}
        }
    }

    async getPostById(id: number) {
        const post = await this.postRepository.findOne({where: {id}})
        if (!post) {
            throw new HttpException('post not found', HttpStatus.NOT_FOUND)
        } else {
            return post
        }
    }
}
