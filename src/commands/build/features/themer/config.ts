import {cyan} from 'chalk';
import {option} from '~/core/config';

const themer = option({
    flags: '--theme <theme>',
    desc: `
        Generate and applies theme from a template in format \'key: value\'

        Read more about themization ${cyan('wip')} 
    `,
});

export const options = {
    themer,
};
