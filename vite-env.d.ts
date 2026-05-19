declare class Worker {}

interface ImportMetaEnv {
  readonly VITE_PORTAL_USERNAME?: string;
  readonly VITE_PORTAL_PASSWORD?: string;
  readonly [key: string]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
