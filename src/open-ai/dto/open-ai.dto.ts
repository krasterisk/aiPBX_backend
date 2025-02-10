import { IsString } from "class-validator";
import { AiMessages } from "../open-ai.model";

export class openAiMessage {
  @IsString({message: 'Должно быть строкой'})
  readonly model: string
  readonly messages: AiMessages[]
  readonly store?: boolean
  readonly stream?: boolean
}
