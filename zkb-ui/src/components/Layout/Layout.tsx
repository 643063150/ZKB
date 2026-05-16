import { Box } from '@mui/material';
import { Outlet } from 'react-router-dom';
import Sidebar, { DRAWER_WIDTH } from './Sidebar';

export default function Layout() {
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          ml: `${DRAWER_WIDTH}px`,
          p: 4,
          minHeight: '100vh',
          background: 'radial-gradient(ellipse at 50% 0%, rgba(124,77,255,0.06) 0%, transparent 70%)',
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
