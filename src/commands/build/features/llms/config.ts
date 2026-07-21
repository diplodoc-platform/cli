import {defined, option} from '~/core/config';
import {fileSizeConverter} from '~/commands/build/config';

/** Default value for llmsFullMaxSize — the single source of truth for '4M'. */
const LLMS_FULL_MAX_SIZE_DEFAULT = '4M';

const llms = option({
    flags: '--llms',
    desc:
        'Generate llms.txt (index) and llms-full.txt (full markdown) per toc for LLM consumption. ' +
        'Works for both `md` and `html` output.',
});

const llmsFullMaxSize = option({
    flags: '--llms-full-max-size <value>',
    desc: `
        Maximum size of llms-full.txt. When the accumulated content exceeds this
        limit, article ingestion stops and YFM022 is logged as info.
        For disabled use '0' --llms-full-max-size '0'
        Default: ${LLMS_FULL_MAX_SIZE_DEFAULT}

        Example:
            {{PROGRAM}} build -i . -o ../build --llms-full-max-size '8M'
    `,
    default: LLMS_FULL_MAX_SIZE_DEFAULT,
    parser: fileSizeConverter({disableIfZero: true}),
});

export const options = {
    llms,
    llmsFullMaxSize,
};

/**
 * Resolves llmsFullMaxSize from args (CLI, already a number via fileSizeConverter)
 * or config (YAML, string like '4K' or integer). Priority: explicit CLI → YAML → default.
 *
 * - If the .yfm config has `llmsFullMaxSize: '4K'`, fileSizeConverter converts it to 4096 bytes.
 * - If nothing is set anywhere, the default 4M = 4194304 bytes is returned.
 * - `'0'` means "use default" (disableIfZero), consistent with maxAssetSize.
 */
export function resolveLlmsFullMaxSize(args: Hash, config: Hash): number {
    const argValue = defined('llmsFullMaxSize', args);
    const configValue = defined('llmsFullMaxSize', config);

    const defaultBytes = fileSizeConverter({disableIfZero: true})(
        LLMS_FULL_MAX_SIZE_DEFAULT,
        LLMS_FULL_MAX_SIZE_DEFAULT,
    );

    // If CLI is explicitly set (differs from default) — use it
    if (argValue !== null && argValue !== defaultBytes) {
        return argValue as number;
    }

    // If YAML config is set — parse and use it
    if (configValue !== null) {
        if (typeof configValue === 'number') {
            return configValue;
        }
        return (
            fileSizeConverter({disableIfZero: true})(configValue, LLMS_FULL_MAX_SIZE_DEFAULT) ??
            (defaultBytes as number)
        );
    }

    // Default
    return defaultBytes as number;
}
