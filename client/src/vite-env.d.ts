/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FANTASYCALC_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
