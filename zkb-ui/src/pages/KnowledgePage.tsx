import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Box,
  Card,
  Typography,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  LinearProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  TablePagination,
  alpha,
  Tooltip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Snackbar,
} from '@mui/material';
import {
  Visibility as ViewIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { searchKnowledge, deleteKnowledge } from '../api/knowledge';
import type { SearchResultItem } from '../api/knowledge';
import KnowledgeDetail from './KnowledgeDetail';

const DOMAINS = ['', 'Android', 'Backend', 'Database', 'Frontend', 'DevOps'];
const LANGUAGES = ['', 'Kotlin', 'Java', 'Python', 'Go', 'SQL', 'TypeScript', 'Rust', 'Swift'];
const FRAMEWORKS = ['', 'Jetpack', 'Spring', 'Gin', 'Flask', 'FastAPI', 'Django', 'React', 'Vue', 'Next.js', 'Kubernetes', 'Terraform', 'None'];

type SortKey = 'created_at' | 'score' | 'domain' | 'language' | 'framework' | 'type' | 'topic';
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'created_at', label: '导入时间' },
  { key: 'score', label: '相似度' },
  { key: 'domain', label: '领域' },
  { key: 'language', label: '语言' },
  { key: 'framework', label: '框架' },
  { key: 'type', label: '类型' },
  { key: 'topic', label: '主题' },
];

