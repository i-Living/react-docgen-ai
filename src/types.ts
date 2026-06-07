/**
 * @fileoverview Базовые типы и интерфейсы для react-docgen-ai
 * @author AI Docgen
 * @version 1.0.0
 */

/**
 * Интерфейс для опций командной строки
 */
export interface CliOptions {
  /** Путь к исходной директории */
  src: string;
  /** Выходная директория */
  out: string;
  /** Нужно ли аннотировать код комментариями */
  annotate: boolean;
  /** Нужно ли аннотировать код in-place */
  annotateInplace?: boolean;
  /** Нужно ли генерировать документацию */
  docs: boolean;
  /** Нужно ли генерировать граф компонентов */
  graph: boolean;
  /** Список расширений файлов */
  extensions: string;
  /** URL API для LLM */
  api: string;
  /** Принудительная обработка файлов с @fileoverview */
  force?: boolean;
  /** Использовать OpenCode SDK вместо HTTP */
  opencode?: boolean;
  /** Модель для OpenCode (формат "provider/model") */
  opencodeModel?: string;
  /** Количество параллельных запросов к LLM (по умолчанию 4) */
  parallel?: number;
  /** Директория с кастомными промптами */
  promptDir?: string;
  /** Режим сухого прогона (без вызова LLM и записи) */
  dryRun?: boolean;
  /** Формат вывода документации */
  format?: OutputFormat;
  /** Использовать streaming для HTTP провайдера */
  stream?: boolean;
  /** Директория для генерации LLM Wiki (Karpathy-style) */
  wiki?: string;
}

/** Формат вывода документации */
export type OutputFormat = "markdown" | "json";

/**
 * Интерфейс для информации о React компоненте, извлеченной из AST
 */
export interface ComponentInfo {
  /** Имя компонента */
  name: string | null;
  /** Список props */
  props: ComponentProp[];
  /** Список состояний */
  state: ComponentState[];
  /** Список эффектов */
  effects: ComponentEffect[];
  /** Обработчики событий */
  handlers: ComponentHandler[];
  /** Дерево JSX элементов */
  jsxTree: string[];
  /** Экспортирует ли файл компонент по умолчанию */
  exportsComponent: boolean;
}

/**
 * Интерфейс для props компонента
 */
export interface ComponentProp {
  /** Имя пропса */
  name: string;
  /** Тип пропса */
  type?: string;
  /** Обязательный ли пропс */
  required?: boolean;
  /** Значение по умолчанию */
  defaultValue?: unknown;
}

/**
 * Интерфейс для состояния компонента
 */
export interface ComponentState {
  /** Имя переменной состояния */
  variable: string;
  /** Инициализирующее значение */
  initialValue?: unknown;
}

/**
 * Интерфейс для эффектов компонента
 */
export interface ComponentEffect {
  /** Зависимости эффекта */
  deps: string[];
  /** Дополнительные настройки эффекта */
  options?: unknown;
}

/**
 * Интерфейс для обработчиков событий
 */
export interface ComponentHandler {
  /** Имя обработчика */
  name: string;
  /** Параметры обработчика */
  params?: string[];
  /** Тип события (если применимо) */
  eventType?: string;
}

/**
 * Интерфейс для файлов в графе компонентов
 */
export interface FileInfo {
  /** Путь к файлу */
  path: string;
  /** Содержимое файла */
  content: string;
}

/**
 * Интерфейс для узла в графе компонентов
 */
export interface GraphNode {
  /** Путь к файлу компонента */
  file: string;
  /** Дочерние компоненты */
  children: string[];
}

/**
 * Тип для графа компонентов
 */
export type ComponentGraph = Record<string, GraphNode>;

/**
 * Опции для LLM API вызова
 */
export interface LlmApiOptions {
  /** Максимальное количество токенов */
  maxTokens?: number;
  /** Температура генерации */
  temperature?: number;
  /** Использовать streaming */
  stream?: boolean;
}

/**
 * Результат обработки одного файла в пайплайне
 */
export interface FileResult {
  file: string;
  success: boolean;
  skipped?: boolean;
  skipReason?: string;
  error?: string;
  outputPath?: string;
}
