import React from 'react';
import RouterContext from 'contexts/RouterContext';
import {Router} from 'router/router';

export interface WithRouterProps {
    router: Router;
}

export default function withRouter<T extends WithRouterProps>(WrappedComponent: React.ComponentType<T>) {
    return class extends React.Component<Omit<T, keyof WithRouterProps>> {
        static displayName = `withRouter(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;
        // eslint-disable-next-line react/sort-comp
        static contextType = RouterContext;

        render() {
            return <WrappedComponent {...this.props as T} router={this.context}/>;
        }
    };
}
