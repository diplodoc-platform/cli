import React from 'react';
import ReactDOM from 'react-dom';

import App from './components/App/App';

// @ts-ignore
const props = window.__DATA__ || {};

ReactDOM.render(
    <App {...props} />,
    document.getElementById('root'),
);
