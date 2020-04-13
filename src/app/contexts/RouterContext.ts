import React from 'react';
import {Router} from 'router/router';
import SingletonRouter from 'router';

export default React.createContext<Router>(SingletonRouter);
