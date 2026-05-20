import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ValidationException } from '../exceptions/validation.exception';

@Injectable()
export class ValidationPipe implements PipeTransform<any> {
    async transform(value: any, metadata: ArgumentMetadata): Promise<any> {
        if (metadata.type !== 'body') {
            return value;
        }

        const { metatype } = metadata;
        if (!metatype || !this.toValidate(metatype)) {
            return value;
        }

        const obj = plainToInstance(metatype, value);
        const errors = await validate(obj);

        if (errors.length) {
            const messages = errors.map((err) => {
                return `${err.property} - ${Object.values(err.constraints ?? {}).join(', ')}`;
            });
            throw new ValidationException(messages);
        }
        return value;
    }

    private toValidate(metatype: Function): boolean {
        const types: Function[] = [String, Boolean, Number, Array, Object];
        return !types.includes(metatype);
    }
}
