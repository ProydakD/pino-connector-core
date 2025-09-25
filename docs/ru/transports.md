# Транспорты

[English](../en/transports.md) | Русский

## Регистрация транспорта

```ts
// Регистрируем пользовательский транспорт, который отправляет логи на HTTP-эндпоинт.
await connector.registerTransport(
  // Указываем имя и конфигурацию для транспорта.
  { name: "http", config: { endpoint: "https://logs.example.com" } },
  // Фабричная функция создает экземпляр транспорта.
  async (registration, { selfLogger }) => ({
    // Метод `publish` вызывается для каждой записи лога.
    async publish({ record }) {
      await fetch(registration.config.endpoint, {
        method: "POST",
        body: JSON.stringify(record),
        headers: { "content-type": "application/json" },
      });
    },
    // Метод `shutdown` вызывается при завершении работы коннектора.
    async shutdown() {
      selfLogger.info({ transport: registration.name }, "транспорт http остановлен");
    },
  }),
);
```

- name должен быть уникальным
- level (опционально) задаёт минимальный уровень для транспорта
- Фабрика получает selfLogger для безопасного логирования

## Жизненный цикл

Транспорт может реализовать следующие методы:

- publish(payload) — обязателен
- flush() — вызывается при connector.flush()
- shutdown() — вызывается при connector.shutdown()
- getDiagnostics() — возвращает { isHealthy, details } для диагностики

## Встроенный транспорт

Пакет включает транспорт stdout. Чтобы отключить автоматическое подключение, передайте useBuiltinTransports: false в createConnector.

## Диагностика

Ошибки транспорта фиксируются через самологгер и отображаются в connector.getDiagnosticsSnapshot(). Используйте снимок для health-check или мониторинга.

## Тестирование

- Используйте фикстуры из tests/fixtures/ для сценариев успеха и ошибок.
- Проверяйте диагностические сообщения при исключениях транспорта.
- Покрывайте backpressure и параллельные вызовы, если они критичны для адаптера.
