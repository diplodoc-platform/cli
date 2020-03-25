import React, {ReactElement} from 'react';
import withStyles from 'isomorphic-style-loader/withStyles';

import styles from './Header.scss';

export function Header(): ReactElement {
    return (
        <div>
            Test header
        </div>
    )
}

export default withStyles(styles)(Header);
