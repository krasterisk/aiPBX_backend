import {ManualBlock, ManualBlockTypes, ManualDto} from "./dto/create-post.dto";
import {Post} from "./posts.model";
import {InjectModel} from "@nestjs/sequelize";
import {HttpException, HttpStatus, Injectable} from "@nestjs/common";
import {BlockCodeService} from "../block-code/block-code.service";
import {BlockImageService} from "../block-image/block-image.service";
import {BlockTextService} from "../block-text/block-text.service";
import {ParagraphService} from "../block-text/paragraph/paragraph.service";
import {Paragraph} from "../block-text/paragraph/paragraph.model";
import {Text} from "../block-text/block-text.model";
import {HashtagsService} from "../hashtags/hashtags.service";
import {GetPostDto} from "./dto/get-post.dto";
import sequelize from "sequelize";
import {Hashtags} from "../hashtags/hashtags.model";
import {CommentsService} from "../comments/comments.service";
import {RatingService} from "../rating/rating.service";

@Injectable()
export class PostsService {

    constructor(@InjectModel(Post) private postRepository: typeof Post,
                //                private fileService: FilesService,
                private blockImageService: BlockImageService,
                private blockCodeService: BlockCodeService,
                private blockTextService: BlockTextService,
                private paragraphService: ParagraphService,
                private hashtagsService: HashtagsService,
                private commentService: CommentsService,
                private ratingService: RatingService
    ) {
    }

//    async create(dto: CreatePostDto, image: any) {
    async create(dto: ManualDto) {
        try {
            const post = await this.postRepository.create(dto)
            if (!post) {
                throw new HttpException({message: '[Post]:  Create error'}, HttpStatus.BAD_REQUEST)
            }
            if (dto.hashtags.length > 0) {
                dto.hashtags.map(async (hashtag) => {
                    await this.hashtagsService.create({title: hashtag, postId: post.id})
                })
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

    async getAll(query: GetPostDto) {
        try {
            const page = Number(query.page)
            const limit = Number(query.limit)
            const sort = query.sort
            const order = query.order
            const search = query.search
            const hashtag = query.hashtag || ''
            const offset = (page - 1) * limit

            const filterHashtag = hashtag === ''
                ?
                {
                    model: Hashtags,
                }
                :
                {
                    model: Hashtags,
                    where: {
                        title: {
                            [sequelize.Op.in]: [hashtag]
                        }
                    }
                }

            const posts = await this.postRepository.findAll({
                offset,
                limit,
                include: [
                    {
                        model: Text,
                        include: [Paragraph],
                    },
                    filterHashtag,
                    {
                        all: true
                    }
                ],
                order: [
                    [sort, order],
                ],
                where: {
                    title: {
                        [sequelize.Op.like]: `%${search}%`
                    }
                },
            })

            if (posts.length > 0) {
                const all_posts = []
                posts.map((post) => {
                    const blocks = []
                    const post_data = post.dataValues
                    if (post_data.blockTexts) {
                        post_data.blockTexts.map(text => blocks.push(text))
                    }
                    if (post_data.blockImages) {
                        post_data.blockImages.map(image => blocks.push(image))
                    }
                    if (post_data.blockCodes) {
                        post_data.blockCodes.map(code => blocks.push(code))
                    }

                    delete post_data.blockTexts
                    delete post_data.blockImages
                    delete post_data.blockCodes

                    post_data.blocks = blocks
                    all_posts.push(post_data)
                })
                return all_posts
//                const count = await this.postRepository.count();
//                const totalPages = Math.ceil(count / limit);
//                return { all_posts, totalPages, page }
            }
        } catch (e) {
            throw new HttpException({message: '[post]:  Request error'} + e, HttpStatus.BAD_REQUEST)
        }
    }

    async getRecommendations() {
        try {
            let randomNumber = Math.floor(Math.random() * (10 - 1 + 1)) + 1;
            const page = randomNumber
            const limit = 5
            const offset = (page - 1) * limit

            const posts = await this.postRepository.findAll({
                offset,
                limit,
                include: [
                    {
                        model: Text,
                        include: [Paragraph],
                    },
                    {
                        all: true
                    }
                ],
            })

            if (posts.length > 0) {
                const all_posts = []
                posts.map((post) => {
                    const blocks = []
                    const post_data = post.dataValues
                    if (post_data.blockTexts) {
                        post_data.blockTexts.map(text => blocks.push(text))
                    }
                    if (post_data.blockImages) {
                        post_data.blockImages.map(image => blocks.push(image))
                    }
                    if (post_data.blockCodes) {
                        post_data.blockCodes.map(code => blocks.push(code))
                    }

                    delete post_data.blockTexts
                    delete post_data.blockImages
                    delete post_data.blockCodes

                    post_data.blocks = blocks
                    all_posts.push(post_data)
                })
                return all_posts
//                const count = await this.postRepository.count();
//                const totalPages = Math.ceil(count / limit);
//                return { all_posts, totalPages, page }
            }
        } catch (e) {
            throw new HttpException({message: '[post]:  Request error'} + e, HttpStatus.BAD_REQUEST)
        }
    }


    async delete(ids: number[]) {
        await this.blockImageService.delete(ids)
        await this.blockCodeService.delete(ids)
        await this.blockTextService.delete(ids)
        await this.hashtagsService.delete(ids)
        await this.commentService.delete(ids)
        await this.ratingService.delete(ids)

        const deleted = await this.postRepository.destroy({where: {id: ids}})
        if (deleted === 0) {
            throw new HttpException('post not found', HttpStatus.NOT_FOUND)
        } else {
            return {message: 'post deleted successfully', statusCode: HttpStatus.OK}
        }
    }

    async getPostById(id: number) {
        const post = await this.postRepository.findOne({
            where: {id},
            include: [
                {
                    model: Text,
                    include: [Paragraph],
                },
                {
                    all: true
                }
            ],
        })
        if (!post) {
            throw new HttpException('post not found', HttpStatus.NOT_FOUND)
        }
        const blocks = []
        const post_data = post.dataValues
        if (post_data.blockTexts) {
            post_data.blockTexts.map(text => blocks.push(text))
        }
        if (post_data.blockImages) {
            post_data.blockImages.map(image => blocks.push(image))
        }
        if (post_data.blockCodes) {
            post_data.blockCodes.map(code => blocks.push(code))
        }

        delete post_data.blockTexts
        delete post_data.blockImages
        delete post_data.blockCodes

        post_data.blocks = blocks

        return post_data
    }
}
