import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Chip,
  LinearProgress,
  alpha,
  Fade,
  Stack,
} from '@mui/material';
import {
  Download as FetchIcon,
  ContentCut as ChunkIcon,
  Psychology as ClassifyIcon,
  Transform as EmbedIcon,
  Storage as StoreIcon,
  CheckCircle as DoneIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import type { ImportStreamEvent, StepName, ImportResponse } from '../api/knowledge';
import type { Locale } from './errorMessages';
import { translateError } from './errorMessages';

// ── Step definitions ──────────────────────────────────────────────
interface StepDef {
  step: StepName;
  zhLabel: string;
  enLabel: string;
  icon: React.ReactNode;
  range: [number, number];
}

const steps: StepDef[] = [
  { step: 'fetching',    zhLabel: '获取文档',  enLabel: 'Fetch',    icon: <FetchIcon />,    range: [0, 20] },
  { step: 'chunking',    zhLabel: '分块处理',  enLabel: 'Chunk',    icon: <ChunkIcon />,    range: [20, 40] },
  { step: 'classifying', zhLabel: 'LLM 分类',  enLabel: 'Classify', icon: <ClassifyIcon />, range: [40, 60] },
  { step: 'embedding',   zhLabel: '向量化',    enLabel: 'Embed',    icon: <EmbedIcon />,    range: [60, 80] },
  { step: 'storing',     zhLabel: '写入存储',  enLabel: 'Store',    icon: <StoreIcon />,    range: [80, 100] },
];

function getActiveStepIndex(step: StepName): number {
  if (step === 'error') return -1;
  if (step === 'done') return 4;
  return steps.findIndex((s) => s.step === step);
}

// ── Props ─────────────────────────────────────────────────────────
interface Props {
  locale: Locale;
  stream: Promise<AsyncGenerator<ImportStreamEvent>> | null;
  onBatchId: (id: string) => void;
  onDone: (result: ImportResponse) => void;
  onError: (error: string) => void;
  onStreaming: (streaming: boolean) => void;
}

// ── Component ─────────────────────────────────────────────────────
export default function ImportProgress({ locale, stream, onBatchId, onDone, onError, onStreaming }: Props) {
  const [currentStep, setCurrentStep] = useState<StepName>('fetching');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [meta, setMeta] = useState<ImportStreamEvent['meta'] | null>(null);
  const mountedRef = useRef(true);

  const t = useCallback((zh: string, en: string) => locale === 'zh' ? zh : en, [locale]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!stream) return;

    let cancelled = false;
    onStreaming(true);

    (async () => {
      try {
        const gen = await stream;
        if (!mountedRef.current || cancelled) return;

        for await (const event of gen) {
          if (!mountedRef.current || cancelled) return;
          // Capture batch_id from first event for rollback
          if (event.step === 'batch' && event.meta?.batch_id) {
            onBatchId(event.meta.batch_id);
            continue; // batch event is not a visual step, skip UI update
          }
          setCurrentStep(event.step);
          setProgress(event.progress);
          setMessage(event.message);
          if (event.meta && (event.meta.domain || event.meta.language)) setMeta(event.meta);

          if (event.step === 'done') {
            const match = event.message.match(/(\d+)\s*(?:个)?\s*chunk/);
            const chunks = match ? parseInt(match[1], 10) : 0;
            onDone({ status: 'ok', indexed_count: 1, chunk_count: chunks });
            return;
          }
          if (event.step === 'error') {
            onError(translateError(event.error || event.message, locale));
            return;
          }
        }
      } catch (err: any) {
        if (!mountedRef.current || cancelled) return;
        onError(translateError(err.message || String(err), locale));
      }
    })();

    return () => { cancelled = true; };
  }, [stream]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeIdx = getActiveStepIndex(currentStep);
  const isError = currentStep === 'error';
  const isDone = currentStep === 'done';

  return (
    <Fade in timeout={500}>
      <Box>
        {/* ── 5-Step pipeline ── */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            gap: 0,
            mb: 4,
            position: 'relative',
          }}
        >
          {/* Connecting progress line behind the dots */}
          <Box
            sx={{
              position: 'absolute',
              top: 18,
              left: `${100 / steps.length / 2}%`,
              right: `${100 / steps.length / 2}%`,
              height: 3,
              bgcolor: 'rgba(255,255,255,0.06)',
              borderRadius: 2,
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              top: 18,
              left: `${100 / steps.length / 2}%`,
              height: 3,
              borderRadius: 2,
              background: `linear-gradient(90deg, #7C4DFF, #00E5FF)`,
              transition: 'width 0.4s ease',
              width: isError
                ? `${((steps.length - 1) / steps.length) * 100}%`
                : `${Math.min(Math.max((progress - 5) / 90, 0), 1) * 100}%`,
            }}
          />

          {steps.map((def, idx) => {
            const isCompleted = isDone ? true : idx < activeIdx;
            const isActive = idx === activeIdx && !isDone && !isError;
            const isFailed = isError && idx === Math.max(0, activeIdx);

            let dotColor = 'rgba(255,255,255,0.1)';
            let dotBorder = '2px solid rgba(255,255,255,0.08)';
            let iconColor = 'rgba(255,255,255,0.2)';
            let boxShadow = 'none';

            if (isCompleted) {
              dotColor = alpha('#7C4DFF', 0.2);
              dotBorder = '2px solid #7C4DFF';
              iconColor = '#B388FF';
            }
            if (isActive) {
              dotColor = alpha('#7C4DFF', 0.25);
              dotBorder = '2px solid #B388FF';
              iconColor = '#B388FF';
              boxShadow = `0 0 20px ${alpha('#7C4DFF', 0.4)}`;
            }
            if (isFailed) {
              dotColor = alpha('#FF5252', 0.2);
              dotBorder = '2px solid #FF5252';
              iconColor = '#FF5252';
              boxShadow = `0 0 20px ${alpha('#FF5252', 0.4)}`;
            }

            return (
              <Box key={def.step} sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1 }}>
                <Box
                  sx={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: dotColor,
                    border: dotBorder,
                    boxShadow,
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    mb: 1,
                  }}
                >
                  {isCompleted || isDone ? (
                    <DoneIcon sx={{ fontSize: 18, color: '#7C4DFF' }} />
                  ) : isFailed ? (
                    <ErrorIcon sx={{ fontSize: 18, color: '#FF5252' }} />
                  ) : (
                    <Box sx={{ color: iconColor, '& > svg': { fontSize: 18 } }}>
                      {def.icon}
                    </Box>
                  )}
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    color: isActive ? '#B388FF' : isCompleted ? 'text.secondary' : 'rgba(255,255,255,0.2)',
                    fontWeight: isActive ? 600 : 400,
                    fontSize: 10,
                    textAlign: 'center',
                    lineHeight: 1.3,
                    transition: 'color 0.4s ease',
                  }}
                >
                  {t(def.zhLabel, def.enLabel)}
                </Typography>
              </Box>
            );
          })}
        </Box>

        {/* ── Progress bar + message ── */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
              {message}
            </Typography>
            <Typography variant="body2" sx={{ color: '#B388FF', fontWeight: 700 }}>
              {progress}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={isError ? 0 : progress}
            sx={{
              height: 6,
              borderRadius: 3,
              bgcolor: 'rgba(255,255,255,0.04)',
              '& .MuiLinearProgress-bar': {
                borderRadius: 3,
                background: isError
                  ? '#FF5252'
                  : 'linear-gradient(90deg, #7C4DFF, #00E5FF)',
              },
            }}
          />
        </Box>

        {/* ── Classification meta (shown when classifying completes) ── */}
        {meta && (
          <Fade in>
            <Box
              sx={{
                p: 2.5,
                mb: 3,
                borderRadius: 3,
                bgcolor: alpha('#7C4DFF', 0.06),
                border: `1px solid ${alpha('#7C4DFF', 0.12)}`,
              }}
            >
              <Typography variant="caption" sx={{ color: 'text.secondary', mb: 1.5, display: 'block', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {t('LLM 分类结果', 'LLM Classification')}
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                <Chip label={meta.domain}   size="small" sx={{ bgcolor: alpha('#7C4DFF', 0.15), color: '#B388FF', fontWeight: 600 }} />
                <Chip label={meta.language} size="small" sx={{ bgcolor: alpha('#00E5FF', 0.1), color: '#00E5FF', fontWeight: 600 }} />
                <Chip label={meta.framework} size="small" sx={{ bgcolor: alpha('#69F0AE', 0.1), color: '#69F0AE', fontWeight: 600 }} />
                <Chip label={meta.type}     size="small" variant="outlined" sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
              </Stack>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                {meta.topic}
              </Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                {meta.tags.slice(0, 8).map((tag) => (
                  <Chip key={tag} label={tag} size="small" sx={{ fontSize: 10, height: 20 }} />
                ))}
                {meta.tags.length > 8 && (
                  <Chip label={`+${meta.tags.length - 8}`} size="small" sx={{ fontSize: 10, height: 20, bgcolor: 'rgba(255,255,255,0.04)' }} />
                )}
              </Stack>
            </Box>
          </Fade>
        )}
      </Box>
    </Fade>
  );
}

export { steps };
