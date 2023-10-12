import {logger} from '../../../utils/logger';

import generic from './generic';

import {IncluderFunctionParams} from '../../../models';

const name = 'sourcedocs';

const usage = `include:
  path: <path-where-to-include>
  includers:
    - name: generic
      input: <path-to-directory-with-markdown>
      leadingPage:
        name: <leading-page-name>
`;

type Params = {
    input: string;
    leadingPage: {
        name?: string;
    };
};

async function includerFunction(params: IncluderFunctionParams<Params>) {
    logger.warn(
        params.tocPath,
        `sourcedocs inlcuder is getting depricated in favor of generic includer\n${usage}`,
    );

    await generic.includerFunction(params);
}

export {name, includerFunction};

export default {name, includerFunction};
