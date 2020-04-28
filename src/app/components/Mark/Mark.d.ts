import React from 'react';

import './Mark.scss';

export interface MarkProps {
    text: string;
    color?: 'blue' | 'green';
    size?: 's' | 'm';
    className?: string;
}

export default class Mark extends React.Component<MarkProps> {
    static defaultProps: {
        color: string;
        size: string;
    };
    render(): JSX.Element;
}
