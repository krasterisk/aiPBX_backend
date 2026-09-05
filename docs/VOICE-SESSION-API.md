# Voice Session WebSocket API

Каскад как в Playground: непрерывный PCM с клиента → VAD → STT → LLM → TTS, ответ стримится чанками. Для колонки или голосового чата.

Работает на **aipbx.net** (GPU: Whisper, Ollama, OmniVoice). На aipbx.ru / aipbx.org сессия откроется, но STT/TTS вернут ошибку, если контейнеры недоступны.

## 1. API-ключ

Ключ создаёт владелец ассистента (JWT кабинета):

```http
POST /api/api-keys
Authorization: Bearer <jwt>
Content-Type: application/json

{ "name": "speaker / voice-chat", "scopes": ["voice:session"] }
```

Ответ один раз содержит `rawToken` вида `aipbx_…`. Его нельзя получить повторно.

Ключ без `scopes` (или `null`) тоже подходит. Ключ только с `chat:message` / `tts:synthesize` — нет.

Ассистент должен принадлежать тому же `userId`, что и ключ. Чужой `assistantId` → `error: Assistant not found`.

## 2. Подключение

Socket.IO, порт **3033**, namespace **`/voice`**.

```
wss://aipbx.net:3033/voice
```

Локально / без TLS: `ws://<host>:3033/voice`.

```js
import { io } from 'socket.io-client';

const socket = io('https://aipbx.net:3033/voice', {
  auth: { token: process.env.AIPBX_API_KEY },
  transports: ['websocket'],
});
```

Токен также можно передать так:

- заголовок `Authorization: Bearer aipbx_…`
- query `?token=aipbx_…`

Неверный или просроченный ключ: соединение закрывается с `unauthorized` (handshake reject, не Socket.IO event).

## 3. Аудио

| | Формат |
|---|---|
| Кодек | PCM16 little-endian, mono |
| Разрешённые частоты | `8000`, `16000`, `24000` |
| По умолчанию вход/выход | `16000` |
| VAD на сервере | всегда 16 kHz (ресемпл делает бэкенд) |

Чанки лучше слать каждые 20–100 мс. Не ждать конца фразы: сервер сам режет речь (Silero VAD).

На выходе те же PCM16 LE mono с частотой `outputSampleRate` из `session.start`.

## 4. Протокол

### Клиент → сервер

**`session.start`**

```json
{
  "assistantId": 123,
  "inputSampleRate": 16000,
  "outputSampleRate": 16000,
  "callerId": "speaker-kitchen"
}
```

`assistantId` обязателен. `callerId` попадает в CDR и в промпт как телефон, если задан.

После старта сервер может сразу прислать `audio` — это greeting ассистента.

**`audio`** — binary: сырой PCM16 (не JSON, не WAV, не base64).

**`session.end`** — закрыть каскад, сокет можно оставить и открыть новую сессию.

Отключение сокета = `session.end`.

Один сокет — одна сессия. Повторный `session.start` закрывает предыдущую.

### Сервер → клиент

| Событие | Payload | Когда |
|---|---|---|
| `session.ready` | `{ channelId, assistantId, inputSampleRate, outputSampleRate }` | пайплайн готов |
| `audio` | `Buffer` PCM16 | greeting и ответ бота, чанками |
| `speech.start` | — | VAD услышал речь |
| `speech.end` | — | конец реплики, пошёл STT→LLM→TTS |
| `transcript.user` | `{ text }` | распознанная реплика |
| `transcript.assistant` | `{ text }` | полный ответ после генерации |
| `interrupt` | — | пользователь перебил TTS (barge-in) |
| `error` | `{ message }` | ошибка старта / ассистент / частота |
| `session.ended` | — | ответ на `session.end` |

Пока играет `audio`, новый `speech.start` рвёт TTS: клиент должен сразу остановить воспроизведение по `interrupt`.

## 5. Минимальный клиент (Node)

```js
import { io } from 'socket.io-client';

const INPUT_RATE = 16000;
const socket = io('https://aipbx.net:3033/voice', {
  auth: { token: process.env.AIPBX_API_KEY },
  transports: ['websocket'],
});

socket.on('connect', () => {
  socket.emit('session.start', {
    assistantId: Number(process.env.ASSISTANT_ID),
    inputSampleRate: INPUT_RATE,
    outputSampleRate: INPUT_RATE,
  });
});

socket.on('session.ready', (info) => {
  console.log('ready', info);
  // mic.on('data', (pcm16) => socket.emit('audio', pcm16));
});

socket.on('audio', (pcm) => {
  // speaker.write(pcm)  — PCM16 LE mono @ outputSampleRate
});

socket.on('interrupt', () => {
  // speaker.clear()
});

socket.on('transcript.user', ({ text }) => console.log('user:', text));
socket.on('transcript.assistant', ({ text }) => console.log('bot:', text));
socket.on('error', (e) => console.error(e));
socket.on('connect_error', (e) => console.error('handshake', e.message));
```

Python (`python-socketio` + websocket):

```python
import os
import socketio

sio = socketio.Client()

@sio.event
def connect():
    sio.emit('session.start', {
        'assistantId': int(os.environ['ASSISTANT_ID']),
        'inputSampleRate': 16000,
        'outputSampleRate': 16000,
    })

@sio.on('session.ready')
def ready(info):
    print('ready', info)

@sio.on('audio')
def audio(pcm: bytes):
    pass  # play PCM16 LE mono

@sio.on('interrupt')
def interrupt(_=None):
    pass  # stop playback

sio.connect(
    'https://aipbx.net:3033',
    socketio_path='socket.io',
    namespaces=['/voice'],
    auth={'token': os.environ['AIPBX_API_KEY']},
    transports=['websocket'],
)
# sio.emit('audio', pcm_bytes, namespace='/voice')
```

## 6. Настройка ассистента

В кабинете aiPBX:

- `pipelineMode`: `non-realtime` (этот API всегда гоняет локальный каскад)
- `sttProvider` / язык транскрипции
- `llmProvider` + модель
- `ttsProvider`: `omnivoice` (или `silero`)
- `ttsVoice`: `default` или загруженный reference `.wav`
- greeting, instruction, tools — как для телефонных звонков

История диалога живёт, пока открыта сессия.

## 7. Ограничения

- GPU одна на сервер: живые звонки, Playground и Voice Session делят Whisper / OmniVoice.
- TTS OmniVoice: до 2 параллельных синтезов в контейнере.
- Не открывайте OmniVoice и Whisper напрямую — только этот сокет или HTTP `/api/tts` для готового текста.

## 8. Отличие от HTTP TTS

| | `POST /api/tts` | Voice Session |
|---|---|---|
| Scope | `tts:synthesize` | `voice:session` |
| Вход | текст | PCM поток |
| Выход | один WAV/PCM | стрим + transcripts + barge-in |
| Память диалога | нет | да, на время сокета |
