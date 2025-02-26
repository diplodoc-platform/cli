import {option} from '~/core/config';

// TODO: we need smart parser here
// At current time configure resources via args is useles because we can't select resource type.
// We need something like --resource script:./path.js
// Extend description after fix it.
const resources = option({
    flags: '--resource, --resources <value...>',
    desc: 'Add custom resource to build.',
    // parser: toArray,
});

const allowCustomResources = option({
    flags: '--allow-custom-resources',
    desc: 'Allow loading custom resources into statically generated pages.',
});

export const options = {
    resources,
    allowCustomResources,
};
