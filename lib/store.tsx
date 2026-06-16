"use client"

import {
  SPB_ROUTE,
  bearingFromDirection,
  bearing as calcBearing,
  distanceMeters,
  moveByDistance,
  nearestNode,
  pickNextNode
} from "@/lib/geo"
import { playAlarm } from "@/lib/sound"
import type {
  BeaconSettings,
  Geofence,
  HistoryEntry,
  LatLng,
  MapLayer,
  PanelId,
  RotationMode,
  Scenario,
  ScenarioStep,
  ThemeMode,
  TrackedObject,
} from "@/lib/types"
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

const SPB_STREETS = [
  "Невский проспект",
  "Дворцовая набережная",
  "Литейный проспект",
  "Садовая улица",
  "Лиговский проспект",
  "набережная реки Фонтанки",
  "Большая Морская улица",
  "площадь Восстания",
  "Малая Конюшенная улица",
  "Гороховая улица",
]

function streetForIndex(i: number): string {
  return SPB_STREETS[i % SPB_STREETS.length]
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

const MIN_INTERVAL_MS = 5_000
const DARK_DEFAULT_BEACON_COLOR = "#33ccff"

const DEFAULT_SETTINGS: BeaconSettings = {
  visible: true,
  autoMove: false,
  intervalMs: MIN_INTERVAL_MS,
  stepMeters: 18,
  direction: "NE",
  followRoute: true,
  scheduledMove: false,
  scheduleAt: "12:00",
  scenarioEnabled: false,
  activeScenarioId: null,
  pulseEnabled: true,
  pulseDurationMs: 1800,
  pulseScale: 5,
  soundEnabled: true,
  soundVolume: 1,
  alarmSound: "warning",
  continuousAlarm: true,
  mapHue: 40,
  beaconColor: DARK_DEFAULT_BEACON_COLOR,
  panelWidth: 340,
}

const DEFAULT_SCENARIOS: Scenario[] = [
  {
    id: "sc-patrol",
    name: "Патруль",
    loop: true,
    steps: [
      { id: uid(), delayMs: 1000, stepMeters: 20, direction: null },
      { id: uid(), delayMs: 1000, stepMeters: 20, direction: null },
      { id: uid(), delayMs: 3000, stepMeters: 5,  direction: null },
      { id: uid(), delayMs: 1000, stepMeters: 20, direction: null },
      { id: uid(), delayMs: 5000, stepMeters: 0,  direction: null },
    ],
  },
  {
    id: "sc-fast",
    name: "Быстрое движение",
    loop: true,
    steps: [
      { id: uid(), delayMs: 500,  stepMeters: 60, direction: null },
      { id: uid(), delayMs: 500,  stepMeters: 60, direction: null },
      { id: uid(), delayMs: 500,  stepMeters: 60, direction: null },
      { id: uid(), delayMs: 500,  stepMeters: 60, direction: null },
      { id: uid(), delayMs: 2000, stepMeters: 10, direction: null },
    ],
  },
  {
    id: "sc-stop-go",
    name: "Стой-иди",
    loop: true,
    steps: [
      { id: uid(), delayMs: 2000, stepMeters: 30, direction: null },
      { id: uid(), delayMs: 8000, stepMeters: 0,  direction: null },
      { id: uid(), delayMs: 2000, stepMeters: 30, direction: null },
      { id: uid(), delayMs: 8000, stepMeters: 0,  direction: null },
    ],
  },
]