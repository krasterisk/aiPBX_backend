import { IsString } from "class-validator";
import { AiMessages } from "../open-ai.model";
import {sessionData} from "../open-ai.service";

export class openAiMessage {
  @IsString({message: 'Должно быть строкой'})
  readonly model: string
  readonly messages: AiMessages[]
  readonly store?: boolean
  readonly stream?: boolean
  readonly session?: sessionData
}
