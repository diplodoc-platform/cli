import React from 'react';
import ReactDOM from 'react-dom';

import App from './components/App/App';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const props = (window as any).__DATA__ || {};

ReactDOM.hydrate(
    <App {...props} />,
    document.getElementById('root'),
);
