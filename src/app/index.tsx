import React from 'react';
import ReactDOM from 'react-dom';

import App from './components/App/App';

const props = (window as any).__DATA__ || {};

ReactDOM.render(
    <App {...props} />,
    document.getElementById('root'),
);
