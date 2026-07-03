/**
 * Export OpenAPI schema from NestJS app.
 * Usage: npm run swagger:export (requires .development.env with DB_* vars)
 */
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { writeFileSync } from 'fs'
import { resolve } from 'path'
import { AppModule } from '../src/app.module'

async function exportOpenApi (): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] })
  app.setGlobalPrefix('api', { exclude: ['static/{*path}'] })

  const config = new DocumentBuilder()
    .setTitle('AI PBX')
    .setDescription('REST API Documentation')
    .setVersion('2.3.3')
    .addBearerAuth()
    .build()

  const document = SwaggerModule.createDocument(app, config)
  const outPath = resolve(__dirname, '..', 'openapi.json')
  writeFileSync(outPath, JSON.stringify(document, null, 2))
  console.log(`OpenAPI schema written to ${outPath}`)

  await app.close().catch(() => undefined)
}

exportOpenApi().catch((err) => {
  console.error('Failed to export OpenAPI schema:', err)
  process.exit(1)
})
