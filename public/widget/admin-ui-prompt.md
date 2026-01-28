# AI Prompt: Widget Management Admin UI

## Задача

Создай React админ-панель для управления AI voice виджетами. Пользователи смогут создавать виджеты, настраивать их внешний вид и получать готовый код для вставки на сайт.

---

## Стек технологий

- **Framework:** React + TypeScript
- **UI Library:** Material-UI (MUI) v5 или Ant Design
- **State:** React Query для API запросов
- **Forms:** React Hook Form + Zod для валидации
- **Code Display:** react-syntax-highlighter
- **Clipboard:** react-copy-to-clipboard

---

## Backend API (уже реализован)

```typescript
// Получить список виджетов
GET /widget-keys
Headers: { Authorization: Bearer <token> }
Response: WidgetKey[]

// Создать виджет
POST /widget-keys
Body: {
  name: string,
  assistantId: number,
  allowedDomains: string[],
  maxConcurrentSessions?: number
}
Response: WidgetKey

// Обновить виджет
PUT /widget-keys/:id
Body: {
  name?: string,
  allowedDomains?: string[],
  maxConcurrentSessions?: number,
  isActive?: boolean
}

// Удалить виджет
DELETE /widget-keys/:id

// Получить ассистентов (для dropdown)
GET /assistants
Response: Assistant[]
```

### TypeScript Types

```typescript
interface WidgetKey {
  id: number;
  publicKey: string;        // "wk_xxxxx"
  name: string;
  userId: number;
  assistantId: number;
  allowedDomains: string;   // JSON: '["example.com"]'
  maxConcurrentSessions: number;
  isActive: boolean;
  createdAt: string;
  assistant?: {
    id: number;
    name: string;
    voice: string;
  };
}
```

---

## UI Компоненты

### 1. WidgetList - Список виджетов

**Макет:**
```
┌─────────────────────────────────────────┐
│ My Widgets        [Search] [+ Create]   │
├─────────────────────────────────────────┤
│ Name    │ Assistant │ Domains  │ Status │
│ Website │ Support   │ 2 domains│ ✓ Active│
│ Mobile  │ Sales Bot │ 1 domain │ ○ Inactive│
└─────────────────────────────────────────┘
```

**Features:**
- Таблица с колонками: Name, Assistant, Domains, Max Sessions, Status, Actions
- Search bar по названию
- Кнопка "Create Widget"
- Actions menu (⋮): Edit, Get Code, Delete
- Status badge (зелёный/серый)
- Empty state если нет виджетов

### 2. CreateWidgetDialog - Создание виджета

**Форма состоит из 2 секций:**

#### Секция 1: Basic Settings (сохраняются в backend)

```tsx
<TextField
  label="Widget Name"
  name="name"
  required
  helperText="Internal name for your reference"
/>

<Select
  label="AI Assistant"
  name="assistantId"
  required
>
  {assistants.map(a => (
    <MenuItem value={a.id}>
      {a.name} ({a.voice})
    </MenuItem>
  ))}
</Select>

<ChipsInput
  label="Allowed Domains"
  name="allowedDomains"
  required
  helperText="Domains where widget can be embedded (without https://)"
  placeholder="example.com"
/>

<TextField
  label="Max Concurrent Sessions"
  name="maxConcurrentSessions"
  type="number"
  defaultValue={10}
  helperText="Maximum simultaneous conversations (1-100)"
/>
```

#### Секция 2: Appearance Settings (только для генерации кода)

**ВАЖНО:** Эти настройки НЕ сохраняются в backend, используются только для генерации embed кода!

