export type ExtensionInfo =
    | string
    | {
          path: string;
          options?: Record<string, any>;
      };

export type ProgramConfig = {
    extensions: ExtensionInfo[];
};

export type ProgramArgs = {
    input: string;
    config: string;
    extensions: string[];
};
