declare module 'bem-cn-lite' {
    interface Modifications {
        [name: string]: string | boolean | number | undefined;
    }

    interface Inner {
        (elem: string, mods: Modifications | null, mixin?: string): string;
        (elem: string, mixin?: string): string;
        (elem: string, mods: Modifications): string;
        (mods: Modifications | null, mixin?: string): string;
        (elem: string): string;
        (mods: Modifications);
        (): string;
    }

    export default function Outer(name: string): Inner;
}
