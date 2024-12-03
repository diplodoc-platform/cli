export type Presets = {
    default: Preset;
} & {
    [prop: string]: Preset;
};

export type Preset = {
    __system?: Hash;
    __metadata?: Hash;
} & Hash<string | string[] | Hash>;
