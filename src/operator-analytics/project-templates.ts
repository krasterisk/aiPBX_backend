import { ProjectTemplate } from './interfaces/operator-metrics.interface';

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
    {
        id: 'real_estate',
        name: 'Недвижимость',
        description: 'Анализ звонков агентов по недвижимости',
        systemPrompt: 'Контекст: агентство недвижимости. Операторы консультируют клиентов по покупке/аренде жилой и коммерческой недвижимости. Важно оценить качество презентации объектов и работу с бюджетом клиента.',
        customMetricsSchema: [
            { id: 'needs_analysis', name: 'Выявление потребностей', type: 'number', description: 'Насколько оператор выявил ключевые критерии клиента: бюджет, район, площадь, тип недвижимости (0-100)' },
            { id: 'property_presentation', name: 'Презентация объекта', type: 'number', description: 'Качество описания характеристик и преимуществ объекта (0-100)' },
            { id: 'viewing_scheduled', name: 'Назначен показ', type: 'boolean', description: 'Был ли назначен показ объекта (true/false)' },
            { id: 'objection_price', name: 'Работа с ценой', type: 'number', description: 'Как оператор обработал возражения по цене (0-100)' },
        ],
        visibleDefaultMetrics: [
            'greeting_quality', 'politeness_empathy', 'active_listening',
            'objection_handling', 'product_knowledge', 'closing_quality',
        ],
    },
    {
        id: 'delivery',
        name: 'Доставка',
        description: 'Анализ звонков службы доставки',
        systemPrompt: 'Контекст: служба доставки еды/товаров. Операторы принимают заказы, уточняют адрес и состав, предлагают дополнительные товары. Важно проверять попытки допродажи.',
        customMetricsSchema: [
            { id: 'upsell_attempt', name: 'Попытка допродажи', type: 'boolean', description: 'Предложил ли оператор дополнительные товары или увеличение размера заказа (true/false)' },
            { id: 'order_accuracy', name: 'Точность заказа', type: 'number', description: 'Насколько точно оператор зафиксировал состав и детали заказа (0-100)' },
            { id: 'delivery_time_communicated', name: 'Время доставки озвучено', type: 'boolean', description: 'Сообщил ли оператор ожидаемое время доставки (true/false)' },
            { id: 'address_confirmation', name: 'Подтверждение адреса', type: 'boolean', description: 'Подтвердил ли оператор адрес доставки (true/false)' },
        ],
        visibleDefaultMetrics: [
            'greeting_quality', 'script_compliance', 'politeness_empathy',
            'speech_clarity_pace', 'closing_quality',
        ],
    },
    {
        id: 'tech_support',
        name: 'Техподдержка',
        description: 'Анализ звонков технической поддержки',
        systemPrompt: 'Контекст: служба технической поддержки. Операторы решают проблемы пользователей с продуктом/сервисом. Важно оценить диагностику проблемы и следование базе знаний.',
        customMetricsSchema: [
            { id: 'problem_diagnosis', name: 'Диагностика проблемы', type: 'number', description: 'Насколько точно оператор определил корневую причину проблемы (0-100)' },
            { id: 'kb_usage', name: 'Использование базы знаний', type: 'boolean', description: 'Использовал ли оператор базу знаний / документацию при решении (true/false)' },
            { id: 'ticket_created', name: 'Тикет создан', type: 'boolean', description: 'Был ли создан тикет для нерешённой проблемы (true/false)' },
            { id: 'resolution_method', name: 'Метод решения', type: 'enum', description: 'Каким образом проблема была решена', enumValues: ['self_resolved', 'escalated', 'callback', 'unresolved'] },
        ],
        visibleDefaultMetrics: [
            'greeting_quality', 'active_listening', 'product_knowledge',
            'problem_resolution', 'politeness_empathy', 'closing_quality',
        ],
    },
    {
        id: 'bank',
        name: 'Банк / Финансы',
        description: 'Анализ звонков банковского контакт-центра',
        systemPrompt: 'Контекст: банковский контакт-центр. Операторы консультируют по продуктам банка: кредиты, вклады, карты, переводы. Важно соблюдение комплаенса и идентификация клиента.',
        customMetricsSchema: [
            { id: 'client_identification', name: 'Идентификация клиента', type: 'boolean', description: 'Провёл ли оператор идентификацию клиента согласно процедуре (true/false)' },
            { id: 'compliance', name: 'Комплаенс', type: 'number', description: 'Соблюдение нормативных требований и раскрытие информации о рисках (0-100)' },
            { id: 'cross_sell', name: 'Кросс-продажа', type: 'boolean', description: 'Предложил ли оператор дополнительные банковские продукты (true/false)' },
            { id: 'data_security', name: 'Безопасность данных', type: 'number', description: 'Не раскрыл ли оператор конфиденциальные данные, соблюдение политики безопасности (0-100)' },
        ],
        visibleDefaultMetrics: [
            'greeting_quality', 'script_compliance', 'politeness_empathy',
            'product_knowledge', 'problem_resolution', 'closing_quality',
        ],
    },
    {
        id: 'sales',
        name: 'Продажи',
        description: 'Анализ звонков отдела продаж',
        systemPrompt: 'Контекст: отдел продаж. Операторы проводят холодные/тёплые звонки, презентуют продукт и закрывают сделки. Важно оценить навыки продаж и конверсию.',
        customMetricsSchema: [
            { id: 'needs_discovery', name: 'Выявление потребности', type: 'number', description: 'Насколько глубоко оператор выявил потребности клиента (0-100)' },
            { id: 'value_proposition', name: 'Ценностное предложение', type: 'number', description: 'Качество презентации ценности продукта для конкретного клиента (0-100)' },
            { id: 'close_attempt', name: 'Попытка закрытия', type: 'boolean', description: 'Сделал ли оператор попытку закрыть сделку / назначить встречу (true/false)' },
            { id: 'next_step_agreed', name: 'Следующий шаг согласован', type: 'boolean', description: 'Был ли согласован конкретный следующий шаг с клиентом (true/false)' },
        ],
        visibleDefaultMetrics: [
            'greeting_quality', 'active_listening', 'objection_handling',
            'product_knowledge', 'closing_quality', 'politeness_empathy',
        ],
    },
];
