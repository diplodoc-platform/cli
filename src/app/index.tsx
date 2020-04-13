import React from 'react';
import ReactDOM from 'react-dom';

import {createRouter} from 'router';
import App from './components/App/App';

// @ts-ignore
const props = window.__DATA__! || {};

createRouter({
    pathname: props.pathname
});

ReactDOM.render(
    <App {...props} />,
    document.getElementById('root')
);
