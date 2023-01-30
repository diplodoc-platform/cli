import React from 'react';

export const Title: React.FC<{
    level: number;
}> = ({level = 1, children}) => {
    return React.createElement('h' + level, {}, children);
};
