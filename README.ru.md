# Pino Connector Core

[English](README.md) | [Русский](README.ru.md)

[![NPM version](https://img.shields.io/npm/v/pino-connector-core.svg?style=flat-square)](https://www.npmjs.com/package/pino-connector-core)
[![NPM downloads](https://img.shields.io/npm/dm/pino-connector-core.svg?style=flat-square)](https://www.npmjs.com/package/pino-connector-core)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-3C873A?style=flat-square)](https://nodejs.org/)
[![TypeScript Ready](https://img.shields.io/badge/TypeScript-ready-3178C6?style=flat-square)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/package%20manager-pnpm-FF8C00?style=flat-square)](https://pnpm.io/)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)

> **pino-connector-core** — это ядро для создания пользовательских решений для логирования с помощью [Pino](https://getpino.io/). Он предоставляет переиспользуемый и настраиваемый конвейер логирования, который работает в различных окружениях, таких как фреймворки, фоновые обработчики и интерфейсы командной строки.

> **pino-connector-core** намеренно не зависит от фреймворков. Он не содержит никаких адаптеров для конкретных фреймворков. Вместо этого он предоставляет контракт и набор инструментов, которые позволяют другим пакетам реализовывать коннекторы для конкретных фреймворков (таких как NestJS, Express, Fastify и т.д.) по единым правилам. Такой подход способствует согласованности и переиспользованию в экосистеме.

## Какую проблему решает

Вместо того чтобы заново реализовывать транспорты, правила ретуширования и диагностику для каждого нового сервиса, `pino-connector-core` позволяет один раз настроить конвейер логирования и использовать его везде. Это обеспечивает консистентность и экономит время на разработку.

### Ключевые возможности

- **Единый реестр транспортов**: Управляйте встроенными и пользовательскими назначениями для логов с безопасными хуками жизненного цикла.
- **Предсказуемая передача контекста**: Использует `AsyncLocalStorage` для надежной обработки контекста в асинхронном коде.
- **Расширяемый конвейер**: Используйте плагины "до" и "после" для обогащения записей логов и сериализаторы для ретуширования конфиденциальных данных.
- **Встроенная диагностика**: Получайте снимки состояния и производительности транспортов, что идеально подходит для мониторинга и отладки.

## Частые сценарии использования

| Сценарий | Преимущество |
|---|---|
| **Адаптеры для фреймворков** | Экспортируйте чистый API `createLogger()`, в то время как коннектор управляет сложностью транспортов и хуков. |
| **Платформы для нескольких команд** | Применяйте общие политики обогащения и ретуширования для всех сервисов. |
| **Внутренние инструменты** | Обеспечьте логирование на уровне продакшена для CLI и обработчиков без дублирования кода инфраструктуры. |

## Быстрый старт

В следующем примере показано, как создать коннектор, добавить транспорт и записать сообщение с контекстом.

```ts
// Импортируем необходимые функции из библиотеки
import { createConnector, stdoutTransport } from "pino-connector-core";

// Создаем новый экземпляр коннектора
const connector = createConnector({
  // Регистрируем встроенный транспорт для вывода в stdout
  transports: [stdoutTransport.registration],
  // Настраиваем начальный контекст и включаем асинхронную передачу
  context: { initial: { service: "api" }, propagateAsync: true },
});

// Создаем экземпляр логгера из коннектора
const logger = connector.createLogger();

// Выполняем функцию с дополнительным контекстом
connector.runWithContext({ requestId: "req-101" }, () => {
  // Этот лог будет включать service и requestId в своем контексте
  logger.info("запрос принят");
});
```

### Диагностические снимки

Вы можете получить снимок состояния коннектора, что полезно для мониторинга.

```ts
// Получаем снимок диагностики коннектора
const diagnostics = connector.getDiagnosticsSnapshot();

// Выводим статус транспортов
console.log(diagnostics.transports);
```

## Практические примеры

### Обогащение записей с помощью плагина "до"

Плагины могут изменять записи логов перед их отправкой в транспорты.

```ts
const connector = createConnector({
  plugins: [
    {
      name: "user-tag",
      stage: "before", // Запускать этот плагин до обработки лога
      hook({ record, setRecord }) {
        // Извлекаем ID пользователя из метаданных лога или используем "anonymous"
        const userId = record.metadata?.data?.user?.id ?? "anonymous";
        // Добавляем userId в контекст лога
        setRecord({ ...record, context: { ...record.context, userId } });
      },
    },
  ],
});

// Этот лог будет обогащен плагином "user-tag"
connector.getRootLogger().info({ data: { user: { id: "42" } } }, "пользователь вошел в систему");
```

### Реакция на сбои транспортов с помощью плагина "после"

Плагины "после" могут реагировать на результаты операций транспортов.

```ts
const connector = createConnector({
  transports: [stdoutTransport.registration],
  plugins: [
    {
      name: "metrics",
      stage: "after", // Запускать этот плагин после отправки лога в транспорты
      hook({ transportResults }) {
        // Итерируемся по результатам от каждого транспорта
        for (const result of transportResults) {
          if (!result.succeeded) {
            // Если транспорт не сработал, выводим предупреждение
            console.warn("сбой транспорта", result.transportName);
          }
        }
      },
    },
  ],
});
```

### Регистрация пользовательского транспорта

Вы можете легко регистрировать свои собственные транспорты.

```ts
// Регистрируем пользовательский транспорт, который отправляет логи на HTTP-эндпоинт
await connector.registerTransport(
  // Указываем имя и конфигурацию для транспорта
  { name: "log-api", config: { endpoint: "https://logs.example.com" } },
  // Фабричная функция создает экземпляр транспорта
  async (registration, { selfLogger }) => ({
    // Метод publish отправляет запись лога в место назначения
    async publish({ record }) {
      await fetch(registration.config.endpoint, {
        method: "POST",
        body: JSON.stringify(record),
        headers: { "content-type": "application/json" },
      });
    },
    // Метод shutdown вызывается при завершении работы коннектора
    async shutdown() {
      selfLogger.info({ transport: registration.name }, "транспорт log-api остановлен");
    },
  }),
);
```

## Документация

Для получения более подробной информации, пожалуйста, обратитесь к документации:

- [**Обзор проекта**](docs/ru/index.md)
- [**Начало работы**](docs/ru/getting-started.md)
- [**Конфигурация**](docs/ru/configuration.md)
- **Расширяемость**:
  - [Транспорты](docs/ru/transports.md)
  - [Плагины и хуки](docs/ru/plugins.md)
  - [Сериализаторы и ретуширование](docs/ru/serializers.md)
- **Эксплуатация**:
  - [Диагностика](docs/ru/diagnostics.md)
  - [Бенчмарки](docs/ru/benchmarks.md)

## Лицензия

Этот проект лицензирован под лицензией MIT - подробности см. в файле [LICENSE](LICENSE).