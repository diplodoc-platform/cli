import React from 'react';

// TODO: replace with bem-cn-lite
import cn from 'classnames';

export const Column: React.FC<{
    className?: string;
    gap?: number;
}> = ({className, gap = 20, children}) => {
    const style = {
        gap: gap + 'px',
    };

    return (
        <div className={cn(className, 'yfm-sandbox-column')} style={style}>
            {children}
        </div>
    );
};
