import { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Alert,
  TextField,
  Button,
  CircularProgress,
  Chip,
  Stack,
  IconButton,
  Collapse,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  alpha,
  Fade,
  Divider,
  LinearProgress,
} from '@mui/material';
import {
  Search as SearchIcon,
  FilterList as FilterIcon,
  Close as CloseIcon,
  Link as LinkIcon,
  Code as CodeIcon,
} from '@mui/icons-material';
import { searchKnowledge } from '../api/knowledge';
import type { SearchResponse } from '../api/knowledge';

const DOMAINS = ['', 'Android', 'Backend', 'Database', 'Frontend', 'DevOps'];
const LANGUAGES = ['', 'Kotlin', 'Java', 'Python', 'Go', 'SQL', 'TypeScript', 'Rust', 'Swift'];
const FRAMEWORKS = ['', 'Jetpack', 'Spring', 'Gin', 'Flask', 'FastAPI', 'Django', 'React', 'Vue', 'Next.js', 'Kubernetes', 'Terraform', 'None'];
const TYPES = ['', 'API', 'Tutorial', 'Example', 'Concept'];

const metadataColorMap: Record<string, string> = {
  Backend: '#69F0AE', Frontend: '#40C4FF', Database: '#FFD740',
  DevOps: '#FF6E40', Android: '#EA80FC',
  Go: '#00ADD8', Python: '#FFD740', TypeScript: '#3178C6',
  Java: '#FF5252', Kotlin: '#EA80FC', SQL: '#69F0AE',
  Rust: '#FF6E40', Swift: '#FF5252',
};

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [domain, setDomain] = useState('');
  const [language, setLanguage] = useState('');
  const [framework, setFramework] = useState('');
  const [type, setType] = useState('');
  const [topK, setTopK] = useState(10);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasFilters = domain || language || framework || type;

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const filters: any = {};
      if (domain) filters.domain = domain;
      if (language) filters.language = language;
      if (framework) filters.framework = framework;
      if (type) filters.type = type;

      const res = await searchKnowledge({
        query: query.trim(),
        filters: Object.keys(filters).length ? filters : undefined,
        top_k: topK,
      });
      setResult(res.data);
      setError(null);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Search failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 1 }}>
        语义搜索
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 4 }}>
        基于 AI 向量的语义检索，支持多维度元数据过滤
      </Typography>

      {/* Search Bar */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 2.5 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <TextField
              fullWidth
              size="medium"
              label="搜索知识库"
              placeholder='例如: "How to handle JWT authentication in Go?"'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              slotProps={{
                input: {
                  startAdornment: (
                    <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
                  ),
                },
              }}
            />
            <Button
              variant="contained"
              startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <SearchIcon />}
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              sx={{ minWidth: 100, py: 1.2, flexShrink: 0 }}
            >
              搜索
            </Button>
            <Button
              variant={hasFilters ? 'contained' : 'outlined'}
              color={hasFilters ? 'primary' : 'inherit'}
              size="small"
              onClick={() => setFiltersOpen(!filtersOpen)}
              sx={{ py: 1.2, minWidth: 44, flexShrink: 0, position: 'relative' }}
            >
              <FilterIcon fontSize="small" />
              {hasFilters > 0 && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: 'primary.main',
                  }}
                />
              )}
            </Button>
          </Stack>

          <Collapse in={filtersOpen}>
            <Divider sx={{ my: 2 }} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} flexWrap="wrap" useFlexGap>
              <FormControl size="small" sx={{ minWidth: 130, flex: { sm: '1 0 auto' } }}>
                <InputLabel>Domain</InputLabel>
                <Select value={domain} label="Domain" onChange={(e) => setDomain(e.target.value)}>
                  {DOMAINS.map((d) => (<MenuItem key={d} value={d}>{d || '全部'}</MenuItem>))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 130, flex: { sm: '1 0 auto' } }}>
                <InputLabel>Language</InputLabel>
                <Select value={language} label="Language" onChange={(e) => setLanguage(e.target.value)}>
                  {LANGUAGES.map((l) => (<MenuItem key={l} value={l}>{l || '全部'}</MenuItem>))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 130, flex: { sm: '1 0 auto' } }}>
                <InputLabel>Framework</InputLabel>
                <Select value={framework} label="Framework" onChange={(e) => setFramework(e.target.value)}>
                  {FRAMEWORKS.map((f) => (<MenuItem key={f} value={f}>{f || '全部'}</MenuItem>))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 120, flex: { sm: '1 0 auto' } }}>
                <InputLabel>Type</InputLabel>
                <Select value={type} label="Type" onChange={(e) => setType(e.target.value)}>
                  {TYPES.map((t) => (<MenuItem key={t} value={t}>{t || '全部'}</MenuItem>))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 90, flex: { sm: '0 0 auto' } }}>
                <InputLabel>Top-K</InputLabel>
                <Select value={topK} label="Top-K" onChange={(e) => setTopK(+e.target.value)}>
                  {[5, 10, 20, 50].map((k) => (<MenuItem key={k} value={k}>{k}</MenuItem>))}
                </Select>
              </FormControl>
            </Stack>
          </Collapse>
        </CardContent>
      </Card>

      {loading && <LinearProgress sx={{ borderRadius: 4, mb: 2 }} />}

      {error && (
        <Fade in>
          {error && error.includes('500') || error.includes('429') || error.includes('embed') || error.includes('Embedding') || error.includes('quota') || error.includes('配额') || error.includes('余额') ? (
            <Alert severity="warning" sx={{ mb: 3 }} onClose={() => setError(null)}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                Embedding API 异常 — 搜索功能暂不可用
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {error.length > 200 ? error.slice(0, 200) + '...' : error}
              </Typography>
            </Alert>
          ) : error ? (
            <Card sx={{ mb: 3, border: '1px solid rgba(255,82,82,0.3)' }}>
              <CardContent sx={{ color: 'error.main', p: 3 }}>
                <Typography>{error}</Typography>
              </CardContent>
            </Card>
          ) : null}
        </Fade>
      )}

      {/* Results */}
      {result && (
        <Box>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            找到 {result.count} 条结果
          </Typography>

          <Stack spacing={2}>
            {result.results.map((item, idx) => (
              <Fade in key={item.id} timeout={300 + idx * 80}>
                <Card
                  sx={{
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      borderColor: 'rgba(124,77,255,0.3)',
                      transform: 'translateX(4px)',
                    },
                  }}
                >
                  <CardContent sx={{ p: 3 }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                      <Chip
                        label={item.metadata.domain}
                        size="small"
                        sx={{
                          backgroundColor: alpha(metadataColorMap[item.metadata.domain] || '#7C4DFF', 0.15),
                          color: metadataColorMap[item.metadata.domain] || '#7C4DFF',
                          fontWeight: 600,
                        }}
                      />
                      <Chip label={item.metadata.language} size="small" variant="outlined" />
                      <Chip label={item.metadata.framework} size="small" variant="outlined" />
                      <Chip label={item.metadata.type} size="small" variant="outlined" />
                      <Box sx={{ flex: 1 }} />
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 700,
                          color: item.score > 0.85 ? 'success.main' : item.score > 0.7 ? 'warning.main' : 'text.secondary',
                          backgroundColor: alpha(
                            item.score > 0.85 ? '#69F0AE' : item.score > 0.7 ? '#FFD740' : '#fff',
                            0.1,
                          ),
                          px: 1.5,
                          py: 0.3,
                          borderRadius: 2,
                        }}
                      >
                        {(item.score * 100).toFixed(1)}%
                      </Typography>
                    </Stack>

                    <Typography
                      variant="subtitle1"
                      sx={{ fontWeight: 600, mb: 1 }}
                    >
                      {item.metadata.topic}
                    </Typography>

                    <Box
                      sx={{
                        backgroundColor: alpha('#000', 0.3),
                        borderRadius: 2,
                        p: 2,
                        fontFamily: 'monospace',
                        fontSize: 13,
                        color: 'text.secondary',
                        maxHeight: 120,
                        overflow: 'hidden',
                        position: 'relative',
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        mb: 1.5,
                      }}
                    >
                      {item.content.length > 400
                        ? item.content.slice(0, 400) + '...'
                        : item.content}
                    </Box>

                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: item.metadata.source ? 1 : 0 }}>
                      {item.metadata.tags?.slice(0, 8).map((tag) => (
                        <Chip
                          key={tag}
                          label={tag}
                          size="small"
                          sx={{ fontSize: 11, height: 22, mb: 0.5 }}
                        />
                      ))}
                    </Stack>

                    {item.metadata.source && (
                      <Stack direction="row" spacing={1} alignItems="center">
                        <LinkIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                        <Typography variant="caption" sx={{ color: 'text.secondary', wordBreak: 'break-all' }}>
                          {item.metadata.source}
                        </Typography>
                      </Stack>
                    )}
                  </CardContent>
                </Card>
              </Fade>
            ))}
          </Stack>
        </Box>
      )}

      {!result && !loading && !error && (
        <Card
          sx={{
            textAlign: 'center',
            py: 10,
            background: `radial-gradient(ellipse at center, ${alpha('#7C4DFF', 0.06)} 0%, transparent 70%)`,
          }}
        >
          <SearchIcon sx={{ fontSize: 64, color: 'rgba(255,255,255,0.06)', mb: 2 }} />
          <Typography variant="h6" sx={{ color: 'text.secondary', mb: 1 }}>
            输入查询关键词开始搜索
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            支持自然语言语义检索，可结合领域、语言、框架等维度过滤
          </Typography>
        </Card>
      )}
    </Box>
  );
}
