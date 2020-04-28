import React from 'react';

declare const color: Record<string, 'blue' | 'green'>;

export interface StageLabelProps {
    stage?: keyof typeof color;
    size?: 's' | 'm';
    className?: string;
}

export default class StageLabel extends React.Component<StageLabelProps> {
    static defaultProps: {
        size: string;
    };
    render(): JSX.Element | null;
}
