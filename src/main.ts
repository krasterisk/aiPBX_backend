import {NestFactory} from "@nestjs/core";
import {AppModule} from "./app.module";
import {DocumentBuilder, SwaggerModule} from "@nestjs/swagger";
import {ValidationPipe} from "./pipes/validation.pipe";

async function start() {
    console.log(`${process.env.NODE_ENV}`)
    const PORT = process.env.PORT
    const app = await NestFactory.create(AppModule)
    app.setGlobalPrefix('api')
    const config = new DocumentBuilder()
        .setTitle('Simple PBX')
        .setDescription('REST API Documentation')
        .setVersion('1.0.1')
            .addTag('Simple PBX API')
        .build()
    const document = SwaggerModule.createDocument(app, config)
        SwaggerModule.setup('/api/docs', app, document)

    app.useGlobalPipes(new ValidationPipe())

    await app.listen(PORT, () => console.log(`Server started on port ${PORT}`))
}

start()