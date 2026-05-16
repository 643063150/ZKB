import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Chip,
  Box,
  Stack,
  alpha,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Close as CloseIcon,
  ContentCopy as CopyIcon,
  OpenInNew as LinkIcon,
  Check as CheckIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useState, useEffect } from 'react';
import type { SearchResultItem } from '../api/knowledge';
import { deleteKnowledge } from '../api/knowledge';

interface Props {
  item: SearchResultItem | null;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

export default function KnowledgeDetail({ item, open, onClose, onDeleted }: Props) {
  const [copied, setCopied] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async () => {
    if (!item) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await deleteKnowledge(item.id);
      onDeleted();
    } catch {
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  // Reset confirm state when dialog closes
  const handleClose = () => {
    setConfirmDelete(false);
    onClose();
  };

  useEffect(() => { if (open) setConfirmDelete(false); }, [open]);

  if (!item) return null;

  const allTags = item.metadata.tags || [];
  const hasManyTags = allTags.length > 10;

  const handleCopy = () => {
    navigator.clipboard.writeText(item.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const metaColorMap: Record<string, string> = {
    Backend: '#69F0AE', Frontend: '#40C4FF', Database: '#FFD740',
    DevOps: '#FF6E40', Android: '#EA80FC',
    Go: '#00ADD8', Python: '#FFD740', TypeScript: '#3178C6',
    Java: '#FF5252', Kotlin: '#EA80FC', SQL: '#69F0AE',
    Rust: '#FF6E40', Swift: '#FF5252',
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: '#0E0E2C',
          backgroundImage: 'none',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 4,
        },
      }}
    >
      <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="h6" sx={{ flex: 1, fontWeight: 700 }}>
          {item.metadata.topic}
        </Typography>
        <Tooltip title={copied ? '已复制' : '复制内容'}>
          <IconButton size="small" onClick={handleCopy} sx={{ color: copied ? 'success.main' : 'text.secondary' }}>
            {copied ? <CheckIcon /> : <CopyIcon />}
          </IconButton>
        </Tooltip>
        <IconButton size="small" onClick={handleClose} sx={{ color: 'text.secondary' }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pb: 1 }}>
        {/* Metadata chips */}
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
          <Chip label={`Domain: ${item.metadata.domain}`} size="small"
            sx={{ bgcolor: alpha(metaColorMap[item.metadata.domain] || '#7C4DFF', 0.15), color: metaColorMap[item.metadata.domain] || '#B388FF', fontWeight: 600 }} />
          <Chip label={`Lang: ${item.metadata.language}`} size="small"
            sx={{ bgcolor: alpha(metaColorMap[item.metadata.language] || '#7C4DFF', 0.1), color: metaColorMap[item.metadata.language] || '#B388FF' }} />
          <Chip label={`Framework: ${item.metadata.framework}`} size="small"
            sx={{ bgcolor: alpha('#00E5FF', 0.1), color: '#00E5FF' }} />
          <Chip label={`Type: ${item.metadata.type}`} size="small" variant="outlined" />
          <Chip label={`Status: ${item.metadata.status}`} size="small" variant="outlined" />
          <Chip label={`Score: ${(item.score * 100).toFixed(1)}%`} size="small"
            sx={{ bgcolor: alpha('#7C4DFF', 0.1), color: '#B388FF' }} />
        </Stack>

        {/* Tags — collapsible at 2 lines */}
        <Box sx={{ mb: 2.5 }}>
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 0.5,
              maxHeight: tagsExpanded ? 'none' : '4.5em',
              overflow: 'hidden',
              transition: 'max-height 0.3s ease',
            }}
          >
            {allTags.map((tag) => (
              <Chip key={tag} label={tag} size="small" sx={{ fontSize: 11, height: 22 }} />
            ))}
          </Box>
          {hasManyTags && (
            <Button
              size="small"
              onClick={() => setTagsExpanded(!tagsExpanded)}
              sx={{ mt: 0.5, textTransform: 'none', fontSize: 12, minWidth: 0, px: 1 }}
            >
              {tagsExpanded ? '收起' : `展开全部 ${allTags.length} 个标签`}
            </Button>
          )}
        </Box>

        {/* Timestamps + Source */}
        <Stack direction="row" spacing={2} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
          {item.created_at && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              创建: {new Date(item.created_at).toLocaleString('zh-CN')}
            </Typography>
          )}
          {item.updated_at && item.updated_at !== item.created_at && (
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              更新: {new Date(item.updated_at).toLocaleString('zh-CN')}
            </Typography>
          )}
          {item.metadata.source && (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <LinkIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
              <Typography variant="caption" sx={{ color: 'text.secondary', wordBreak: 'break-all' }}>
                {item.metadata.source}
              </Typography>
            </Stack>
          )}
        </Stack>

        {/* Content */}
        <Box
          sx={{
            bgcolor: alpha('#000', 0.4),
            borderRadius: 3,
            p: 3,
            fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
            fontSize: 13,
            lineHeight: 1.7,
            color: '#C8C8E0',
            maxHeight: 450,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {item.content}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          onClick={handleDelete}
          color="error"
          variant={confirmDelete ? 'contained' : 'outlined'}
          startIcon={<DeleteIcon />}
          disabled={deleting}
          sx={{ borderRadius: 3, mr: 'auto' }}
        >
          {deleting ? '删除中...' : confirmDelete ? '确认删除？' : '删除'}
        </Button>
        <Button onClick={handleClose} variant="outlined" sx={{ borderRadius: 3 }}>
          关闭
        </Button>
        <Button
          onClick={handleCopy}
          variant="contained"
          startIcon={copied ? <CheckIcon /> : <CopyIcon />}
          sx={{ borderRadius: 3 }}
        >
          {copied ? '已复制' : '复制内容'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
