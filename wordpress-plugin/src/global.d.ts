declare module "*.css";

interface Window {
  wp?: {
    media: (options: Record<string, unknown>) => {
      on: (event: string, callback: () => void) => void;
      open: () => void;
      state: () => { get: (key: string) => { first: () => { get: (key: string) => unknown; toJSON: () => Record<string, unknown> } } };
    };
  };
}
