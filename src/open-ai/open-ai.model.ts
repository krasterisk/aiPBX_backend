export enum role {
  SYSTEM = 'system',
  USER = 'user'
}

export interface aiRequest {
  model: string
  messages: AiMessages[]
  stream?: boolean
}

export interface AiMessages {
  role: role
  content: string
}


