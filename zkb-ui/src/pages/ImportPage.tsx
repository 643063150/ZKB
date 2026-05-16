import { useState, useRef, useCallback, type DragEvent } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Alert,
  alpha,
  Fade,
  Grow,
  Stack,
  Grid,
  ToggleButtonGroup,
  ToggleButton,
  IconButton,
} from '@mui/material';
import {
  CheckCircle as SuccessIcon,
  Link as UrlIcon,
  GitHub as GithubIcon,
  CloudUpload as UploadIcon,
  FolderOpen as FolderIcon,
  InsertDriveFile as FileIcon,
  ContentPaste as PasteIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { streamImport, streamUpload, detectGitHubSourceType, deleteBatch } from '../api/knowledge';
import type { ImportRequest, ImportResponse, ImportStreamEvent } from '../api/knowledge';
import { translateError } from './errorMessages';
import type { Locale } from './errorMessages';
import ImportProgress from './ImportProgress';

// ── Mode definitions ──────────────────────────────────────────────
type ImportMode = 'url' | 'github' | 'upload' | 'filepath';

interface ModeDef {
  mode: ImportMode;
  label: string;
  enLabel: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  description: string;
  enDescription: string;
  placeholder: string;
}

const modes: ModeDef[] = [
  {
    mode: 'url',
    label: 'URL 导入',
    enLabel: 'URL Import',
    icon: <UrlIcon />,
    color: '#40C4FF',
    bg: 'linear-gradient(135deg, rgba(64,196,255,0.12), rgba(64,196,255,0.02))',
    description: '粘贴任意网页或 Raw 文件链接，系统自动抓取并索引内容',
    enDescription: 'Paste any web page or raw file URL, we fetch and index it',
    placeholder: 'https://raw.githubusercontent.com/user/repo/main/README.md',
  },
  {
    mode: 'github',
    label: 'GitHub 导入',
    enLabel: 'GitHub Import',
    icon: <GithubIcon />,
    color: '#B388FF',
    bg: 'linear-gradient(135deg, rgba(179,136,255,0.12), rgba(179,136,255,0.02))',
    description: '仓库地址 → 克隆全部源码 | blob URL → 导入单个文件',
    enDescription: 'Repo URL → clone all sources | blob URL → single file',
    placeholder: 'https://github.com/gin-gonic/gin',
  },
  {
    mode: 'upload',
    label: '文件上传',
    enLabel: 'File Upload',
    icon: <UploadIcon />,
    color: '#69F0AE',
    bg: 'linear-gradient(135deg, rgba(105,240,174,0.12), rgba(105,240,174,0.02))',
    description: '从本机选择文件直接上传（支持 .md .py .go .java .txt .json .yaml 等）',
    enDescription: 'Select a local file to upload (.md .py .go .java .txt .json .yaml etc.)',
    placeholder: '',
  },
  {
    mode: 'filepath',
    label: '服务器路径',
    enLabel: 'Server Path',
    icon: <FolderIcon />,
    color: '#FFD740',
    bg: 'linear-gradient(135deg, rgba(255,215,64,0.12), rgba(255,215,64,0.02))',
    description: '输入服务器上的文件绝对路径，直接读取并导入',
    enDescription: 'Absolute path to a file on the server, read and indexed directly',
    placeholder: '/root/documents/my-file.py',
  },
];

// ── Main component ─────────────────────────────────────────────────
export default function ImportPage() {
  // Shared state
  const [activeMode, setActiveMode] = useState<ImportMode>('url');
  const [streaming, setStreaming] = useState(false);
  const [streamPromise, setStreamPromise] = useState<Promise<AsyncGenerator<ImportStreamEvent>> | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locale, setLocale] = useState<Locale>('zh');

  // Mode-specific state
  const [urlInput, setUrlInput] = useState('');
  const [githubInput, setGithubInput] = useState('');
  const [filepathInput, setFilepathInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const batchIdRef = useRef<string | null>(null);

  const handleBatchId = useCallback((id: string) => {
    batchIdRef.current = id;
  }, []);

  // ── Helpers ──
  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setStreamPromise(null);
    setStreaming(false);
  }, []);

  const clearFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);

  // ── Handle submit (streaming) ──
  const handleSubmit = () => {
    setError(null);
    setResult(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (activeMode === 'upload') {
        if (!selectedFile) return;
        setStreamPromise(streamUpload(selectedFile, controller.signal));
      } else {
        let source = '';
        let sourceType: ImportRequest['source_type'] = 'url';
        if (activeMode === 'url') { source = urlInput; sourceType = 'url'; }
        else if (activeMode === 'github') {
          source = githubInput;
          sourceType = detectGitHubSourceType(source);
        }
        else if (activeMode === 'filepath') { source = filepathInput; sourceType = 'filepath'; }
        if (!source.trim()) return;
        setStreamPromise(streamImport({ source: source.trim(), source_type: sourceType }, controller.signal));
      }
    } catch (err: any) {
      setError(translateError(err.message || String(err), locale));
    }
  };

  const handleCancel = async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreamPromise(null);
    setStreaming(false);

    const bid = batchIdRef.current;
    batchIdRef.current = null;
    if (bid) {
      try {
        const res = await deleteBatch({ batch_id: bid });
        setError(t(`已取消并回退 ${res.data.deleted_count} 条记录`, `Cancelled and rolled back ${res.data.deleted_count} records`));
      } catch {
        setError(t('导入已取消，但回退失败', 'Import cancelled, but rollback failed'));
      }
    } else {
      setError(t('导入已取消', 'Import cancelled'));
    }
  };

  const handleDone = useCallback((r: ImportResponse) => {
    abortRef.current = null;
    batchIdRef.current = null;
    setResult(r);
    setStreamPromise(null);
    setStreaming(false);
  }, []);

  const handleStreamError = useCallback((msg: string) => {
    abortRef.current = null;
    batchIdRef.current = null;
    setError(msg);
    setStreamPromise(null);
    setStreaming(false);
  }, []);

  const canSubmit = activeMode === 'upload'
    ? !!selectedFile
    : !!(activeMode === 'url' ? urlInput : activeMode === 'github' ? githubInput : filepathInput).trim();

  // ── Drag & drop ──
  const onDragOver = (e: DragEvent) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = (e: DragEvent) => { e.preventDefault(); setDragOver(false); };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setSelectedFile(file);
  };

  // ── Current mode def ──
  const current = modes.find((m) => m.mode === activeMode)!;

  return (
    <Box>
      {/* Header with locale toggle */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Box>
          <Typography variant="h4">{t('知识导入', 'Knowledge Import')}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            {t('支持 URL、GitHub、文件上传、服务器路径四种导入方式', 'URL, GitHub, file upload, and server path import')}
          </Typography>
        </Box>
        <ToggleButtonGroup
          value={locale}
          exclusive
          size="small"
          onChange={(_, v) => v && setLocale(v)}
          sx={{
            '& .MuiToggleButton-root': {
              px: 1.5,
              py: 0.8,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: 13,
              borderColor: 'rgba(255,255,255,0.08)',
              color: 'text.secondary',
              '&.Mui-selected': {
                bgcolor: alpha('#7C4DFF', 0.15),
                color: '#B388FF',
              },
            },
          }}
        >
          <ToggleButton value="zh">中文</ToggleButton>
          <ToggleButton value="en">EN</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      <Grid container spacing={3}>
        {/* ── LEFT: Mode cards + Input ── */}
        <Grid size={{ xs: 12, md: 7 }}>
          {/* Mode selector cards */}
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 3 }}>
            {modes.map((m) => {
              const isActive = activeMode === m.mode;
              return (
                <Card
                  key={m.mode}
                  onClick={() => { setActiveMode(m.mode); reset(); }}
                  sx={{
                    cursor: 'pointer',
                    background: isActive ? m.bg : 'transparent',
                    border: `1px solid ${isActive ? m.color : 'rgba(255,255,255,0.04)'}`,
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    '&:hover': {
                      borderColor: isActive ? m.color : 'rgba(255,255,255,0.12)',
                      transform: 'translateY(-2px)',
                      boxShadow: isActive
                        ? `0 8px 32px ${alpha(m.color, 0.15)}`
                        : '0 4px 16px rgba(0,0,0,0.2)',
                    },
                  }}
                >
                  <CardContent sx={{ p: 2.5, pb: '16px !important' }}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: 3,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: alpha(m.color, isActive ? 0.2 : 0.06),
                          color: isActive ? m.color : 'text.secondary',
                          transition: 'all 0.25s ease',
                        }}
                      >
                        {m.icon}
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="subtitle2"
                          sx={{
                            fontWeight: 700,
                            color: isActive ? m.color : 'text.primary',
                            transition: 'color 0.25s ease',
                            fontSize: 14,
                          }}
                        >
                          {locale === 'zh' ? m.label : m.enLabel}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            color: 'text.secondary',
                            display: 'block',
                            lineHeight: 1.4,
                            mt: 0.2,
                          }}
                        >
                          {locale === 'zh' ? m.description : m.enDescription}
                        </Typography>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
          </Box>

          {/* Active input card */}
          <Grow in key={activeMode} timeout={300}>
            <Card sx={{ border: `1px solid ${alpha(current.color, 0.15)}` }}>
              <CardContent sx={{ p: 4 }}>
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: 3,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: alpha(current.color, 0.15),
                      color: current.color,
                    }}
                  >
                    {current.icon}
                  </Box>
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                      {locale === 'zh' ? current.label : current.enLabel}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {locale === 'zh' ? current.description : current.enDescription}
                    </Typography>
                  </Box>
                </Stack>

                {/* ── URL / GitHub / Filepath: text input ── */}
                {activeMode !== 'upload' && (
                  <TextField
                    fullWidth
                    variant="outlined"
                    placeholder={current.placeholder}
                    value={
                      activeMode === 'url' ? urlInput
                        : activeMode === 'github' ? githubInput
                          : filepathInput
                    }
                    onChange={(e) => {
                      const setter = activeMode === 'url' ? setUrlInput
                        : activeMode === 'github' ? setGithubInput
                          : setFilepathInput;
                      setter(e.target.value);
                      reset();
                    }}
                    sx={{ mb: 3 }}
                    slotProps={{
                      input: {
                        sx: {
                          fontFamily: 'monospace',
                          fontSize: 14,
                          bgcolor: alpha('#fff', 0.02),
                        },
                      },
                    }}
                    label={
                      activeMode === 'url'
                        ? t('网页 / Raw 文件 URL', 'Web page / Raw file URL')
                        : activeMode === 'github'
                          ? t('GitHub Blob URL', 'GitHub Blob URL')
                          : t('服务器文件绝对路径', 'Server file absolute path')
                    }
                  />
                )}

                {/* ── File Upload: drag & drop zone ── */}
                {activeMode === 'upload' && (
                  <Box
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    sx={{
                      border: `2px dashed ${dragOver ? current.color : 'rgba(255,255,255,0.12)'}`,
                      borderRadius: 4,
                      p: 6,
                      mb: 3,
                      textAlign: 'center',
                      cursor: 'pointer',
                      bgcolor: dragOver ? alpha(current.color, 0.08) : 'transparent',
                      transition: 'all 0.25s ease',
                      '&:hover': {
                        borderColor: alpha(current.color, 0.4),
                        bgcolor: alpha(current.color, 0.04),
                      },
                    }}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) { setSelectedFile(f); reset(); }
                      }}
                    />

                    {selectedFile ? (
                      <Stack spacing={2} alignItems="center">
                        <FileIcon sx={{ fontSize: 52, color: current.color }} />
                        <Box>
                          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                            {selectedFile.name}
                          </Typography>
                          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            {(selectedFile.size / 1024).toFixed(1)} KB
                          </Typography>
                        </Box>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          startIcon={<CancelIcon />}
                          onClick={(e) => { e.stopPropagation(); clearFile(); }}
                        >
                          {t('移除文件', 'Remove file')}
                        </Button>
                      </Stack>
                    ) : (
                      <>
                        <UploadIcon
                          sx={{
                            fontSize: 56,
                            color: dragOver ? current.color : 'rgba(255,255,255,0.12)',
                            mb: 2,
                            transition: 'all 0.3s ease',
                          }}
                        />
                        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
                          {dragOver
                            ? t('松开以上传文件', 'Drop file to upload')
                            : t('拖拽文件到此处，或点击选择', 'Drag & drop file here, or click to browse')}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {t('支持 .md .py .go .java .txt .json .yaml .yml .toml .cfg .ini', 'Supports .md .py .go .java .txt .json .yaml .yml .toml .cfg .ini')}
                        </Typography>
                      </>
                    )}
                  </Box>
                )}

                {/* Submit / Cancel buttons */}
                {streaming ? (
                  <Stack direction="row" spacing={2}>
                    <Button
                      variant="contained"
                      size="large"
                      fullWidth
                      disabled
                      sx={{ py: 1.6, fontSize: 16 }}
                      startIcon={<CircularProgress size={20} color="inherit" />}
                    >
                      {t('导入中...', 'Importing...')}
                    </Button>
                    <Button
                      variant="outlined"
                      size="large"
                      color="error"
                      onClick={handleCancel}
                      sx={{ py: 1.6, minWidth: 120, flexShrink: 0 }}
                    >
                      {t('取消', 'Cancel')}
                    </Button>
                  </Stack>
                ) : (
                  <Button
                    variant="contained"
                    size="large"
                    fullWidth
                    sx={{ py: 1.6, fontSize: 16 }}
                    startIcon={activeMode === 'upload' ? <UploadIcon /> : <PasteIcon />}
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                  >
                    {activeMode === 'upload'
                      ? t('上传并导入', 'Upload & Import')
                      : t('开始导入', 'Start Import')}
                  </Button>
                )}
              </CardContent>
            </Card>
          </Grow>
        </Grid>

        {/* ── RIGHT: Progress / Result / Error panel ── */}
        <Grid size={{ xs: 12, md: 5 }}>
          {/* Streaming progress */}
          {streamPromise && (
            <Card sx={{ mb: 3 }}>
              <CardContent sx={{ p: 4 }}>
                <ImportProgress
                  locale={locale}
                  stream={streamPromise}
                  onBatchId={handleBatchId}
                  onDone={handleDone}
                  onError={handleStreamError}
                  onStreaming={setStreaming}
                />
              </CardContent>
            </Card>
          )}

          {error && (
            <Fade in>
              <Alert
                severity="error"
                sx={{
                  mb: 2,
                  '& .MuiAlert-message': { fontWeight: 500 },
                }}
                action={
                  <IconButton size="small" color="inherit" onClick={() => setError(null)}>
                    <CancelIcon fontSize="small" />
                  </IconButton>
                }
              >
                {error}
              </Alert>
            </Fade>
          )}

          {result && (
            <Fade in>
              <Card
                sx={{
                  border: `1px solid ${alpha('#69F0AE', 0.3)}`,
                  overflow: 'hidden',
                  animation: 'slideUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  '@keyframes slideUp': {
                    from: { opacity: 0, transform: 'translateY(24px) scale(0.96)' },
                    to: { opacity: 1, transform: 'translateY(0) scale(1)' },
                  },
                }}
              >
                <Box
                  sx={{
                    py: 2.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1.5,
                    background: `linear-gradient(135deg, ${alpha('#69F0AE', 0.12)}, transparent)`,
                  }}
                >
                  <SuccessIcon sx={{ color: 'success.main' }} />
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    {t('导入成功', 'Import Successful')}
                  </Typography>
                </Box>

                <CardContent sx={{ px: 0, py: 0, '&:last-child': { pb: 0 } }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      px: 4,
                      py: 2.5,
                    }}
                  >
                    <Typography variant="body1" sx={{ color: 'text.secondary' }}>
                      {t('文档数', 'Documents')}
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: 'primary.light' }}>
                      {result.indexed_count}
                    </Typography>
                  </Box>
                  <Box sx={{ mx: 3, borderTop: '1px solid rgba(255,255,255,0.05)' }} />
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      px: 4,
                      py: 2.5,
                    }}
                  >
                    <Typography variant="body1" sx={{ color: 'text.secondary' }}>
                      Chunks
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: 'secondary.light' }}>
                      {result.chunk_count}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Fade>
          )}

          {!streamPromise && !result && !error && (
            <Card
              sx={{
                height: '100%',
                minHeight: 320,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: `radial-gradient(ellipse at center, ${alpha('#7C4DFF', 0.05)} 0%, transparent 70%)`,
                border: `1px dashed ${alpha('#7C4DFF', 0.1)}`,
              }}
            >
              <CardContent sx={{ textAlign: 'center', py: 8 }}>
                <Box
                  sx={{
                    width: 80,
                    height: 80,
                    borderRadius: '50%',
                    mx: 'auto',
                    mb: 3,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: `linear-gradient(135deg, ${alpha('#7C4DFF', 0.1)}, ${alpha('#00E5FF', 0.05)})`,
                  }}
                >
                  <UploadIcon sx={{ fontSize: 36, color: 'rgba(255,255,255,0.15)' }} />
                </Box>
                <Typography variant="subtitle1" sx={{ color: 'text.secondary', mb: 0.5, fontWeight: 500 }}>
                  {t('导入结果将显示在这里', 'Import results will appear here')}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', opacity: 0.5 }}>
                  {t('选择一种导入方式开始', 'Select an import method to begin')}
                </Typography>
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>
    </Box>
  );
}
