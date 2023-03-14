import {ManualBlock, ManualBlockTypes, ManualDto} from "./dto/create-post.dto";
import {Post} from "./posts.model";
import {InjectModel} from "@nestjs/sequelize";
import {HttpException, HttpStatus, Injectable} from "@nestjs/common";
import {BlockCodeService} from "../block-code/block-code.service";
import {BlockImageService} from "../block-image/block-image.service";
import {BlockTextService} from "../block-text/block-text.service";

@Injectable()
export class PostsService {

    constructor(@InjectModel(Post) private postRepository: typeof Post,
                //                private fileService: FilesService,
                private blockImageService: BlockImageService,
                private blockCodeService: BlockCodeService,
                private blockTextService: BlockTextService
    ) {
    }

//    async create(dto: CreatePostDto, image: any) {
    async create(dto: ManualDto) {
        try {
            const post = await this.postRepository.create(dto)
            if (post && dto) {
                Object.values(dto.blocks).map(async (block: ManualBlock) => {
                    if (block.type == ManualBlockTypes.CODE) {
                        const code = await this.blockCodeService.create(block)
                        if(!code) {
                            throw new HttpException({message: '[blockText]:  Create error'}, HttpStatus.BAD_REQUEST)
                        }

                    }
                    if (block.type == ManualBlockTypes.IMAGE) {
                        const image = await this.blockImageService.create(block)
                        if(!image) {
                            throw new HttpException({message: '[blockText]:  Create error'}, HttpStatus.BAD_REQUEST)
                        }
                    }
                    if (block.type == ManualBlockTypes.TEXT) {
                        const text = await this.blockTextService.create(block)
                        if(!text) {
                            throw new HttpException({message: '[blockText]:  Create error'}, HttpStatus.BAD_REQUEST)
                        }
                    }
                })
            }
            return post

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
            const post = await this.postRepository.findAll({include: {all: true}})
            if (post) {
                return post
            }

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
