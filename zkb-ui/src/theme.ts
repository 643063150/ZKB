import { createTheme, alpha } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#7C4DFF',
      light: '#B388FF',
      dark: '#651FFF',
    },
    secondary: {
      main: '#00E5FF',
      light: '#6EFFFF',
      dark: '#00B8D4',
    },
    background: {
      default: '#0A0A1A',
      paper: '#12122A',
    },
    text: {
      primary: '#E8E8F0',
      secondary: '#A0A0B8',
    },
    success: { main: '#69F0AE' },
    warning: { main: '#FFD740' },
    error: { main: '#FF5252' },
    info: { main: '#40C4FF' },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica Neue", Arial, sans-serif',
    h4: { fontWeight: 700, letterSpacing: '-0.5px' },
    h5: { fontWeight: 600, letterSpacing: '-0.3px' },
    h6: { fontWeight: 600 },
  },
  shape: {
    borderRadius: 16,
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid rgba(255,255,255,0.06)',
          backdropFilter: 'blur(10px)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            borderColor: 'rgba(255,255,255,0.12)',
            boxShadow: `0 8px 32px ${alpha('#7C4DFF', 0.15)}`,
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 12,
          padding: '10px 24px',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        },
        containedPrimary: {
          background: 'linear-gradient(135deg, #7C4DFF 0%, #651FFF 100%)',
          '&:hover': {
            background: 'linear-gradient(135deg, #B388FF 0%, #7C4DFF 100%)',
            boxShadow: `0 4px 20px ${alpha('#7C4DFF', 0.4)}`,
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          fontWeight: 500,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: 'rgba(255,255,255,0.04)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          border: 'none',
          background: 'linear-gradient(180deg, #0E0E2C 0%, #0A0A1A 100%)',
        },
      },
    },
  },
});

export default theme;
