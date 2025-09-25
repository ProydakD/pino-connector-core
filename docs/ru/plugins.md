# Плагины

[English](../en/plugins.md) | Русский

Плагины добавляют логику вокруг конвейера логирования.

## Хуки до сериализации

- Получают { record, setRecord }
- Могут заменить запись через setRecord
- Выполняются по возрастанию order

```ts
// Этот плагин добавляет ID запроса в каждую запись лога.
const beforePlugin = {
  name: "request-id",
  stage: "before", // Запускается до обработки лога.
  order: 10, // Порядок выполнения плагина.
  hook({ record, setRecord }) {
    // Добавляем случайный UUID в качестве ID запроса в контекст.
    setRecord({
      ...record,
      context: { ...record.context, requestId: crypto.randomUUID() },
    });
  },
};
```

## Хуки после отправки

- Получают { record, transportResults }
- Подходят для метрик и трассировки
- Выполняются по убыванию order

```ts
// Этот плагин инкрементирует метрику при сбое транспорта.
const afterPlugin = {
  name: "metrics",
  stage: "after", // Запускается после отправки лога в транспорты.
  hook({ transportResults }) {
    // Итерируемся по результатам от каждого транспорта.
    for (const result of transportResults) {
      if (!result.succeeded) {
        // Если транспорт не сработал, инкрементируем метрику.
        metrics.increment("logs.dropped", { transport: result.transportName });
      }
    }
  },
};
```

## Обработка ошибок

- Исключения перехватываются и записываются в самологгер.
- Конвейер продолжает работу с оставшимися плагинами.
- Для временного отключения установите enabled: false.

## Тестирование

- См. tests/plugins/hooks/ для примеров модульных тестов.
- Интеграционные сценарии описаны в tests/core/connector.test.ts.
- Добавляйте регрессионные тесты при изменении правил порядка или побочных эффектов.
