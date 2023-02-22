import {CreatePostDto} from "./dto/create-post.dto";
import {Post} from "./posts.model";
import {InjectModel} from "@nestjs/sequelize";
import {HttpException, HttpStatus, Injectable} from "@nestjs/common";
import {FilesService} from "../files/files.service";

@Injectable()
export class PostsService {

    constructor(@InjectModel(Post) private postRepository: typeof Post,
                private fileService: FilesService) {}

//    async create(dto: CreatePostDto, image: any) {
    async create(dto: CreatePostDto) {
        try {
//            const filename = await this.fileService.createFile(image)
//            const post = await this.postRepository.create({...dto, image: filename})
            const post = await this.postRepository.create(dto)
            return post

        } catch (e) {
            throw new HttpException({message: '[post]:  Create error'} +e, HttpStatus.BAD_REQUEST)
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
            const post = await this.postRepository.findAll()
            if (post) {
                return post
            }

        } catch (e) {
            throw new HttpException({message: '[post]:  Request error'} +e, HttpStatus.BAD_REQUEST)
        }
    }

    async delete(ids: number[]) {
        const deleted = await this.postRepository.destroy({where: { id: ids } })
        if(deleted === 0) {
            throw new HttpException('post not found', HttpStatus.NOT_FOUND)
        } else {
            return {message: 'post deleted successfully', statusCode: HttpStatus.OK}
        }
    }

    async getPostById(id: number) {
        const post = await this.postRepository.findOne({where: {id}})
        if(!post) {
            throw new HttpException('post not found', HttpStatus.NOT_FOUND)
        } else {
            return post
        }
    }
}
