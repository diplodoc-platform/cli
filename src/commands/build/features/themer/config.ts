import {cyan} from 'chalk';
import {option} from '~/core/config';

const themer = option({
    flags: '--theme <theme>',
    desc: `
        Generate and applies theme from a color 'value'

        Read more about themization ${cyan('wip')}

        Example:
          {{PROGRAM}} --theme red
          {{PROGRAM}} --theme 'rgb(116, 255, 69)'
        `,
});

export const options = {
    themer,
};