```tsx
<Accordion title="Button Customization">
  <Select label="Position">
    <MenuItem value="bottom-right">Bottom Right</MenuItem>
    <MenuItem value="bottom-left">Bottom Left</MenuItem>
    <MenuItem value="top-right">Top Right</MenuItem>
    <MenuItem value="top-left">Top Left</MenuItem>
  </Select>
  
  <TextField
    label="Button Color"
    type="color"
    defaultValue="#667eea"
  />
</Accordion>

<Accordion title="Theme & Colors">
  <Select label="Theme">
    <MenuItem value="light">Light</MenuItem>
    <MenuItem value="dark">Dark</MenuItem>
    <MenuItem value="auto">Auto (system)</MenuItem>
  </Select>
  
  <TextField label="Primary Color" type="color" />
  <TextField label="Accent Color" type="color" />
</Accordion>

<Accordion title="Advanced">
  <Select label="Language">
    <MenuItem value="en">English</MenuItem>
    <MenuItem value="ru">Русский</MenuItem>
    <MenuItem value="es">Español</MenuItem>
  </Select>
  
  <Switch label="Show Branding" defaultChecked />
</Accordion>
```

### 3. GetCodeDialog - Генерация кода для вставки

**Компоненты:**

```tsx
<Dialog maxWidth="md">
  <DialogTitle>
    Embed Code for "{widgetName}"
  </DialogTitle>
  
  <DialogContent>
    {/* Alert с инструкцией */}
    <Alert severity="info">
      Copy this code and paste before closing &lt;/body&gt; tag
    </Alert>
    
    {/* Код с подсветкой */}
    <CodeBlock>
      <CopyButton>Copy Code</CopyButton>
      <SyntaxHighlighter language="html">
{`<!-- AI Voice Widget -->
<script 
  src="https://cdn.yourdomain.com/widget.js"
  data-key="${publicKey}"
  data-api="https://api.yourdomain.com"
  data-position="bottom-right"
  data-theme="light"
  data-primary-color="#667eea"
  data-accent-color="#764ba2"
  data-language="en"
></script>`}
      </SyntaxHighlighter>
    </CodeBlock>
    
    {/* Инструкции */}
    <Accordion title="Installation Instructions">
      <Steps>
        <Step>1. Copy the code above</Step>
        <Step>2. Open your website HTML</Step>
        <Step>3. Paste before &lt;/body&gt;</Step>
        <Step>4. Save and refresh!</Step>
      </Steps>
    </Accordion>
    
    <Accordion title="WordPress">
      <Text>
        Go to Appearance → Theme Editor → footer.php
        Paste code before &lt;/body&gt;
      </Text>
    </Accordion>
  </DialogContent>
</Dialog>
```

---

## Генерация Embed Кода

### Функция generateEmbedCode()

```typescript
interface WidgetSettings {
  buttonPosition: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  buttonColor: string;
  theme: 'light' | 'dark' | 'auto';
  primaryColor: string;
  accentColor: string;
  language: 'en' | 'ru' | 'es';
  showBranding: boolean;
}

function generateEmbedCode(
  widget: WidgetKey, 
  settings: WidgetSettings
): string {
  const attributes = [
    `src="https://cdn.yourdomain.com/widget.js"`,
    `data-key="${widget.publicKey}"`,
    `data-api="https://api.yourdomain.com"`
  ];
  
  // Добавляем опциональные атрибуты только если они отличаются от defaults
  if (settings.buttonPosition !== 'bottom-right') {
    attributes.push(`data-position="${settings.buttonPosition}"`);
  }
  
  if (settings.theme !== 'light') {
    attributes.push(`data-theme="${settings.theme}"`);
  }
  
  if (settings.primaryColor !== '#667eea') {
    attributes.push(`data-primary-color="${settings.primaryColor}"`);
  }
  
  if (settings.accentColor !== '#764ba2') {
    attributes.push(`data-accent-color="${settings.accentColor}"`);
  }
  
  if (settings.language !== 'en') {
    attributes.push(`data-language="${settings.language}"`);
  }
  
  if (!settings.showBranding) {
    attributes.push(`data-hide-branding="true"`);
  }
  
  return `<!-- AI Voice Widget -->\n<script\n  ${attributes.join('\n  ')}\n></script>`;
}
```

---

## React Query Hooks

### useWidgets.ts

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useWidgets() {
  return useQuery({
    queryKey: ['widgets'],
    queryFn: async () => {
      const res = await fetch('/api/widget-keys', {
        headers: { 
          'Authorization': `Bearer ${getToken()}` 
        }
      });
      return res.json();
    }
  });
}

