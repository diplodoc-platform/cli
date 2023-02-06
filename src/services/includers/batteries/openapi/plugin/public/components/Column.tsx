import React from 'react';
import {yfmSandbox} from '../../constants';

export const Column: React.FC<{
    className?: string;
    gap?: number;
}> = ({className, gap = 20, children}) => {
    const style = {
        gap: gap + 'px',
    };

    return (
        <div className={yfmSandbox('column', className)} style={style}>
            {children}
        </div>
    );
};
