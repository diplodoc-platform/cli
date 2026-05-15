import type {BaseArgs, BaseConfig} from '~/core/program';

export type TemplateType = 'minimal' | 'full';

export interface BaseInitArgs {
    output: string;
    langs: string[];
    defaultLang: string;
    name: string;
    header: boolean;
    force: boolean;
    dryRun: boolean;
    template: TemplateType;
    skipInteractive: boolean;
}

export type InitArgs = BaseArgs & BaseInitArgs;

export type InitConfig = BaseConfig & InitArgs;

export type WizardResult = Omit<BaseInitArgs, 'force' | 'dryRun' | 'skipInteractive'>;
