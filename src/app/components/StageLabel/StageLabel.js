import React from 'react';
import Mark from '../Mark/Mark';

const color = {
    preview: 'blue',
    new: 'green',
};
const possibleStages = Object.keys(color);

export default class StageLabel extends React.Component {
    render() {
        const { stage, size, className } = this.props;

        if (!(stage && possibleStages.includes(stage))) {
            return null;
        }

        return (
            React.createElement(Mark, {
                className,
                text: stage,
                color: color[stage],
                size: size
            })
        );
    }
}

StageLabel.defaultProps = {
    size: 's',
};
