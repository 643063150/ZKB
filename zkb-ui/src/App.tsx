import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import theme from './theme';
import Layout from './components/Layout/Layout';
import DashboardPage from './pages/DashboardPage';
import ImportPage from './pages/ImportPage';
import KnowledgePage from './pages/KnowledgePage';
import SearchPage from './pages/SearchPage';
import GraphPage from './pages/GraphPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="import" element={<ImportPage />} />
            <Route path="knowledge" element={<KnowledgePage />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="graph" element={<GraphPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
