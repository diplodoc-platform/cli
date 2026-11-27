import hljs from 'highlight.js';
import {createHighlightJsHighlighter} from '@diplodoc/transform/highlighter';

// CLI owns the full language set and matching themes. Initialize once per process.
export const highlighter = createHighlightJsHighlighter(hljs);
