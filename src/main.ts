import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { ValidationPipe } from "@nestjs/common";
import helmet from 'helmet';

async function start() {
    console.log(`${process.env.NODE_ENV}`)
    const PORT = process.env.PORT
    const app = await NestFactory.create(AppModule, { rawBody: true })
    app.setGlobalPrefix('api', { exclude: ['static/{*path}'] })


    const config = new DocumentBuilder()
        .setTitle('AI PBX')
        .setDescription('REST API Documentation')
        .setVersion('1.0.1')
        .addTag('AI PBX API')
        .build()
    const document = SwaggerModule.createDocument(app, config)

    if (process.env.NODE_ENV !== 'production') {
        SwaggerModule.setup('/api/docs', app, document)
    }

    app.useGlobalPipes(new ValidationPipe({
        transform: true,
        skipMissingProperties: true
    }))

    // Security headers (configured for cross-origin API)
    app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: { policy: 'cross-origin' },
    }))

    // Enable Cors
    app.enableCors()

    await app.listen(PORT, () => console.log(`Server started on port ${PORT}`))
}

start()
