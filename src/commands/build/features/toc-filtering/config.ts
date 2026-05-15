import {option} from '~/core/config';

const removeHiddenTocItems = option({
    flags: '--remove-hidden-toc-items',
    desc: 'Remove from Toc all items marked as hidden.',
});

const removeEmptyTocItems = option({
    flags: '--remove-empty-toc-items',
    desc: 'Remove from Toc all items that have no children and no href field.',
});

export const options = {
    removeHiddenTocItems,
    removeEmptyTocItems,
};
