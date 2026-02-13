/**
 * MSFS Global Declarations
 * These globals are provided by the MSFS Coherent GT environment at runtime.
 * Centralized here so every file can use them without local `declare` blocks.
 */

declare const SimVar: {
  GetSimVarValue(name: string, unit: string): number | boolean | string;
  SetSimVarValue(name: string, unit: string, value: number): void;
};

declare function RegisterViewListener(name: string, callback?: () => void): unknown;

declare const Coherent: {
  call(name: string, ...args: unknown[]): Promise<unknown>;
  trigger(name: string, ...args: unknown[]): void;
  on(name: string, callback: (...args: unknown[]) => void): { clear(): void };
};

declare function GetStoredData(key: string): string;
declare function SetStoredData(key: string, value: string): void;

declare const BASE_URL: string;

// Asset imports (esbuild dataurl loader)
declare module "*.svg" {
  const content: string;
  export default content;
}
