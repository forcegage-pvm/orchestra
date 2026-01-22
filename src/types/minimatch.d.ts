declare module "minimatch" {
  export interface MinimatchOptions {
    dot?: boolean;
    nocase?: boolean;
  }

  export default function minimatch(
    path: string,
    pattern: string,
    options?: MinimatchOptions
  ): boolean;
}
