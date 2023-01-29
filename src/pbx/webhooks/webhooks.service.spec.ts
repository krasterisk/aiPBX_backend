import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksService } from './webhooks.service';
import {Webhook} from "./webhook.model";

describe('WebhooksService', () => {
  let service: WebhooksService;
  const webhookRepositoryFactory = () => {

  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WebhooksService,
     ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
