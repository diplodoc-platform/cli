import React, {ReactElement} from 'react';
import withStyles from 'isomorphic-style-loader/withStyles';

import Header from '../Header/Header';

import styles from './App.scss';

export function App(props: any): ReactElement {
    return (
        <div className="App">
            <Header />
            <div>Test app with value {props.value}</div>
        </div>
    )
}

export default withStyles(styles)(App);
