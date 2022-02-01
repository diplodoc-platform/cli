import {expose} from 'threads/dist';
import {processLinterWorker} from './index';

expose(processLinterWorker);
