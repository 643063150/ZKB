import { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  alpha,
  Stack,
  Chip,
} from '@mui/material';
import { Hub as HubIcon } from '@mui/icons-material';
import { getGraph } from '../api/knowledge';
import type { GraphResponse } from '../api/knowledge';

export default function GraphPage() {
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getGraph()
      .then((res) => setGraph(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 1 }}>
        知识图谱
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 4 }}>
        代码级知识关系图谱 — 可视化调用链、继承、依赖关系
      </Typography>

      {/* Placeholder Visualization */}
      <Card
        sx={{
          textAlign: 'center',
          py: 10,
          mb: 4,
          background: `radial-gradient(ellipse at center, ${alpha('#7C4DFF', 0.08)} 0%, transparent 70%)`,
          border: `1px dashed ${alpha('#7C4DFF', 0.2)}`,
        }}
      >
        <Box
          sx={{
            position: 'relative',
            width: 320,
            height: 320,
            mx: 'auto',
            mb: 4,
          }}
        >
          {/* Animated node graph placeholder */}
          <svg width="320" height="320" viewBox="0 0 320 320">
            <defs>
              <radialGradient id="nodeGlow">
                <stop offset="0%" stopColor="#7C4DFF" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#7C4DFF" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Connection lines */}
            {[
              [160, 100, 80, 200],
              [160, 100, 240, 200],
              [160, 100, 160, 260],
              [80, 200, 240, 200],
              [80, 200, 160, 260],
              [240, 200, 160, 260],
            ].map(([x1, y1, x2, y2], i) => (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1.5"
                strokeDasharray={i < 3 ? 'none' : '6,4'}
              />
            ))}

            {/* Nodes */}
            {[
              { cx: 160, cy: 100, r: 28, label: 'API', delay: 0 },
              { cx: 80, cy: 200, r: 22, label: 'DB', delay: 0.5 },
              { cx: 240, cy: 200, r: 24, label: 'FE', delay: 1 },
              { cx: 160, cy: 260, r: 20, label: 'Ops', delay: 1.5 },
            ].map((node, i) => (
              <g key={i}>
                <circle
                  cx={node.cx}
                  cy={node.cy}
                  r={node.r + 12}
                  fill="url(#nodeGlow)"
                  opacity="0.3"
                >
                  <animate
                    attributeName="opacity"
                    values="0.2;0.5;0.2"
                    dur="3s"
                    begin={`${node.delay}s`}
                    repeatCount="indefinite"
                  />
                </circle>
                <circle
                  cx={node.cx}
                  cy={node.cy}
                  r={node.r}
                  fill="none"
                  stroke="#7C4DFF"
                  strokeWidth="2"
                >
                  <animate
                    attributeName="r"
                    values={`${node.r - 2};${node.r + 2};${node.r - 2}`}
                    dur="4s"
                    begin={`${node.delay}s`}
                    repeatCount="indefinite"
                  />
                </circle>
                <circle cx={node.cx} cy={node.cy} r={node.r - 2} fill="#1A1A3A" />
                <text
                  x={node.cx}
                  y={node.cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#B388FF"
                  fontSize="10"
                  fontWeight="600"
                  fontFamily="Inter, sans-serif"
                >
                  {node.label}
                </text>
              </g>
            ))}

            {/* Central hub icon */}
            <foreignObject x="148" y="88" width="24" height="24">
              <HubIcon sx={{ fontSize: 24, color: '#00E5FF' }} />
            </foreignObject>
          </svg>
        </Box>

        <Typography variant="h5" sx={{ color: 'text.primary', mb: 1 }}>
          知识图谱即将上线
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 480, mx: 'auto', lineHeight: 1.8 }}>
          基于 code_context 的关系数据，构建完整的代码级知识图谱。
          支持调用链追溯、影响分析、依赖关系可视化等高级功能。
        </Typography>
      </Card>

      {/* Aggregation Data Preview */}
      <Typography variant="h5" sx={{ mb: 2 }}>
        知识库分布快照
      </Typography>

      {loading ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : graph ? (
        <Stack spacing={3}>
          {([
            ['领域分布', graph.aggregation.domain],
            ['语言分布', graph.aggregation.language],
            ['框架分布', graph.aggregation.framework],
            ['类型分布', graph.aggregation.type],
          ] as const).map(([title, data]) => (
            <Card key={title}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="subtitle2" sx={{ color: 'text.secondary', mb: 2 }}>
                  {title}
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {Object.entries(data)
                    .sort((a, b) => b[1] - a[1])
                    .map(([label, count]) => (
                      <Chip
                        key={label}
                        label={`${label}: ${count}`}
                        variant="outlined"
                        sx={{
                          borderColor: 'rgba(255,255,255,0.08)',
                          backgroundColor: alpha('#7C4DFF', Math.min(count / 200, 0.25)),
                          '&:hover': {
                            borderColor: alpha('#7C4DFF', 0.4),
                          },
                        }}
                      />
                    ))}
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      ) : null}
    </Box>
  );
}
