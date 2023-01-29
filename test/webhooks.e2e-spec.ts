import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import {WebhookDto} from "../src/pbx/webhooks/dto/webhook.dto";

const createDto: WebhookDto = {
	name: "ops2222",
	events: "onAnswer",
	vpbx_user_id: 1
}


describe('AppController (e2e)', () => {
  let app: INestApplication;
  let createdId: string

  beforeEach(async () => {
	const moduleFixture: TestingModule = await Test.createTestingModule({
		imports: [AppModule],
	}).compile();

	app = moduleFixture.createNestApplication();
	await app.init();
  });

  it('/webhooks (POST)', async () => {
	return request(app.getHttpServer())
		.post('/webhooks')
		.send(createDto)
		.expect(201)
		.then(({body}: request.Response) => {
			createdId = body.id
			expect(createdId).toBeDefined()
		});
  });

	it('/webhooks (DELETE)', async () => {
		return request(app.getHttpServer())
			.delete('/webhooks')
			.send({ids: createdId})
			.expect(200)
	});

	afterAll(async () => {

		//sequelize.close()
  })
});
