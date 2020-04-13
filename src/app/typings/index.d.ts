declare module 'isomorphic-style-loader/withStyles' {
    export interface Styles {
        [key: string]: string;
    }

    const withStyles = (...style: Styles[]) => <T extends React.Element<any, any>>(
        component: T,
    ): T => T;

    export default withStyles;
}

declare module 'isomorphic-style-loader/StyleContext' {
    const StyleContext = React.createContext<Function>();

    export default StyleContext;
}

declare module '*.scss' {
    import {Styles} from 'isomorphic-style-loader/withStyles';

    const value: Styles;

    export = value;
}

declare module '*.css' {
    import {Styles} from 'isomorphic-style-loader/withStyles';

    const value: Styles;

    export = value;
}

declare module '*.png' {
    const value: string;

    export = value;
}

declare module '*.svg' {
    import {ReactComponentElement} from 'react';

    const value: ReactComponentElement<any>;

    export = value;
}

declare module '!!raw-loader!*' {
    const contents: string;
    export = contents;
}
