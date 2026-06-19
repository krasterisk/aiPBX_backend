# Operator Analytics — переменные окружения

Канонический список значений/дефолтов — в [`.env.example`](../.env.example). Этот файл объясняет назначение, влияние на поведение и принцип обратной совместимости.

> **Принцип BC:** все поведенческие флаги имеют безопасный дефолт (выключено / legacy). Прод-поведение не меняется, пока флаг не включён явно. Пороговые переменные опциональны — при отсутствии берётся дефолт из кода (`DEFAULT_TRANSCRIPTION_QUALITY_THRESHOLDS`).

## STT / LLM провайдеры

| Переменная | Дефолт | Назначение |
|---|---|---|
| `DEFAULT_STT_PROVIDER` | `whisper` | Провайдер распознавания речи по умолчанию (`whisper` / внешний). |
| `DEFAULT_OLLAMA_MODEL` | `gemma4:e4b` | Локальная LLM-модель для анализа (Ollama). |
| `ANALYTICS_FALLBACK_MODEL` | `gemma4:e4b` | Фолбэк-модель, если основной LLM-путь недоступен. |

## Контроль качества распознавания (anti-garbage, §6)

Двухслойный гейт: сигналы STT до вызова LLM + самооценка LLM. Итоговый вердикт — худшая из severities. Записи с `unusable` не доходят до LLM (нет списания LLM), `low` анализируются с пометкой.

| Переменная | Дефолт | Назначение |
|---|---|---|
| `OPERATOR_ANALYSIS_MIN_DURATION_SEC` | `10` | Минимальная длительность записи (сек). Короче → `ERROR` без списания LLM. |
| `OPERATOR_QUALITY_MIN_WORDS` | `15` | Минимум слов в транскрипте; меньше → `unusable`. Отсекает «аналитику по нескольким словам». |
| `OPERATOR_QUALITY_AVG_LOGPROB_MIN` | `-1.0` | Порог среднего `avg_logprob` STT: ниже → `low`. |
| `OPERATOR_QUALITY_AVG_LOGPROB_UNUSABLE` | `-1.3` | Ниже → вклад в `unusable` (модель не уверена в распознанном). |
| `OPERATOR_QUALITY_MAX_NOSPEECH` | `0.6` | Доля «нет речи» (`no_speech_prob`): выше → `low`. |
| `OPERATOR_QUALITY_MAX_NOSPEECH_UNUSABLE` | `0.8` | Выше → `unusable` (тишина/шум). |
| `OPERATOR_QUALITY_MAX_COMPRESSION` | `2.4` | Compression ratio выше → `low` (повтор/галлюцинация). |
| `OPERATOR_QUALITY_MIN_COMPRESSION` | `0.5` | Compression ratio ниже → `low` (слишком разреженно). |
| `OPERATOR_QUALITY_MIN_LANGUAGE_PROB` | `0.5` | Уверенность определения языка ниже → `low`. |

## Безопасность / комплаенс (§8)

| Переменная | Дефолт | Назначение |
|---|---|---|
| `ENCRYPTION_KEY` | — (пусто → деривация из `JWT_SECRET`) | AES-256 ключ (64 hex). Используется для MCP-кредов и шифрования транскриптов. |
| `OPERATOR_ENCRYPT_TRANSCRIPTS` | `false` | Шифровать транскрипты at-rest (AES-256-GCM, маркер `enc:v1`). Старые plaintext-записи читаются как есть (dual-read). |
| `OPERATOR_RETENTION_DAYS` | `0` | TTL записей аналитики (дни). `0` → выключено. `>0` → возраст для очистки. |
| `OPERATOR_RETENTION_MODE` | `anonymize` | `anonymize` (чистит транскрипт/телефон, `BillingRecord` сохраняется) \| `delete` (каскадно удаляет, `BillingRecord` сохраняется). |
| `OPERATOR_RETENTION_BATCH` | `500` | Лимит записей за один прогон крона retention. |

## Стоимость и биллинг (§10)

| Переменная | Дефолт | Назначение |
|---|---|---|
| `OPERATOR_REGEN_REPLACE_COST` | `false` | Политика стоимости при перегенерации. `false` (BC): суммировать стоимость каждого прогона на агрегате `AiCdr`/`AiAnalytics`. `true`: заменять агрегат стоимостью последнего прогона. История списаний (`BillingRecord`, строка `type=analytic_regen`) сохраняется в любом случае. |

## Продуктовые метрики (§12)

| Переменная | Дефолт | Назначение |
|---|---|---|
| `OPERATOR_KEYWORD_SPOTTING` | — (пусто → выключено) | Список фраз через запятую для keyword spotting в транскрипте (комплаенс, конкуренты). Результат → `metrics._topics.keywords`. |
| `OPERATOR_ANOMALY_ENABLED` | `false` | Включить ежедневный cron проверки аномалий (CSAT drop / negativity spike). |
| `OPERATOR_ANOMALY_WINDOW_DAYS` | `7` | Размер окна «недавно» и «база» (дни). |
| `OPERATOR_ANOMALY_CSAT_DROP_PCT` | `20` | Алерт, если CSAT упал на ≥ N% относительно базового окна. |
| `OPERATOR_ANOMALY_NEGATIVE_SPIKE_PCT` | `15` | Алерт, если доля негатива выросла на ≥ N п.п. |
| `OPERATOR_ANOMALY_MIN_CALLS` | `5` | Минимум звонков в каждом окне для срабатывания. |

Webhook: добавьте `anomaly.detected` в `webhookEvents` проекта.

## AI Insights (dashboard)

| Переменная | Дефолт | Назначение |
|---|---|---|
| `OPERATOR_INSIGHTS_MIN_CALLS` | `10` | Минимум проанализированных звонков для генерации инсайтов (и флаг `insightsAvailable` на дашборде). |
| `OPERATOR_INSIGHTS_TTL_SEC` | `3600` | TTL in-memory кэша инсайтов (секунды). |
| `OPERATOR_INSIGHTS_MAX_COUNT` | `6` | Максимум инсайтов в ответе API. |

Ключ кэша включает `userId` (tenant), фильтры, `INSIGHTS_PROMPT_VERSION` и digest фактов. Query `refresh=1` обходит кэш.

## Пайплайн (§13)

| Переменная | Дефолт | Назначение |
|---|---|---|
| `OPERATOR_STUCK_MINUTES` | `0` | Reaper: записи в `processing` старше N минут → `ERROR` («timeout»), без доп. списаний. `0` → выключено. Cron каждые 10 мин. |
| `OPERATOR_DEDUP_BY_HASH` | `false` | Дедуп загрузок: одинаковый SHA-256 аудио + тот же `projectId` → переиспользовать готовый анализ, без STT/LLM/списания. |

Дедуп требует колонку `audioSha256` (миграция `2026-06-18-operator-audio-hash`). Дашборд агрегирует числовые метрики через `operator_metric_values` (SQL `GROUP BY`) с fallback на JSON; time series / scorecards — постраничная загрузка CDR.

## Offline eval (§11)

| Команда | Назначение |
|---|---|
| `npm run eval:operator` | Прогон golden set без BillingRecord (dry-run). См. `src/operator-analytics/eval/README.md`. |
