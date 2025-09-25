# Быстрый старт

[English](../en/getting-started.md) | Русский

## Требования

- Node.js 18 и новее
- pnpm 9.x
- Базовое понимание TypeScript

Проверьте версии:

```bash
node --version
pnpm --version
```

## Установка зависимостей

```bash
git clone <repo-url>
cd pino-connector-core
pnpm install
```

## Сборка и тесты

```bash
pnpm run build
pnpm run test
```

Во время разработки используйте pnpm run test:watch.

## Первый коннектор

```ts
// Импортируем необходимые функции из библиотеки.
import { createConnector, stdoutTransport } from "pino-connector-core";

// Создаем новый экземпляр коннектора.
const connector = createConnector({
  // Регистрируем встроенный транспорт для вывода в stdout.
  transports: [stdoutTransport.registration],
  // Устанавливаем начальный контекст и включаем асинхронную передачу.
  context: { initial: { service: "demo" }, propagateAsync: true },
});

// Создаем логгер из коннектора.
const logger = connector.createLogger();

// Записываем сообщение в лог.
logger.info("коннектор запущен");
```

## Что дальше

- Изучите параметры в [configuration.md](configuration.md).
- Зарегистрируйте пользовательские транспорты по [transports.md](transports.md).
- Добавьте хуки до/после по [plugins.md](plugins.md).
- Запустите контрольный бенчмарк из [benchmarks.md](benchmarks.md).
