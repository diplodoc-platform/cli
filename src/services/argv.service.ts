import {resolve} from 'path';
import {readFileSync} from 'fs';
import {safeLoad} from 'js-yaml';

class ArgvService {
    public argv: Record<string, any> = {};

    private argvSpecialParser: Record<string, Function> = {
        'config': function(rawValue: any): any {
            const path = String(rawValue);
            const content = readFileSync(resolve(path), 'utf8');
            return safeLoad(content);
        }
    };

    parse(rawArgv: any) {
        Object.keys(rawArgv).forEach((key: string) => {
            const parser: Function = this.argvSpecialParser[key];
            const value: any = rawArgv[key];

            if (parser) {
                this.argv[key] = parser(value);
                return;
            }

            this.argv[key] = String(value);
        });
    }
}

export default new ArgvService();
