import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProjectDto, GenerateSchemaDto, UpdateProjectDto, UpdateSchemaDto } from './project.dto';

describe('project prompt validation', () => {
    const longPrompt = 'Правило классификации звонков.\n'.repeat(1000);
    const schema = {
        systemPrompt: longPrompt,
        customMetricsSchema: [{
            id: 'quality', name: 'Качество', type: 'boolean', description: longPrompt,
        }],
        callTaxonomy: [{
            id: 'booking', name: 'Запись', aliases: [], description: longPrompt,
        }],
    };
    const options = { whitelist: true, forbidNonWhitelisted: true };

    it('accepts long prompts when creating a project', async () => {
        const dto = plainToInstance(CreateProjectDto, { name: 'Клиника', ...schema, successPrompt: longPrompt });
        expect(await validate(dto, options)).toEqual([]);
        expect(dto.callTaxonomy[0].description).toBe(longPrompt);
    });

    it('accepts long prompts when updating project settings', async () => {
        const dto = plainToInstance(UpdateProjectDto, { ...schema, successPrompt: longPrompt });
        expect(await validate(dto, options)).toEqual([]);
        expect(dto.customMetricsSchema[0].description).toBe(longPrompt);
    });

    it('accepts long prompts in the schema update and generation endpoints', async () => {
        expect(await validate(plainToInstance(UpdateSchemaDto, schema), options)).toEqual([]);
        expect(await validate(plainToInstance(GenerateSchemaDto, {
            systemPrompt: longPrompt, messages: [{ role: 'user', content: 'Создай чек-лист' }],
        }), options)).toEqual([]);
    });

    it('still rejects non-string prompts including nested topic and metric descriptions', async () => {
        const dto = plainToInstance(UpdateProjectDto, {
            systemPrompt: 123,
            successPrompt: {},
            customMetricsSchema: [{ ...schema.customMetricsSchema[0], description: 123 }],
            callTaxonomy: [{ ...schema.callTaxonomy[0], description: false }],
        });
        const errors = await validate(dto, options);
        expect(errors.map(error => error.property)).toEqual(expect.arrayContaining([
            'systemPrompt', 'successPrompt', 'customMetricsSchema', 'callTaxonomy',
        ]));
    });
});
