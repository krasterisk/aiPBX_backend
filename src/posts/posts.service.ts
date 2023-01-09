import {CreatePostDto} from "./dto/create-post.dto";
import {Post} from "./posts.model";
import {InjectModel} from "@nestjs/sequelize";
import {Injectable} from "@nestjs/common";
import {FilesService} from "../files/files.service";

@Injectable()
export class PostsService {

    constructor(@InjectModel(Post) private postRepository: typeof Post,
                private fileService: FilesService) {}

    async create(dto: CreatePostDto, image: any) {
        const filename = await this.fileService.createFile(image)
        const post = await this.postRepository.create({...dto, image: filename})
        return post
    }

    edit(id) {
        return id
    }

    delete(id) {
        return id
    }
}
