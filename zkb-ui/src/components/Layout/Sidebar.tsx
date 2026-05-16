import { useLocation, useNavigate } from 'react-router-dom';
import {
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
  Typography,
  alpha,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  FileUpload as ImportIcon,
  Storage as KnowledgeIcon,
  Search as SearchIcon,
  Hub as GraphIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';

const DRAWER_WIDTH = 260;

const navItems = [
  { path: '/', label: 'Dashboard', icon: <DashboardIcon /> },
  { path: '/import', label: '知识导入', icon: <ImportIcon /> },
  { path: '/knowledge', label: '知识管理', icon: <KnowledgeIcon /> },
  { path: '/search', label: '搜索', icon: <SearchIcon /> },
  { path: '/graph', label: '知识图谱', icon: <GraphIcon /> },
  { path: '/settings', label: 'API 配置', icon: <SettingsIcon /> },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        },
      }}
    >
      <Box sx={{ p: 3 }}>
        <Typography
          variant="h5"
          sx={{
            fontWeight: 800,
            background: 'linear-gradient(135deg, #7C4DFF 0%, #00E5FF 100%)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.5px',
          }}
        >
          ZKB
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: 'text.secondary', mt: 0.5, display: 'block' }}
        >
          知识库管理平台
        </Typography>
      </Box>

      <List sx={{ px: 1.5, flex: 1 }}>
        {navItems.map((item) => {
          const active = item.path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.path);

          return (
            <ListItemButton
              key={item.path}
              onClick={() => navigate(item.path)}
              sx={{
                borderRadius: 3,
                mb: 0.5,
                py: 1.2,
                transition: 'all 0.2s ease',
                backgroundColor: active ? alpha('#7C4DFF', 0.15) : 'transparent',
                color: active ? '#E8E8F0' : 'text.secondary',
                '&:hover': {
                  backgroundColor: active
                    ? alpha('#7C4DFF', 0.25)
                    : alpha('#fff', 0.04),
                },
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 40,
                  color: active ? '#7C4DFF' : 'text.secondary',
                  transition: 'color 0.2s ease',
                }}
              >
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                slotProps={{
                  primary: {
                    fontWeight: active ? 600 : 400,
                    fontSize: '0.95rem',
                  },
                }}
              />
              {active && (
                <Box
                  sx={{
                    width: 4,
                    height: 24,
                    borderRadius: 2,
                    background: 'linear-gradient(180deg, #7C4DFF, #00E5FF)',
                  }}
                />
              )}
            </ListItemButton>
          );
        })}
      </List>

      <Box sx={{ p: 2.5, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          v1.0 · 172.29.84.122
        </Typography>
      </Box>
    </Drawer>
  );
}

export { DRAWER_WIDTH };
