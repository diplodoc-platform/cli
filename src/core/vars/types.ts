export type Presets = {
    default: Preset;
} & {
    [prop: string]: Preset;
};

export type Preset = {
    __system?: Hash;
    __metadata?: Hash;
} & Hash<number | string | (number | string)[] | Hash>;
