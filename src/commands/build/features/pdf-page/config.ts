import {option} from '~/core/config';

const pdf = option({
    flags: '--pdf',
    desc: 'Creates a separate directory in the output folder, which contains the files needed to generate PDF.',
});

export const options = {
    pdf,
};