export function useCreateWidget() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: CreateWidgetDto) => {
      const res = await fetch('/api/widget-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify(data)
      });
      
      if (!res.ok) throw new Error('Failed to create widget');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['widgets'] });
    }
  });
}

export function useDeleteWidget() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/widget-keys/${id}`, {
        method: 'DELETE',
        headers: { 
          'Authorization': `Bearer ${getToken()}` 
        }
      });
      
      if (!res.ok) throw new Error('Failed to delete widget');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['widgets'] });
    }
  });
}
```

---

## Валидация с Zod

```typescript
import { z } from 'zod';

const createWidgetSchema = z.object({
  name: z.string()
    .min(3, 'Name must be at least 3 characters')
    .max(50, 'Name too long'),
  
  assistantId: z.number()
    .positive('Please select an assistant'),
  
  allowedDomains: z.array(z.string())
    .min(1, 'Add at least one domain')
    .refine((domains) => {
      return domains.every(d => 
        /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(d)
      );
    }, 'Invalid domain format. Use: example.com'),
  
  maxConcurrentSessions: z.number()
    .min(1).max(100)
    .optional()
    .default(10),
});

type CreateWidgetDto = z.infer<typeof createWidgetSchema>;
```

---

## User Flow

### Создание виджета

1. User нажимает "Create Widget"
2. Открывается диалог с формой
3. Заполняет Basic Settings (name, assistant, domains)
4. Настраивает Appearance (опционально)
5. Нажимает "Create"
6. После успеха показывается GetCodeDialog автоматически
7. User копирует код
8. Диалог закрывается, список обновляется

### Получение кода существующего виджета

1. User нажимает "Get Code" в actions menu
2. Открывается GetCodeDialog
3. Если appearance настройки не сохранены, используются defaults
4. User может изменить настройки и код обновится
5. Copy to clipboard
6. Toast: "Code copied!"

---

## Error Handling

```typescript
// Toast notifications для успеха/ошибок
try {
  await createWidget(data);
  showSuccess('Widget created!');
  openGetCodeDialog();
} catch (error) {
  if (error.status === 400) {
    showError('Invalid data. Check your inputs.');
  } else if (error.status === 403) {
    showError('Permission denied.');
  } else {
    showError('Failed to create widget. Try again.');
  }
}

// Empty state
if (widgets.length === 0) {
  return (
    <EmptyState>
      <Icon>🎤</Icon>
      <Title>No widgets yet</Title>
      <Description>Create your first widget to get started</Description>
      <Button onClick={openCreate}>Create Widget</Button>
    </EmptyState>
  );
}
```

---

## Design Requirements

**Colors:**
- Primary: #667eea (purple/blue gradient)
- Secondary: #764ba2
- Success: #10b981
- Error: #ef4444

**Typography:**
- Font: -apple-system, Roboto, sans-serif
- Headings: 600 weight
- Body: 400 weight

**Spacing:**
- Consistent padding: 16px, 24px, 32px
- Border radius: 8px

**Components:**
- Cards with elevation
- Smooth transitions (0.3s)
- Responsive tables
- Mobile-friendly dialogs

---

## Deliverables

Создай следующие файлы:

1. **pages/widgets/index.tsx** - main page
2. **components/WidgetList.tsx** - таблица
3. **components/CreateWidgetDialog.tsx** - форма создания
4. **components/GetCodeDialog.tsx** - генератор кода
5. **hooks/useWidgets.ts** - React Query hooks
6. **utils/generateEmbedCode.ts** - функция генерации
7. **schemas/widgetSchema.ts** - Zod валидация

---

## Критерии успеха

✅ Создание виджета за < 60 секунд  
✅ Код генерируется автоматически  
✅ Copy to clipboard одним кликом  
✅ Валидация работает  
✅ UI красивый и интуитивный  
✅ Responsive на всех устройствах  
✅ Error handling для всех API запросов

---

Начни с создания WidgetList и CreateWidgetDialog!
