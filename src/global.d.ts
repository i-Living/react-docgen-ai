/**
 * Глобальные объявления типов для Node.js и браузерных API
 */

// Объявляем глобальный console для Node.js среды
declare global {
  const console: {
    log(...args: any[]): void;
    error(...args: any[]): void;
    warn(...args: any[]): void;
    info(...args: any[]): void;
    debug(...args: any[]): void;
    table(tabularData?: any, properties?: string[]): void;
    time(label?: string): void;
    timeEnd(label?: string): void;
    timeLog(label?: string, ...data: any[]): void;
    trace(...args: any[]): void;
    assert(condition?: boolean, ...args: any[]): void;
    count(label?: string): void;
    countReset(label?: string): void;
    group(...args: any[]): void;
    groupCollapsed(...args: any[]): void;
    groupEnd(): void;
    clear(): void;
    dir(obj?: any, options?: any): void;
    dirxml(...args: any[]): void;
  };
}

export {};