function sortItems(items: SearchResultItem[], key: SortKey, dir: 'asc' | 'desc'): SearchResultItem[] {
  return [...items].sort((a, b) => {
    let va: string | number;
    let vb: string | number;

    if (key === 'score') {
      va = a.score;
      vb = b.score;
    } else if (key === 'created_at') {
      va = a.created_at || '';
      vb = b.created_at || '';
    } else {
      va = a.metadata[key] || '';
      vb = b.metadata[key] || '';
    }

    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

export default function KnowledgePage() {
  const [items, setItems] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [domain, setDomain] = useState('');
  const [language, setLanguage] = useState('');
  const [framework, setFramework] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [detailItem, setDetailItem] = useState<SearchResultItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SearchResultItem | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [snackbar, setSnackbar] = useState<{ msg: string; sev: 'success' | 'error' } | null>(null);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteKnowledge(deleteTarget.id);
      setSnackbar({ msg: '已删除', sev: 'success' });
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
      if (detailItem?.id === deleteTarget.id) setDetailItem(null);
    } catch {
      setSnackbar({ msg: '删除失败', sev: 'error' });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, detailItem]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const filters: any = {};
        if (domain) filters.domain = domain;
        if (language) filters.language = language;
        if (framework) filters.framework = framework;

        const res = await searchKnowledge({
          query: ' ',
          filters: Object.keys(filters).length ? filters : undefined,
          top_k: 100,
        });
        if (!cancelled) { setItems(res.data.results); setApiError(null); }
      } catch (err: any) {
        if (!cancelled) {
          setItems([]);
          const msg = err.response?.data?.error || err.response?.data?.detail || err.message || '';
          setApiError(msg || '未知错误');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [domain, language, framework]);

  const sortedItems = useMemo(
    () => sortItems(items, sortKey, sortDir),
    [items, sortKey, sortDir],
  );

  const pagedItems = useMemo(
    () => sortedItems.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [sortedItems, page, rowsPerPage],
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'score' ? 'desc' : 'asc');
    }
    setPage(0);
  };

  const formatTags = (tags: string[]) => {
    const displayed = tags.slice(0, 3);
    const rest = tags.length - 3;
    return { displayed, rest };
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 1 }}>
        知识管理
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 4 }}>
        浏览和管理知识库中的所有条目
      </Typography>

      {apiError && (
        <Alert severity="warning" sx={{ mb: 3 }} onClose={() => setApiError(null)}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
            Embedding API 异常 — 知识库数据无法加载
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {apiError.length > 200 ? apiError.slice(0, 200) + '...' : apiError}
          </Typography>
        </Alert>
      )}

      {/* Filters + Sort */}
      <Card sx={{ mb: 3 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={2}
          sx={{ p: 2.5, alignItems: 'center' }}
        >
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>领域</InputLabel>
            <Select value={domain} label="领域" onChange={(e) => { setDomain(e.target.value); setPage(0); }}>
              {DOMAINS.map((d) => (<MenuItem key={d} value={d}>{d || '全部'}</MenuItem>))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>语言</InputLabel>
            <Select value={language} label="语言" onChange={(e) => { setLanguage(e.target.value); setPage(0); }}>
              {LANGUAGES.map((l) => (<MenuItem key={l} value={l}>{l || '全部'}</MenuItem>))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>框架</InputLabel>
            <Select value={framework} label="框架" onChange={(e) => { setFramework(e.target.value); setPage(0); }}>
              {FRAMEWORKS.map((f) => (<MenuItem key={f} value={f}>{f || '全部'}</MenuItem>))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>排序</InputLabel>
            <Select
              value={`${sortKey}-${sortDir}`}
              label="排序"
              onChange={(e) => {
                const [k, d] = e.target.value.split('-') as [SortKey, 'asc' | 'desc'];
                setSortKey(k);
                setSortDir(d);
                setPage(0);
              }}
            >
              {SORT_OPTIONS.map((opt) => [
                <MenuItem key={`${opt.key}-desc`} value={`${opt.key}-desc`}>
                  {opt.label} ↓
                </MenuItem>,
                <MenuItem key={`${opt.key}-asc`} value={`${opt.key}-asc`}>
                  {opt.label} ↑
                </MenuItem>,
              ]).flat()}
            </Select>
          </FormControl>

          <Chip
            label={`共 ${items.length} 条`}
            size="small"
            sx={{ ml: 'auto', backgroundColor: alpha('#7C4DFF', 0.15), color: '#B388FF' }}
          />
        </Stack>
      </Card>

      {/* Table */}
      <Card>
        {loading && <LinearProgress />}
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>时间</TableCell>
                <TableCell>Domain</TableCell>
                <TableCell>Language</TableCell>
                <TableCell>Framework</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Topic</TableCell>
                <TableCell>Tags</TableCell>
                <TableCell>Score</TableCell>
                <TableCell align="center">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && !items.length ? (
                <TableRow>
                  <TableCell colSpan={9} sx={{ textAlign: 'center', py: 8 }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>加载中...</Typography>
                  </TableCell>
                </TableRow>
              ) : !items.length ? (
                <TableRow>
                  <TableCell colSpan={9} sx={{ textAlign: 'center', py: 8 }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>暂无数据</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                pagedItems.map((item) => {
                  const { displayed, rest } = formatTags(item.metadata.tags || []);
                  return (
                    <TableRow
                      key={item.id}
                      hover
                      onClick={() => setDetailItem(item)}
                      sx={{
                        cursor: 'pointer',
                        transition: 'background 0.2s ease',
                        '&:hover': { backgroundColor: 'rgba(124,77,255,0.04) !important' },
                      }}
                    >
                      <TableCell>
                        <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                          {item.created_at
                            ? new Date(item.created_at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                            : '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={item.metadata.domain} size="small" color="primary" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Chip label={item.metadata.language} size="small" color="secondary" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Chip label={item.metadata.framework} size="small" sx={{ backgroundColor: alpha('#00E5FF', 0.1), color: '#00E5FF' }} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{item.metadata.type}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500, maxWidth: 160 }} noWrap>
                          {item.metadata.topic}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {displayed.map((tag) => (
                            <Chip key={tag} label={tag} size="small" sx={{ fontSize: 11, height: 22 }} />
                          ))}
                          {rest > 0 && (
                            <Tooltip title={item.metadata.tags.slice(3).join(', ')}>
                              <Chip label={`+${rest}`} size="small" sx={{ fontSize: 11, height: 22, backgroundColor: alpha('#fff', 0.06) }} />
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: item.score > 0.9 ? 'success.main' : 'text.primary' }}>
                          {(item.score * 100).toFixed(1)}%
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Stack direction="row" spacing={0.5} justifyContent="center">
                          <Tooltip title="查看详情">
                            <IconButton
                              size="small"
                              onClick={(e) => { e.stopPropagation(); setDetailItem(item); }}
                              sx={{ color: '#B388FF' }}
                            >
                              <ViewIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="删除">
                            <IconButton
                              size="small"
                              onClick={(e) => { e.stopPropagation(); setDeleteTarget(item); }}
                              sx={{ color: 'text.secondary', '&:hover': { color: 'error.main' } }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={sortedItems.length}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => { setRowsPerPage(+e.target.value); setPage(0); }}
          labelRowsPerPage="每页:"
        />
      </Card>

      <KnowledgeDetail
        item={detailItem}
        open={!!detailItem}
        onClose={() => setDetailItem(null)}
        onDeleted={() => {
          if (detailItem) setItems((prev) => prev.filter((i) => i.id !== detailItem.id));
          setDetailItem(null);
        }}
      />

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: 'text.secondary' }}>
            确定要删除这条知识条目吗？此操作不可撤销。
            {deleteTarget && (
              <Box component="span" sx={{ display: 'block', mt: 1, fontWeight: 600, color: 'text.primary' }}>
                {deleteTarget.metadata.topic}
              </Box>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>取消</Button>
          <Button onClick={handleDelete} color="error" variant="contained" disabled={deleting}>
            {deleting ? '删除中...' : '确认删除'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!snackbar}
        autoHideDuration={3000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snackbar ? (
          <Alert severity={snackbar.sev} onClose={() => setSnackbar(null)} variant="filled">
            {snackbar.msg}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
