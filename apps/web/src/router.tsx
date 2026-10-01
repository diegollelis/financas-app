import { createBrowserRouter } from 'react-router';
import { HomePage } from '@/routes/home';

export const router = createBrowserRouter([{ path: '/', element: <HomePage /> }]);
