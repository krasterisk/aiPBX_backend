export class TelegramAuthDto {
  id: number;           // Telegram user ID
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;     // UNIX timestamp
  hash: string;          // подпись для проверки
}
