import {PresetService, TocService} from '../services';
import {Run} from '~/commands/build';

export async function preparingPresetFiles(run: Run) {
    PresetService.init(run.vars);
}

export async function preparingTocFiles(run: Run): Promise<void> {
    TocService.init(run.toc);
}
