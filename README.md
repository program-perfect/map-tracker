# Map Tracker

[![Next.js](https://img.shields.io/badge/Next.js-16.2.6-black?logo=nextdotjs)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react\&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7.3-3178C6?logo=typescript\&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.2-38BDF8?logo=tailwindcss\&logoColor=white)](https://tailwindcss.com/)
[![pnpm](https://img.shields.io/badge/pnpm-ready-F69220?logo=pnpm\&logoColor=white)](https://pnpm.io/)
[![Vercel](https://img.shields.io/badge/deploy-Vercel-black?logo=vercel)](https://map-tracker-sooty.vercel.app/)
[![GitHub last commit](https://img.shields.io/github/last-commit/program-perfect/map-tracker?logo=github)](https://github.com/program-perfect/map-tracker/commits/main)
[![Repository size](https://img.shields.io/github/repo-size/program-perfect/map-tracker?logo=github)](https://github.com/program-perfect/map-tracker)

Интерактивный веб-интерфейс для отслеживания маяка на карте: движение по дорогам, ручное смещение точки, сценарии движения, настройки отображения, сохранение состояния между сессиями и адаптация под слабые устройства.

## Возможности

* карта на базе Yandex Maps;
* маяк с настраиваемым цветом, размером, пульсацией и звуком;
* автодвижение по локальному дорожному графу;
* режим маршрута с построением дорожной линии;
* ручное смещение точки кликом по карте;
* сохранение настроек и позиции маяка в `localStorage`;
* отдельный сброс позиции маяка и полный сброс настроек;
* мобильная и desktop-версия интерфейса;
* оптимизации под слабые компьютеры и старые устройства.

## Технологии

* Next.js 16;
* React 19;
* TypeScript;
* Tailwind CSS 4;
* Base UI;
* Yandex Maps API;
* Vercel Analytics;
* pnpm.

## Запуск

```bash
pnpm install
pnpm dev
```

Открой:

```txt
http://localhost:3000
```

## Production build

```bash
pnpm build
pnpm start
```

## Переменные окружения

Для карты нужен ключ Yandex Maps API:

```env
NEXT_PUBLIC_YANDEX_MAPS_API_KEY=your_key_here
```

Опционально можно включить аналитику:

```env
NEXT_PUBLIC_ENABLE_ANALYTICS=1
```

## Основные команды

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
```

## Деплой

Проект рассчитан на деплой в Vercel.

Production: https://map-tracker-sooty.vercel.app/

## Примечание

Проект использует локальное хранение настроек. Если новые значения по умолчанию не применяются после обновления, сбрось настройки в интерфейсе.
